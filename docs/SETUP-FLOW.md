# 06 — Setup Flow (User Adds a VPS)

## The Full Flow

This is what happens step by step when a user runs `/server add` for the first time.

---

## Step 1: User Runs /server add

Discord shows a modal or options:
- Server name (e.g. "my-vps")
- Host (IP or domain)
- SSH user (e.g. root)
- SSH private key or password

Bot defers the reply immediately.

---

## Step 2: Bot Validates Input

```typescript
// Basic validation
if (!isValidHost(host)) return interaction.editReply('Invalid host.')
if (!isValidUsername(sshUser)) return interaction.editReply('Invalid SSH user.')
```

---

## Step 3: Bot Tests SSH Connection

```typescript
const ssh = new NodeSSH()

try {
  await ssh.connect({
    host,
    username: sshUser,
    privateKey: sshPrivateKey || undefined,
    password: sshPassword || undefined,
    readyTimeout: 10000
  })
} catch (err) {
  return interaction.editReply(`❌ Could not connect via SSH: ${err.message}`)
}
```

---

## Step 4: Bot Checks Docker is Installed

```typescript
const result = await ssh.execCommand('docker --version')

if (result.code !== 0) {
  return interaction.editReply('❌ Docker is not installed on this server.')
}
```

---

## Step 5: Bot Installs the Agent

```typescript
// Generate a secret for this server
const agentSecret = crypto.randomBytes(32).toString('hex')

// Upload the agent binary
await ssh.putFile('./dist/agent', '/usr/local/bin/devops-agent')
await ssh.execCommand('chmod +x /usr/local/bin/devops-agent')

// Upload all shell scripts
const scripts = fs.readdirSync('./scripts')
await ssh.execCommand('mkdir -p /usr/local/lib/devops-agent')

for (const script of scripts) {
  await ssh.putFile(`./scripts/${script}`, `/usr/local/lib/devops-agent/${script}`)
  await ssh.execCommand(`chmod +x /usr/local/lib/devops-agent/${script}`)
}

// Write systemd unit with injected secret
const unitFile = SYSTEMD_TEMPLATE.replace('__SECRET__', agentSecret)
await ssh.execCommand(`cat > /etc/systemd/system/devops-agent.service << 'EOF'\n${unitFile}\nEOF`)

// Enable and start
await ssh.execCommand('systemctl daemon-reload')
await ssh.execCommand('systemctl enable --now devops-agent')
```

---

## Step 6: Bot Verifies Agent is Running

```typescript
// Wait a moment for the service to start
await new Promise(resolve => setTimeout(resolve, 2000))

const health = await callAgent({ host, agentSecret, agentPort: 3000 }, 'health')

if (!health.ok) {
  return interaction.editReply('❌ Agent installed but not responding. Check server logs.')
}
```

---

## Step 7: Bot Saves to Database

```typescript
await prisma.server.create({
  data: {
    userId: interaction.user.id,
    name: serverName,
    host,
    port: 22,
    sshUser,
    sshPrivateKey: sshPrivateKey ? encrypt(sshPrivateKey) : null,
    sshPassword: sshPassword ? encrypt(sshPassword) : null,
    agentSecret: encrypt(agentSecret),
    agentPort: 3000,
    isConnected: true,
    lastSeen: new Date()
  }
})
```

---

## Step 8: Bot Closes SSH and Responds

```typescript
ssh.dispose()

await interaction.editReply(
  `✅ **${serverName}** connected successfully!\n` +
  `Agent is running on port 3000.\n` +
  `Docker version: ${dockerVersion}\n\n` +
  `You can now use /container and /stack commands.`
)
```

---

## After Setup

The SSH connection is closed and no longer needed for day-to-day operations. All subsequent commands go through the agent over HTTPS.

SSH credentials can optionally be deleted from the database at this point — give the user a `/server remove-ssh-credentials` command if they want to go fully agent-only.

---

## Error States to Handle

| Situation | Response |
|---|---|
| SSH connection refused | Check host/port, server may be down |
| Auth failed | Wrong credentials |
| Docker not found | Ask user to install Docker first |
| Agent port already in use | Configure a different port |
| Agent not responding after install | SSH back in and check `journalctl -u devops-agent` |
| Server already added | Check by host, prevent duplicates |