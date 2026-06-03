# 04 — Security

## Threat Model

The main things that can go wrong:

1. Stored credentials get leaked from the database
2. An attacker intercepts bot → agent communication
3. User A accesses user B's servers
4. Command injection via user-supplied input
5. Replay attacks on agent requests
6. Someone spams commands and hammers a VPS

---

## 1. Credential Encryption at Rest

All sensitive fields are encrypted with AES-256-GCM before hitting the database.

```typescript
import crypto from 'crypto'

const MASTER_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex') // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Store as: iv:tag:ciphertext (all hex)
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

export function decrypt(stored: string): string {
  const [ivHex, tagHex, encHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}
```

**ENCRYPTION_KEY** is a 32-byte random hex string. It lives in your environment variables, never in the database or codebase.

Generate one:
```bash
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

---

## 2. Bot → Agent Request Signing

Every request from the bot to an agent is signed with HMAC-SHA256.

**Bot side (signing):**
```typescript
function signRequest(secret: string, body: object): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = crypto
    .createHmac('sha256', secret)
    .update(timestamp + JSON.stringify(body))
    .digest('hex')

  return {
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json'
  }
}
```

**Agent side (verifying):**
```typescript
function verifySignature(req: Request): boolean {
  const timestamp = req.headers['x-timestamp'] as string
  const signature = req.headers['x-signature'] as string

  // Reject stale requests (replay attack prevention)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp)
  if (age > 30 || age < 0) return false

  const expected = crypto
    .createHmac('sha256', process.env.AGENT_SECRET)
    .update(timestamp + JSON.stringify(req.body))
    .digest('hex')

  // Timing-safe comparison
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
```

---

## 3. Per-User Server Isolation

Always scope database queries to the requesting user's ID. Never query by server ID alone.

```typescript
// ✅ Correct
const server = await prisma.server.findFirst({
  where: { id: serverId, userId: interaction.user.id }
})

// ❌ Wrong — anyone who knows the server ID can access it
const server = await prisma.server.findFirst({
  where: { id: serverId }
})
```

---

## 4. Command Injection Prevention

User input (container names, stack names) is passed as environment variables to shell scripts — never interpolated into shell strings.

```typescript
// ✅ Correct — input goes into env vars
execSync(`bash ${scriptPath}`, {
  env: { ...process.env, CONTAINER_NAME: userInput }
})

// ❌ Wrong — direct interpolation
execSync(`docker restart ${userInput}`)
```

Also validate input against known values where possible:

```typescript
// Validate container name exists before running command
const containers = await getContainerList(server)
if (!containers.includes(containerName)) {
  return interaction.editReply(`Container "${containerName}" not found.`)
}
```

---

## 5. Rate Limiting

Per-user rate limiting using BullMQ or a simple in-memory map:

```typescript
const rateLimits = new Map<string, number>()

function checkRateLimit(userId: string, command: string): boolean {
  const key = `${userId}:${command}`
  const last = rateLimits.get(key) || 0
  const now = Date.now()

  if (now - last < 5000) return false  // 5 second cooldown per command per user

  rateLimits.set(key, now)
  return true
}
```

For production, use Redis so rate limits survive bot restarts.

---

## 6. Agent Runs as Limited User

Don't run the agent as root. Create a dedicated user with access only to Docker:

```bash
# On the VPS at install time
useradd -r -s /bin/false devops-agent
usermod -aG docker devops-agent
```

Update the systemd unit:
```ini
[Service]
User=devops-agent
ExecStart=/usr/local/bin/devops-agent
```

---

## 7. HTTPS for Agent

The agent should run behind HTTPS. Options:

- **Self-signed cert** — bot pins the cert fingerprint at install time
- **Cloudflare Tunnel** — zero config, no port exposure, recommended
- **Nginx reverse proxy with Let's Encrypt** — if the VPS has a domain

For V1, self-signed cert with fingerprint pinning is the simplest approach.

---

## Security Checklist

- [ ] `ENCRYPTION_KEY` in environment, never in codebase
- [ ] All credentials encrypted before DB insert
- [ ] All DB queries scoped to `userId`
- [ ] Agent validates HMAC on every request
- [ ] Agent rejects requests older than 30 seconds
- [ ] Script names whitelisted on agent before execution
- [ ] User input passed as env vars, never interpolated
- [ ] Rate limiting per user per command
- [ ] Agent runs as non-root user
- [ ] Bot → Agent over HTTPS
- [ ] Audit log (CommandLog) written for every command