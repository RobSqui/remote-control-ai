#!/usr/bin/env node
'use strict';

/**
 * remote-control-ai CLI
 * Usage: 
 *   remote-control-ai connect <public-url>
 *   remote-control-ai attach <session-name>
 *   remote-control-ai detach <session-name>
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const qrcode = require('qrcode-terminal');

const [,, command, arg1] = process.argv;

const USAGE = `
  Remote Control AI CLI 🖥️

  Usage:
    remote-control-ai connect <public-url>  Pair mobile app with a public URL
    remote-control-ai attach [session]       Attach to session (creates unique if empty)
    remote-control-ai detach <session>       Detach all clients from a session

  Examples:
    remote-control-ai connect https://xxxx.trycloudflare.com
    remote-control-ai attach
    remote-control-ai attach term-1
`;

function exitUsage(err) {
  if (err) console.error(`Error: ${err}\n`);
  process.stdout.write(USAGE);
  process.exit(err ? 1 : 0);
}

if (!command || command === 'help' || command === '--help') {
  exitUsage();
}

switch (command) {
  case 'connect':
    handleConnect(arg1);
    break;
  case 'attach':
    handleAttach(arg1);
    break;
  case 'detach':
    handleDetach(arg1);
    break;
  default:
    exitUsage(`Unknown command: ${command}`);
}

function handleConnect(publicUrl) {
  if (!publicUrl) exitUsage('Public URL is required for connect.');

  // Load auth token from the directory where the server lives
  const tokenFile = path.join(__dirname, '.auth-token');
  if (!fs.existsSync(tokenFile)) {
    console.error(`Error: .auth-token not found in ${__dirname}`);
    console.error('Start the server at least once to generate it.');
    process.exit(1);
  }

  const token = fs.readFileSync(tokenFile, 'utf8').trim();
  const url   = publicUrl.replace(/\/$/, ''); // strip trailing slash
  const payload = JSON.stringify({ u: url, t: token });

  console.log('');
  console.log(`  Scan this QR code with the mobile app:`);
  console.log(`  Server : ${url}`);
  console.log(`  Token  : ${token.slice(0, 8)}… (stored in .auth-token)`);
  console.log('');
  qrcode.generate(payload, { small: true });
  console.log('  The token persists across server restarts.');
  console.log('  Delete .auth-token to rotate it.');
  console.log('');
}

function handleAttach(session) {
  const sessionName = session || `mac-${Math.floor(Date.now() / 1000)}`;
  try {
    // If no session name is provided, we create a new one.
    // If it is provided, we attach to it.
    const cmd = session 
      ? `tmux attach-session -t "${sessionName}"`
      : `tmux new-session -s "${sessionName}"`;
    
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    if (session) {
      console.error(`Failed to attach to session "${sessionName}". Is it running?`);
    } else {
      console.error(`Failed to start tmux session.`);
    }
    process.exit(1);
  }
}

function handleDetach(session) {
  if (!session) exitUsage('Session name is required for detach.');
  try {
    execSync(`tmux detach-client -s "${session}"`, { stdio: 'inherit' });
    console.log(`Detached all clients from session "${session}".`);
  } catch (e) {
    console.error(`Failed to detach session "${session}".`);
    process.exit(1);
  }
}
