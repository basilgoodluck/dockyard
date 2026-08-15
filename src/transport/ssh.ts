import { mkdirSync, appendFileSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execa } from 'execa';
import type { ServerTarget } from '@/types';
import { PATHS } from '@/config/paths';

export function aliasFor(serverName: string): string {
  return `dockyard-${serverName}`;
}

export function ensureSshConfig(target: ServerTarget): void {
  mkdirSync(PATHS.controlSocketDir, { recursive: true, mode: 0o700 });
  mkdirSync(PATHS.sshDir, { recursive: true, mode: 0o700 });

  const alias: string = aliasFor(target.name);
  const blockLines: (string | null)[] = [
    `Host ${alias}`,
    `  HostName ${target.host}`,
    `  User ${target.user}`,
    `  IdentityFile ${target.keyPath}`,
    target.port ? `  Port ${target.port}` : null,
    `  ControlMaster auto`,
    `  ControlPath ${PATHS.controlSocketDir}/%r@%h:%p`,
    `  ControlPersist 10m`,
    `  StrictHostKeyChecking ask`,
    `  UserKnownHostsFile ${join(PATHS.sshDir, 'known_hosts')}`,
    '',
  ];
  const block: string = blockLines.filter((line): line is string => line !== null).join('\n');
  const hostHeader: string = `Host ${alias}`;
  const existing: string = existsSync(PATHS.dockyardSshConfig)
    ? readFileSync(PATHS.dockyardSshConfig, 'utf8')
    : '';

  if (existing.includes(hostHeader)) {
    writeFileSync(PATHS.dockyardSshConfig, replaceHostBlock(existing, hostHeader, block));
  } else {
    const separator: string = existing.endsWith('\n') || existing === '' ? '' : '\n';
    appendFileSync(PATHS.dockyardSshConfig, separator + block);
  }

  ensureIncludeLine();
}

export function removeSshConfig(serverName: string): void {
  if (!existsSync(PATHS.dockyardSshConfig)) return;

  const hostHeader: string = `Host ${aliasFor(serverName)}`;
  const existing: string = readFileSync(PATHS.dockyardSshConfig, 'utf8');
  if (!existing.includes(hostHeader)) return;

  writeFileSync(PATHS.dockyardSshConfig, replaceHostBlock(existing, hostHeader, ''));
}

function replaceHostBlock(fileContents: string, hostHeader: string, newBlock: string): string {
  const lines: string[] = fileContents.split('\n');
  const startIdx: number = lines.findIndex((line: string) => line.trim() === hostHeader.trim());
  if (startIdx === -1) return newBlock ? fileContents + '\n' + newBlock : fileContents;

  let endIdx: number = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line: string | undefined = lines[i];
    if (line !== undefined && line.startsWith('Host ')) {
      endIdx = i;
      break;
    }
  }

  const before: string[] = lines.slice(0, startIdx);
  const after: string[] = lines.slice(endIdx);
  const newLines: string[] = newBlock.split('\n').filter((line: string) => line !== '');
  return [...before, ...newLines, ...after].join('\n');
}

function ensureIncludeLine(): void {
  const includeLine: string = `Include ${PATHS.dockyardSshConfig}`;
  const current: string = existsSync(PATHS.userSshConfig) ? readFileSync(PATHS.userSshConfig, 'utf8') : '';
  if (current.includes(PATHS.dockyardSshConfig)) return;
  writeFileSync(PATHS.userSshConfig, includeLine + '\n' + current);
}

export type HostKeyCheckResult =
  | { status: 'known' }
  | { status: 'accepted' }
  | { status: 'rejected' }
  | { status: 'changed-and-rejected' }
  | { status: 'error'; message: string };

export async function verifyHostInteractively(target: ServerTarget): Promise<HostKeyCheckResult> {
  const alias: string = aliasFor(target.name);
  try {
    await execa('ssh', [alias, 'true'], { stdio: 'inherit' });
    return { status: 'known' };
  } catch (err: any) {
    const stderr: string = err.stderr ?? '';
    if (stderr.includes('REMOTE HOST IDENTIFICATION HAS CHANGED')) return { status: 'changed-and-rejected' };
    if (err.timedOut === true) return { status: 'error', message: 'Timed out waiting for host key prompt.' };
    if (err.exitCode === 255) return { status: 'rejected' };
    return { status: 'error', message: stderr || err.message };
  }
}

export interface ConnectServerResult {
  configured: boolean;
  hostKey: HostKeyCheckResult;
}

export async function connectServer(target: ServerTarget): Promise<ConnectServerResult> {
  ensureSshConfig(target);
  const hostKey: HostKeyCheckResult = await verifyHostInteractively(target);
  return { configured: true, hostKey };
}

export async function isMultiplexActive(serverName: string): Promise<boolean> {
  try {
    await execa('ssh', ['-O', 'check', aliasFor(serverName)]);
    return true;
  } catch {
    return false;
  }
}