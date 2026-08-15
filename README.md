# Dockyard CLI

A local CLI tool for managing Docker containers and Compose stacks across
multiple, unrelated VPS servers — regardless of provider (Linode, Contabo,
DigitalOcean, etc). No agent, no bot, no hosted service. Runs entirely on
the user's own machine using their existing SSH access.

## Design principles

- **No server-side component.** The tool never runs anywhere except the
  user's machine. No database, no uptime to maintain, no credentials held
  by the tool author.
- **SSH is the only trust boundary.** Reuses the user's existing SSH keys
  and config — no custom auth, no HMAC signing, no agent install.
- **Servers are independent, not clustered.** No orchestration, no shared
  state between hosts. Each server is just an entry in a config file.
- **Docker Contexts under the hood.** Connections use `ssh://` transport
  to the remote Docker daemon (`docker.DockerClient(base_url="ssh://...")`),
  same mechanism as native `docker context`.

## Install

Distributed as a standalone binary per OS (PyInstaller/Nuitka build via
CI), plus optional `pip install dockyard`.

```bash
curl -sSL https://dockyard.sh/install | sh    # macOS/Linux
```

## Config

Local file, e.g. `~/.dockyard/config.yaml`. References existing SSH keys
by path — never stores key material itself.

```yaml
servers:
  client-a:
    host: 1.2.3.4
    user: root
    ssh_key: ~/.ssh/id_ed25519
  client-b:
    host: 5.6.7.8
    user: deploy
    ssh_key: ~/.ssh/id_ed25519

stacks:
  api:
    server: client-a
    path: /opt/api
  web:
    server: client-b
    path: /srv/web
```

## Commands

### Server management
| Command | Description |
|---|---|
| `dockyard server add` | Prompt for host/user/key, test SSH connection, save to config |
| `dockyard server list` | List configured servers |
| `dockyard server remove <name>` | Remove a server from config |
| `dockyard server test <name>` | Verify SSH + Docker daemon reachability |
| `dockyard server stats <name\|--all>` | CPU, memory, disk usage |

### Containers
| Command | Description |
|---|---|
| `dockyard ps <name\|--all>` | List containers on one or all servers |
| `dockyard start <container> --host <name>` | Start a container |
| `dockyard stop <container> --host <name>` | Stop a container |
| `dockyard restart <container> --host <name>` | Restart a container |
| `dockyard logs <container> --host <name> [--tail N] [--since] [-f/--follow]` | Fetch/tail logs |
| `dockyard inspect <container> --host <name>` | Show container details |
| `dockyard exec <container> --host <name> -- <cmd>` | Run a command inside a running container |
| `dockyard prune <name\|--all>` | Remove dangling images/containers/volumes |

All read commands (`ps`, `stats`, `logs`, `inspect`) support a `--json`
flag for scriptable/pipeable output, not just human-readable tables.

### Stacks (Compose)
| Command | Description |
|---|---|
| `dockyard stack add <name>` | Register a Compose stack (server + path) |
| `dockyard stack list` | List registered stacks |
| `dockyard stack up <name>` | `docker compose up -d` on the stack's server |
| `dockyard stack down <name>` | `docker compose down` |
| `dockyard stack restart <name>` | Restart a stack |
| `dockyard stack logs <name> [--tail N]` | Fetch stack logs |

### Utility
| Command | Description |
|---|---|
| `dockyard config edit` | Open config file in `$EDITOR` |
| `dockyard config path` | Print path to the config file |
| `dockyard doctor` | Check local SSH setup, remote Docker install/version, connectivity per server |
| `dockyard version` / `dockyard --version` | Print tool version |

### Fleet-wide (the actual value-add)
| Command | Description |
|---|---|
| `dockyard ps --all` | Aggregated container list across every server |
| `dockyard logs --grep ERROR --since 10m --all` | Merged, interleaved log stream across servers |
| `dockyard stats --all` | Resource usage across the whole fleet |
| `dockyard drift <stack>` | Diff running config vs. compose file (image tags, env, ports) |

## Non-goals (explicitly out of scope)

- No orchestration or scheduling across servers (that's Kubernetes' job)
- No always-on service, dashboard, or web UI
- No custom credential storage or key management
- No multi-user / RBAC (single operator, their own SSH access)

## Implementation notes

- **Language:** TypeScript (Node.js)
- **CLI framework:** `commander` or `oclif` (subcommands, help text, flags)
- **Docker connection:** `dockerode` via `ssh://user@host` base URL —
  reuses local SSH config/agent, no custom auth code
- **Compose commands:** run via SSH exec (`ssh2` or shelling out to
  system `ssh`), since Compose is CLI-oriented rather than API-oriented
- **Fan-out:** `Promise.all` / a small concurrency-limited pool for
  parallel SSH calls across servers (`--all` flag)
- **Packaging:** Node single executable apps (`--experimental-sea`) or
  `pkg`, per-OS binaries built in CI, attached to GitHub Releases;
  optional npm publish for `npm install -g dockyard` users

## Architecture — the layers you're actually building

Six layers, roughly bottom-up. Each is a discrete, buildable chunk —
useful for sequencing the work.

**1. Transport layer (SSH)**
The foundation everything else sits on. Responsible for: opening SSH
connections using the user's existing keys/config, verifying host keys,
running remote commands, streaming stdout/stderr back, and handling
connection failures/timeouts cleanly. Built with `ssh2` (or shelling out
to the system `ssh` binary — simpler to start, less control).

**2. Docker API layer**
Sits on top of the transport. Uses `dockerode` pointed at
`ssh://user@host` to talk to the remote Docker daemon over the tunnel
the transport layer opened. This is what gives you container list,
start/stop/restart, inspect, logs — all as structured JSON responses
rather than parsed CLI text.

**3. Compose exec layer**
A thinner layer, separate from the Docker API layer, because Compose
itself isn't API-driven. Runs `docker compose up/down/restart/logs` as
remote shell commands via the transport layer, in the stack's configured
directory. Captures output, exit codes.

**4. Config & state layer**
Reads/writes `~/.dockyard/config.yaml` (or OS-appropriate path via an
XDG-style resolver). Defines the schema for servers and stacks, validates
it on load, and is the single source of truth every other layer reads
from. No network calls happen here — pure local file I/O.

**5. Orchestration / fan-out layer**
Where the actual value-add lives. Takes a command (e.g. `ps --all`),
resolves it against the config to a list of target servers, dispatches
to layers 2/3 in parallel with a concurrency cap, collects results
(including partial failures — one dead server shouldn't kill the whole
batch), and merges/sorts output (e.g. interleaving logs by timestamp
across hosts).

**6. CLI / presentation layer**
The `commander`/`oclif` command tree, flag parsing, help text, and
output formatting (tables, colorized status, `--json` for scripting).
This is the only layer that talks to `stdout` directly — everything
below it returns structured data, not printed text, so output format
can change without touching logic.

```
┌─────────────────────────────┐
│ 6. CLI / presentation        │  commander/oclif, tables, --json
├─────────────────────────────┤
│ 5. Orchestration / fan-out    │  parallel dispatch, merge results
├─────────────────────────────┤
│ 4. Config & state             │  ~/.dockyard/config.yaml
├───────────────┬───────────────┤
│ 2. Docker API  │ 3. Compose exec │  dockerode        │ ssh exec
├───────────────┴───────────────┤
│ 1. Transport (SSH)             │  ssh2 / system ssh
└─────────────────────────────┘
```

## Build order (suggested)

1. Transport layer — get a raw SSH command running on a remote box from
   your local machine, output captured correctly
2. Config layer — load/validate a hardcoded `config.yaml`, no CLI yet
3. Docker API layer — `dockerode` over `ssh://`, get `docker ps`
   equivalent working for one server
4. CLI layer (thin) — wire `dockyard ps <server>` end to end for a
   single server, prove the whole vertical slice works
5. Compose exec layer — `stack up`/`down`/`logs` for one server
6. Orchestration layer — add `--all`, parallelize, handle partial
   failures
7. Packaging — binary build + install script, once functionality is
   stable enough to be worth distributing


dockyard/
├── src/
│   ├── cli/                     # Layer 6: CLI / presentation
│   │   ├── index.ts             # entrypoint, registers all commands
│   │   └── commands/
│   │       ├── server.ts        # server add/list/remove/test/stats
│   │       ├── container.ts     # ps/start/stop/restart/logs/inspect/exec/prune
│   │       ├── stack.ts         # stack add/list/up/down/restart/logs
│   │       ├── fleet.ts         # ps --all, logs --all, stats --all, drift
│   │       └── utility.ts       # config, doctor, version
│   │
│   ├── orchestration/           # Layer 5: fan-out
│   │   ├── dispatch.ts          # resolves target servers, runs in parallel
│   │   └── merge.ts             # interleaves/sorts results (e.g. logs by timestamp)
│   │
│   ├── config/                  # Layer 4: config & state
│   │   ├── schema.ts            # zod/io-ts schema for config.yaml
│   │   ├── load.ts              # read + validate config
│   │   ├── paths.ts             # OS-appropriate config path resolver (XDG-style)
│   │   └── write.ts             # save config back to disk
│   │
│   ├── docker/                  # Layer 2: Docker API
│   │   └── client.ts            # dockerode wrapper, ssh:// connection factory
│   │
│   ├── compose/                 # Layer 3: Compose exec
│   │   └── exec.ts              # runs `docker compose ...` remotely via SSH
│   │
│   ├── transport/                # Layer 1: SSH
│   │   ├── ssh.ts                # connection handling, host key verification
│   │   └── exec-remote.ts        # run arbitrary remote command, stream output
│   │
│   └── types/
│       └── index.ts              # shared TS types (Server, Stack, CommandResult, etc)
│
├── scripts/
│   ├── install.sh                 # unix installer
│   └── install.ps1                # windows installer
│
├── .github/
│   └── workflows/
│       ├── build.yml              # build binaries per OS
│       └── release.yml            # cut GitHub release, attach binaries
│
├── test/
│   └── ...                        # mirrors src/ structure
│
├── package.json
├── tsconfig.json
└── README.md
