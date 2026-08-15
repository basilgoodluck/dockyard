import { execa } from 'execa';
import { aliasFor } from './ssh';
import type { RemoteExecOptions, RemoteExecResult } from '@/types';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptExec(alias: string, command: string[], timeoutMs: number): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  transportError?: string;
}> {
  try {
    const result = await execa('ssh', [alias, ...command], { timeout: timeoutMs, reject: false });
    return { exitCode: result.exitCode ?? null, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } catch (err: any) {
    return {
      exitCode: null,
      stdout: '',
      stderr: '',
      transportError: err.timedOut ? `Timed out after ${timeoutMs}ms` : err.message ?? 'Unknown SSH execution error',
    };
  }
}

export async function execRemote(
  serverName: string,
  command: string[],
  options: RemoteExecOptions & { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<RemoteExecResult> {
  const alias: string = aliasFor(serverName);
  const timeoutMs: number = options.timeoutMs ?? 30_000;
  const maxRetries: number = options.maxRetries ?? 3;
  const baseDelayMs: number = options.baseDelayMs ?? 500;

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await attemptExec(alias, command, timeoutMs);

    if (!result.transportError) {
      return { server: serverName, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    }

    lastError = result.transportError;
    if (attempt < maxRetries) {
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  return { server: serverName, exitCode: null, stdout: '', stderr: '', error: lastError };
}

export async function execRemoteMany(
  serverNames: string[],
  buildCommand: (serverName: string) => string[],
  options: RemoteExecOptions & { concurrency?: number; maxRetries?: number; baseDelayMs?: number } = {}
): Promise<RemoteExecResult[]> {
  const concurrency: number = options.concurrency ?? 8;
  const results: RemoteExecResult[] = new Array(serverNames.length);
  let cursor: number = 0;

  async function worker(): Promise<void> {
    while (cursor < serverNames.length) {
      const i: number = cursor++;
      const name: string | undefined = serverNames[i];
      if (name === undefined) continue;
      results[i] = await execRemote(name, buildCommand(name), options);
    }
  }

  const workerCount: number = Math.min(concurrency, serverNames.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}