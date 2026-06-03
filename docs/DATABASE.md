# 03 — Database Schema

## Overview

PostgreSQL via Prisma ORM. The schema is intentionally simple for V1.

---

## schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Discord user who has connected servers
model User {
  id          String    @id                  // Discord user ID
  createdAt   DateTime  @default(now())
  servers     Server[]
}

// A VPS server connected by a user
model Server {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])

  name          String                        // friendly name, e.g. "my-vps"
  host          String                        // IP or domain
  port          Int       @default(22)        // SSH port (used only at install)
  sshUser       String                        // e.g. "root" or "ubuntu"

  agentPort     Int       @default(3000)
  agentSecret   String                        // AES-256-GCM encrypted HMAC secret

  sshPrivateKey String?                       // encrypted, nullable after agent installed
  sshPassword   String?                       // encrypted, nullable after agent installed

  isConnected   Boolean   @default(false)     // agent health check status
  lastSeen      DateTime?

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  stacks        Stack[]
  commandLogs   CommandLog[]

  @@index([userId])
}

// A Docker Compose stack registered on a server
model Stack {
  id          String    @id @default(cuid())
  serverId    String
  server      Server    @relation(fields: [serverId], references: [id], onDelete: Cascade)

  name        String                          // friendly name, e.g. "trading-bot"
  path        String                          // path on VPS, e.g. /opt/trading-bot

  createdAt   DateTime  @default(now())

  @@unique([serverId, name])
  @@index([serverId])
}

// Audit log of every command run
model CommandLog {
  id          String    @id @default(cuid())
  serverId    String
  server      Server    @relation(fields: [serverId], references: [id], onDelete: Cascade)

  userId      String                          // who ran it
  command     String                          // e.g. "container restart"
  args        Json                            // e.g. { containerName: "trading-bot" }
  output      String?                         // truncated stdout/stderr
  success     Boolean
  duration    Int                             // milliseconds

  createdAt   DateTime  @default(now())

  @@index([serverId])
  @@index([userId])
}
```

---

## Key Design Notes

**User ID is Discord's snowflake ID** — no separate auth needed, Discord handles identity.

**Credentials are always encrypted** — `agentSecret`, `sshPrivateKey`, and `sshPassword` are encrypted with AES-256-GCM before being stored. The master key lives in your environment, never the database.

**SSH credentials are nullable** — after the agent is installed, you can null out the SSH credentials. The agent secret is all you need day-to-day. Give users the option to remove SSH access entirely.

**Stack paths are stored per server** — when a user registers a stack with `/stack add`, they provide the name and path. That path gets passed as `STACK_PATH` env var when running stack scripts.

**CommandLog is append-only** — never update or delete log entries. This is your audit trail.

---

## Queries Worth Noting

**Get all servers for a user (always scope to userId):**
```typescript
const servers = await prisma.server.findMany({
  where: { userId: interaction.user.id }
})
```

**Get a specific server, asserting ownership:**
```typescript
const server = await prisma.server.findFirst({
  where: {
    id: serverId,
    userId: interaction.user.id   // CRITICAL: always include this
  }
})

if (!server) {
  return interaction.editReply('Server not found.')
}
```

Never query a server by ID alone. Always include `userId` in the where clause. This prevents user A from accessing user B's servers.