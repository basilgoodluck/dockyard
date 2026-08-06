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
| `dockyard logs <container> --host <name> [--tail N] [--since]` | Fetch logs |
| `dockyard inspect <container> --host <name>` | Show container details |

### Stacks (Compose)
| Command | Description |
|---|---|
| `dockyard stack add <name>` | Register a Compose stack (server + path) |
| `dockyard stack list` | List registered stacks |
| `dockyard stack up <name>` | `docker compose up -d` on the stack's server |
| `dockyard stack down <name>` | `docker compose down` |
| `dockyard stack restart <name>` | Restart a stack |
| `dockyard stack logs <name> [--tail N]` | Fetch stack logs |

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

- **Language:** Python
- **CLI framework:** `typer` (subcommands, help text, flags)
- **Docker connection:** `docker` SDK (`docker-py`) via `ssh://user@host`
  base URL — reuses local SSH config/agent, no custom auth code
- **Compose commands:** run via SSH exec (`subprocess`/`paramiko`), since
  Compose is CLI-oriented rather than API-oriented
- **Fan-out:** `concurrent.futures.ThreadPoolExecutor` for parallel SSH
  calls across servers (`--all` flag)
- **Packaging:** PyInstaller/Nuitka per-OS binaries built in CI, attached
  to GitHub Releases; optional PyPI publish for `pip install` users
