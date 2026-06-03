# Dockyard

A Discord bot that lets you manage Docker containers and Compose stacks on your VPS servers directly from slash commands.

## How it works

Dockyard has two parts:

- **Bot** — runs on your server, receives Discord slash commands, talks to your VPS agents
- **Agent** — a small HTTP server installed on each VPS, executes shell scripts, returns output

SSH is only used once to install the agent. After that, all communication goes over HTTPS with HMAC-signed requests.

## Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- A Discord application with bot token ([Discord Developer Portal](https://discord.com/developers/applications))

## Setup

1. Clone the repo and install dependencies

```bash
npm install
```

2. Copy the example env file and fill it in

```bash
cp .env.example .env
```

3. Run database migrations

```bash
npx prisma migrate dev
```

4. Register Discord slash commands

```bash
npm run commands:register
```

5. Start the bot

```bash
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM encryption |

## Commands

### Server management
| Command | Description |
|---|---|
| `/server add` | Connect a new VPS and install the agent |
| `/server list` | List all connected servers |
| `/server remove` | Remove a server |
| `/server info` | Show server details and agent status |
| `/server stats` | CPU, memory, disk usage |
| `/server sync` | Re-push latest scripts to a server |

### Containers
| Command | Description |
|---|---|
| `/container list` | List containers on a server |
| `/container start` | Start a container |
| `/container stop` | Stop a container |
| `/container restart` | Restart a container |
| `/container logs` | Fetch recent logs |
| `/container inspect` | Show container details |

### Stacks
| Command | Description |
|---|---|
| `/stack add` | Register a Compose stack |
| `/stack list` | List registered stacks |
| `/stack up` | Run `docker compose up -d` |
| `/stack down` | Run `docker compose down` |
| `/stack restart` | Restart a stack |
| `/stack logs` | Fetch recent stack logs |

## Project Structure

```
src/
  bot/          Discord.js setup and command registration
  commands/     Slash command handlers
  agent/        Agent HTTP server
  ssh/          One-time VPS setup via SSH
  db/           Prisma client
  crypto/       Credential encryption
scripts/        Shell scripts copied to VPS agents
prisma/         Database schema
```

## Security

- SSH credentials are encrypted at rest with AES-256-GCM
- Bot-to-agent requests are signed with HMAC-SHA256
- Agent rejects requests older than 30 seconds
- Agent only executes whitelisted scripts — no arbitrary shell execution
- All DB queries are scoped to the requesting user