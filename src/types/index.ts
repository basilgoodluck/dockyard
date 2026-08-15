export interface ServerTarget {
  /** Name used in config.yaml, e.g. "client-a" */
  name: string;
  host: string;
  user: string;
  /** Absolute path to the private key file */
  keyPath: string;
  /** Optional non-default SSH port */
  port?: number;
}

export interface RemoteExecResult {
  server: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string | undefined;
}

export interface RemoteExecOptions {
  /** Milliseconds before giving up on the remote command */
  timeoutMs?: number;
  /** Called with each stdout chunk as it arrives, for streaming/-f style commands */
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}