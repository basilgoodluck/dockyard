import { runRemoteCommand } from './transport/ssh.js';

const result = await runRemoteCommand(
  { host: 'YOUR_SERVER_IP', user: 'YOUR_USER', keyPath: '/home/you/.ssh/id_ed25519' },
  'docker ps'
);

console.log(result);