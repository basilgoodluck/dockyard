# Discord DevOps Bot — Architecture Overview

## What This Is

A Discord bot that acts as a personal DevOps assistant. Users connect their VPS servers to the bot and manage Docker containers and Compose stacks directly from Discord slash commands.

---

## Two Separate Pieces

```
YOUR SERVER (e.g. Fly.io)          USER'S VPS
┌────────────────────┐             ┌────────────────────┐
│                    │             │                    │
│    Discord Bot     │ ──HTTPS──▶  │      Agent         │
│    (main app)      │             │  (tiny HTTP server) │
│                    │             │                    │
│  - talks to Discord│             │  - runs .sh scripts│
│  - stores DB       │             │  - talks to Docker │
│  - handles commands│             │  - returns output  │
│                    │             │                    │
└────────────────────┘             └────────────────────┘
```

### The Bot
- Lives on **your** server, deployed once
- Receives slash commands from Discord users
- Stores server configs and credentials in PostgreSQL
- Makes signed HTTPS requests to agents on user VPS servers

### The Agent
- Lives on **each user's VPS**, installed automatically
- A small HTTP server (Node.js)
- Executes `.sh` scripts and returns output
- One agent per VPS

---

## How a Command Flows

```
User types /container restart trading-bot
        │
        ▼
Discord sends interaction to Bot
        │
        ▼
Bot looks up user's VPS config in DB
        │
        ▼
Bot defers Discord reply (buys 15 minutes)
        │
        ▼
Bot sends signed POST to Agent on VPS
POST https://vps-ip:3000/run
{ script: "container-restart", env: { CONTAINER_NAME: "trading-bot" } }
        │
        ▼
Agent verifies HMAC signature
        │
        ▼
Agent runs container-restart.sh with env vars injected
        │
        ▼
Agent returns output to Bot
        │
        ▼
Bot edits deferred Discord reply with result
```

---

## Project Folder Structure

```
discord-devops-bot/
├── src/
│   ├── bot/                  # Discord.js setup, command registration
│   ├── commands/             # Slash command handlers
│   │   ├── server.ts
│   │   ├── container.ts
│   │   └── stack.ts
│   ├── agent/                # Agent HTTP server code
│   │   ├── index.ts
│   │   └── auth.ts           # HMAC signature verification
│   ├── ssh/                  # SSH client for one-time VPS setup
│   ├── db/                   # Prisma ORM
│   └── crypto/               # Credential encryption/decryption
├── scripts/                  # Shell scripts shipped to VPS via SSH
│   ├── container-restart.sh
│   ├── container-start.sh
│   ├── container-stop.sh
│   ├── container-logs.sh
│   ├── container-list.sh
│   ├── stack-up.sh
│   ├── stack-down.sh
│   ├── stack-restart.sh
│   ├── stack-logs.sh
│   └── system-stats.sh
├── prisma/
│   └── schema.prisma
├── docker-compose.yml        # For running the bot itself
└── .env
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Type safety, same language for bot and agent |
| Discord | Discord.js | Standard, well maintained |
| SSH | node-ssh | One-time VPS setup |
| HTTP | Express | Agent server |
| Queue | BullMQ + Redis | Long-running commands, async jobs |
| Database | PostgreSQL + Prisma | Relational, reliable |
| Security | AES-256-GCM | Credential encryption at rest |
| Request signing | HMAC-SHA256 | Bot → Agent trust |

---

## Key Design Decisions

### Why an Agent instead of raw SSH?
Raw SSH means sending shell scripts over the wire for every command. The agent wraps all of that behind a clean HTTP API. SSH is only used once — to install the agent.

### Why shell scripts in the project?
Scripts live in `/scripts` in your repo, versioned with your code. The bot copies them to the VPS during setup. The agent executes them with injected environment variables. This means:
- Scripts are readable and editable in your codebase
- Easy to test manually on a VPS without the bot
- No logic buried inside TypeScript strings

### Why BullMQ?
Discord slash commands have a 3-second response deadline. Commands like `stack up` can take 30+ seconds. BullMQ lets you defer the reply immediately, run the job in the background, and edit the Discord message when done.

---

## Security Model

- All credentials encrypted with AES-256-GCM at rest
- Bot → Agent communication signed with HMAC-SHA256
- Agent rejects requests older than 30 seconds (replay attack prevention)
- Agent exposes constrained API only — no arbitrary shell execution
- Per-user server isolation enforced at DB query level
- Rate limiting per user per command

---

## Documents in This Folder

| File | What it covers |
|---|---|
| `01-ARCHITECTURE.md` | This file — overall system design |
| `02-AGENT.md` | Agent setup, endpoints, script injection |
| `03-DATABASE.md` | Schema, models, relationships |
| `04-SECURITY.md` | Credentials, signing, threat model | 
| `05-COMMANDS.md` | All slash commands and their flows |
| `06-SETUP-FLOW.md` | Step by step: user adds a VPS |