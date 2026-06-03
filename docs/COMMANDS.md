# 05 — Commands Reference

## Server Commands

### /server add
Adds a new VPS. Triggers the full install flow.

**Options:**
- `name` — friendly name (e.g. "my-vps")
- `host` — IP address or domain
- `ssh-user` — SSH username (e.g. root, ubuntu)
- `ssh-key` — private key (modal/file upload) OR
- `ssh-password` — password

**Flow:**
1. Bot stores encrypted credentials
2. Bot SSHs in and installs agent
3. Bot copies `.sh` scripts to VPS
4. Bot verifies `/health` responds
5. Bot confirms success in Discord

---

### /server list
Lists all VPS servers connected by the user.

**Output example:**
```
Your Servers
────────────────────────────────
✅  my-vps        192.168.1.1    Last seen: 2 mins ago
❌  old-server    10.0.0.5       Last seen: 3 days ago
```

---

### /server remove
Removes a server from the bot. Optionally uninstalls the agent.

**Options:**
- `name` — server to remove
- `uninstall-agent` — boolean, default true

---

### /server info
Shows details about a server.

**Output:** host, agent status, Docker version, number of containers, registered stacks.

---

### /server stats
Shows system stats from the VPS.

**Output:** CPU usage, memory usage, disk usage (runs `system-stats.sh`).

---

### /server sync
Re-pushes the latest `.sh` scripts from the bot to the VPS agent. Run this after updating scripts.

---

## Container Commands

### /container list
Lists all Docker containers on a server.

**Options:**
- `server` — which server (autocomplete from user's servers)
- `all` — include stopped containers (default: running only)

**Output example:**
```
Containers on my-vps
────────────────────────────────────────
🟢  trading-bot     Up 2 days
🟢  nginx           Up 5 days
🔴  old-service     Exited (1) 3 days ago
```

---

### /container start
Starts a stopped container.

**Options:**
- `server` — which server
- `name` — container name (autocomplete from running containers)

---

### /container stop
Stops a running container.

**Options:**
- `server` — which server
- `name` — container name

---

### /container restart
Restarts a container.

**Options:**
- `server` — which server
- `name` — container name

---

### /container logs
Returns recent logs from a container.

**Options:**
- `server` — which server
- `name` — container name
- `lines` — number of lines (default: 50, max: 200)

**Output:** logs in a Discord code block, truncated if too long.

---

### /container inspect
Returns container details (image, ports, volumes, env vars — excluding sensitive ones).

---

## Stack Commands

### /stack add
Registers a Docker Compose stack on a server.

**Options:**
- `server` — which server
- `name` — friendly name (e.g. "trading-bot")
- `path` — absolute path on VPS (e.g. /opt/trading-bot)

Bot verifies the path exists and contains a `docker-compose.yml` before saving.

---

### /stack list
Lists all registered stacks for a server.

**Output example:**
```
Stacks on my-vps
────────────────────────────────
trading-bot    /opt/trading-bot
monitoring     /opt/monitoring
```

---

### /stack up
Runs `docker compose up -d` in the stack directory.

**Options:**
- `server` — which server
- `name` — stack name

---

### /stack down
Runs `docker compose down`.

**Options:**
- `server` — which server
- `name` — stack name

---

### /stack restart
Runs `docker compose down` then `docker compose up -d`.

---

### /stack logs
Returns recent logs from the entire stack.

**Options:**
- `server` — which server
- `name` — stack name
- `lines` — number of lines (default: 50)

---

## Command Handling Pattern

All commands follow the same pattern to handle Discord's 3-second timeout:

```typescript
async function handleContainerRestart(interaction: ChatInputCommandInteraction) {
  // 1. Defer immediately — buys 15 minutes
  await interaction.deferReply()

  // 2. Validate inputs and fetch server
  const serverName = interaction.options.getString('server', true)
  const containerName = interaction.options.getString('name', true)

  const server = await prisma.server.findFirst({
    where: { name: serverName, userId: interaction.user.id }
  })

  if (!server) {
    return interaction.editReply('Server not found.')
  }

  // 3. Execute via agent
  const result = await callAgent(server, 'container-restart', {
    CONTAINER_NAME: containerName
  })

  // 4. Log it
  await prisma.commandLog.create({
    data: {
      serverId: server.id,
      userId: interaction.user.id,
      command: 'container restart',
      args: { containerName },
      output: result.output,
      success: result.success,
      duration: result.duration
    }
  })

  // 5. Edit the deferred reply
  if (result.success) {
    await interaction.editReply(`✅ Restarted \`${containerName}\`\n\`\`\`\n${result.output}\n\`\`\``)
  } else {
    await interaction.editReply(`❌ Failed to restart \`${containerName}\`\n\`\`\`\n${result.output}\n\`\`\``)
  }
}
```