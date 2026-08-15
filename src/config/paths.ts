import { join } from 'path';
import { homedir } from 'os';

export interface DockyardPaths {
  dockyardDir: string;
  sshDir: string;
  controlSocketDir: string;
  dockyardSshConfig: string;
  userSshConfig: string;
  dockyardConfigFile: string;
}

const HOME: string = homedir();
const DOCKYARD_DIR: string = join(HOME, '.dockyard');
const SSH_DIR: string = join(HOME, '.ssh');

export const PATHS: DockyardPaths = {
  dockyardDir: DOCKYARD_DIR,
  sshDir: SSH_DIR,
  controlSocketDir: join(DOCKYARD_DIR, 'ssh-sockets'),
  dockyardSshConfig: join(DOCKYARD_DIR, 'ssh_config'),
  userSshConfig: join(SSH_DIR, 'config'),
  dockyardConfigFile: join(DOCKYARD_DIR, 'config.yaml'),
};