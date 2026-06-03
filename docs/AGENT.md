# 02 — The Agent

## What It Is

A small Node.js/Express HTTP server that lives on the user's VPS. It receives signed requests from the bot, runs the appropriate shell script, and returns the output. It does nothing else.

---

## Installation Flow

The agent is installed **once** when a user runs `/server add`. The bot:

1. SSHs into the user's VPS
2. Copies the agent binary and all `.sh` scripts from the bot's codebase
3. Writes a systemd unit file
4. Starts the agent service
5. Verifies `/health` responds
6. Stores the generated secret in the database (encrypted)
7. Closes the SSH connection — SSH is no longer needed

---

## Agent Directory on VPS

```
/usr/local/bin/devops-agent          ← compiled agent binary
/usr/local/lib/devops-agent/
  ├── container-restart.sh
  ├── container-start.sh
  ├── container-stop.sh
  ├── container-logs.sh
  ├── container-list.sh
  ├── stack-up.sh
  ├── stack-down.sh
  ├── stack-restart.sh
  ├── stack-logs.sh
  └── system-stats.sh
/etc/devops-agent/
  └── config.yml                     ← agent config
/etc/systemd/system/
  └── devops-agent.service           ← systemd unit
```

---

## config.yml

```yaml
port: 3000
scripts_dir: /usr/local/lib/devops-agent
log_level: info
```

The secret is NOT stored in config.yml — it lives in the environment via systemd.

---

## systemd Unit File

```ini
[Unit]
Description=DevOps Bot Agent
After=network.target docker.service

[Service]
ExecStart=/usr/local/bin/devops-agent
Environment=AGENT_SECRET=__SECRET_INJECTED_AT_INSTALL__
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The bot generates the secret, injects it here, and stores it encrypted in the database.

---

## API Endpoints

```
GET  /health                         → liveness check
POST /run                            → execute a script (main endpoint)
GET  /containers                     → list containers (lightweight, no script)
GET  /system/stats                   → CPU, memory, disk
```

All endpoints except `/health` require a valid HMAC signature.

---

## The /run Endpoint

This is the main endpoint. The bot sends the script name and environment variables.

**Request:**
```json
POST /run
{
  "script": "container-restart",
  "env": {
    "CONTAINER_NAME": "trading-bot"
  }
}
```

**Agent logic:**
```typescript
app.post('/run', (req, res) => {
  const { script, env } = req.body

  // Whitelist check — never allow arbitrary script names
  const allowed = ['container-restart', 'container-start', 'container-stop', 
                   'container-logs', 'stack-up', 'stack-down', 'stack-restart',
                   'stack-logs', 'system-stats']

  if (!allowed.includes(script)) {
    return res.status(400).json({ error: 'Unknown script' })
  }

  const scriptPath = `/usr/local/lib/devops-agent/${script}.sh`

  try {
    const output = execSync(`bash ${scriptPath}`, {
      env: { ...process.env, ...env },
      timeout: 60000
    }).toString()

    res.json({ success: true, output })
  } catch (err) {
    res.json({ success: false, output: err.stderr?.toString() || err.message })
  }
})
```

---

## HMAC Signature Verification

Every request from the bot includes two headers:

```
X-Timestamp: 1717430000
X-Signature: <hmac-sha256 of timestamp + request body>
```

Agent verifies:

```typescript
function verifySignature(req: Request): boolean {
  const timestamp = req.headers['x-timestamp'] as string
  const signature = req.headers['x-signature'] as string
  const secret = process.env.AGENT_SECRET

  // Reject requests older than 30 seconds
  const age = Date.now() / 1000 - parseInt(timestamp)
  if (age > 30) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + JSON.stringify(req.body))
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )
}
```

---

## Shell Scripts

Scripts live in `/scripts` in your project, get copied to the VPS at install time, and receive all their inputs via environment variables. No user input ever touches the script path or structure.

### container-restart.sh
```bash
#!/bin/bash
set -e
docker restart "$CONTAINER_NAME"
echo "Restarted $CONTAINER_NAME"
```

### container-logs.sh
```bash
#!/bin/bash
set -e
LINES=${LOG_LINES:-50}
docker logs --tail "$LINES" "$CONTAINER_NAME" 2>&1
```

### stack-up.sh
```bash
#!/bin/bash
set -e
cd "$STACK_PATH"
docker compose up -d
echo "Stack started at $STACK_PATH"
```

### stack-logs.sh
```bash
#!/bin/bash
set -e
LINES=${LOG_LINES:-50}
cd "$STACK_PATH"
docker compose logs --tail "$LINES" 2>&1
```

### system-stats.sh
```bash
#!/bin/bash
echo "=== CPU ==="
top -bn1 | grep "Cpu(s)"
echo "=== Memory ==="
free -h
echo "=== Disk ==="
df -h /
```

---

## Updating Scripts

When you update a `.sh` file in your project, you need to push it to VPS agents. Two approaches:

**Manual push** — bot command to re-sync scripts to a specific server:
```
/server sync
```

**Auto push on bot deploy** — bot checks script checksums on startup and pushes updates to all connected servers.

The second approach is cleaner for production.