import { NodeSSH } from 'node-ssh'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const AGENT_BINARY = path.resolve('./dist/agent')
const SCRIPTS_DIR = path.resolve('./scripts')
const AGENT_BIN_PATH = '/usr/local/bin/devops-agent'
const AGENT_LIB_PATH = '/usr/local/lib/devops-agent'
const AGENT_SERVICE_PATH = '/etc/systemd/system/devops-agent.service'

const SYSTEMD_TEMPLATE = `[Unit]
Description=DevOps Bot Agent
After=network.target docker.service

[Service]
ExecStart=${AGENT_BIN_PATH}
Environment=AGENT_SECRET=__SECRET__
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`

export interface SSHCredentials {
  host: string
  port?: number
  sshUser: string
  sshPrivateKey?: string
  sshPassword?: string
}

export interface InstallResult {
  agentSecret: string
  dockerVersion: string
}

export async function testConnection(creds: SSHCredentials): Promise<void> {
  const ssh = new NodeSSH()

  await ssh.connect({
    host: creds.host,
    port: creds.port ?? 22,
    username: creds.sshUser,
    privateKey: creds.sshPrivateKey ?? undefined,
    password: creds.sshPassword ?? undefined,
    readyTimeout: 10000
  })

  ssh.dispose()
}

export async function checkDocker(creds: SSHCredentials): Promise<string> {
  const ssh = new NodeSSH()

  await ssh.connect({
    host: creds.host,
    port: creds.port ?? 22,
    username: creds.sshUser,
    privateKey: creds.sshPrivateKey ?? undefined,
    password: creds.sshPassword ?? undefined,
    readyTimeout: 10000
  })

  const result = await ssh.execCommand('docker --version')
  ssh.dispose()

  if (result.code !== 0) {
    throw new Error('Docker is not installed on this server')
  }

  return result.stdout.trim()
}

export async function installAgent(creds: SSHCredentials): Promise<InstallResult> {
  const ssh = new NodeSSH()

  await ssh.connect({
    host: creds.host,
    port: creds.port ?? 22,
    username: creds.sshUser,
    privateKey: creds.sshPrivateKey ?? undefined,
    password: creds.sshPassword ?? undefined,
    readyTimeout: 10000
  })

  // Check Docker first
  const dockerResult = await ssh.execCommand('docker --version')
  if (dockerResult.code !== 0) {
    ssh.dispose()
    throw new Error('Docker is not installed on this server')
  }
  const dockerVersion = dockerResult.stdout.trim()

  // Generate agent secret
  const agentSecret = crypto.randomBytes(32).toString('hex')

  // Upload agent binary
  await ssh.putFile(AGENT_BINARY, AGENT_BIN_PATH)
  await ssh.execCommand(`chmod +x ${AGENT_BIN_PATH}`)

  // Upload shell scripts
  await ssh.execCommand(`mkdir -p ${AGENT_LIB_PATH}`)

  const scripts = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.sh'))

  for (const script of scripts) {
    const local = path.join(SCRIPTS_DIR, script)
    const remote = `${AGENT_LIB_PATH}/${script}`
    await ssh.putFile(local, remote)
    await ssh.execCommand(`chmod +x ${remote}`)
  }

  // Write systemd unit with injected secret
  const unit = SYSTEMD_TEMPLATE.replace('__SECRET__', agentSecret)
  await ssh.execCommand(`cat > ${AGENT_SERVICE_PATH} << 'UNIT'\n${unit}\nUNIT`)

  // Enable and start
  await ssh.execCommand('systemctl daemon-reload')
  await ssh.execCommand('systemctl enable --now devops-agent')

  ssh.dispose()

  return { agentSecret, dockerVersion }
}

export async function syncScripts(creds: SSHCredentials): Promise<void> {
  const ssh = new NodeSSH()

  await ssh.connect({
    host: creds.host,
    port: creds.port ?? 22,
    username: creds.sshUser,
    privateKey: creds.sshPrivateKey ?? undefined,
    password: creds.sshPassword ?? undefined,
    readyTimeout: 10000
  })

  const scripts = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.sh'))

  for (const script of scripts) {
    const local = path.join(SCRIPTS_DIR, script)
    const remote = `${AGENT_LIB_PATH}/${script}`
    await ssh.putFile(local, remote)
    await ssh.execCommand(`chmod +x ${remote}`)
  }

  ssh.dispose()
}

export async function uninstallAgent(creds: SSHCredentials): Promise<void> {
  const ssh = new NodeSSH()

  await ssh.connect({
    host: creds.host,
    port: creds.port ?? 22,
    username: creds.sshUser,
    privateKey: creds.sshPrivateKey ?? undefined,
    password: creds.sshPassword ?? undefined,
    readyTimeout: 10000
  })

  await ssh.execCommand('systemctl stop devops-agent')
  await ssh.execCommand('systemctl disable devops-agent')
  await ssh.execCommand(`rm -f ${AGENT_SERVICE_PATH}`)
  await ssh.execCommand(`rm -f ${AGENT_BIN_PATH}`)
  await ssh.execCommand(`rm -rf ${AGENT_LIB_PATH}`)
  await ssh.execCommand('systemctl daemon-reload')

  ssh.dispose()
}