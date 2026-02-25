const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const PORT  = process.env.PORT  || 4000;
const SHELL = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : 'zsh');
const HOME  = process.env.HOME  || os.homedir();

const WATCH_INTERVAL = 2000; // ms between each tmux scan

// ── Auth token ────────────────────────────────────────────────────────────────
// Stored in .auth-token next to server.js — generated once, persists across restarts.
// Delete the file to rotate the token (mobile app will need to re-pair).
const TOKEN_FILE = path.join(__dirname, '.auth-token');
let AUTH_TOKEN;
if (fs.existsSync(TOKEN_FILE)) {
  AUTH_TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
} else {
  AUTH_TOKEN = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(TOKEN_FILE, AUTH_TOKEN, { mode: 0o600 });
}

// ── Init ──────────────────────────────────────────────────────────────────────
// Fix node-pty permissions on macOS if needed (prebuilds might lose +x bit)
if (os.platform() === 'darwin') {
  try {
    const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
    const helperPath = path.join(__dirname, 'node_modules/node-pty/prebuilds', arch, 'spawn-helper');
    if (fs.existsSync(helperPath)) {
      const stats = fs.statSync(helperPath);
      if (!(stats.mode & 0o111)) {
        fs.chmodSync(helperPath, 0o755);
        console.log(`[init] Fixed node-pty spawn-helper permissions: ${helperPath}`);
      }
    }
  } catch (e) {
    console.error('[init] Failed to fix node-pty permissions:', e.message);
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app    = express();
const server = createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API ───────────────────────────────────────────────────────────────────────
app.post('/api/close-session', (req, res) => {
  const { session } = req.body;
  if (!session) return res.status(400).send('Missing session name');

  console.log(`[api] Close signal for session: ${session}`);

  for (const [id, term] of terminals.entries()) {
    if (term.tmuxTarget === session || (term.tmuxTarget && term.tmuxTarget.startsWith(session + ':'))) {
      try { term.pty.kill(); } catch (_) {}
      terminals.delete(id);
      io.emit('terminal:closed', id);
      console.log(`[api] Terminal ${id} closed`);
    }
  }

  try { execSync(`tmux kill-session -t ${session}`); } catch (_) {}
  res.send({ success: true });
});

// ── Tmux helpers ──────────────────────────────────────────────────────────────
let _tmuxAvailable = null;
function tmuxAvailable() {
  if (_tmuxAvailable === null) {
    try { execSync('tmux -V', { stdio: 'ignore' }); _tmuxAvailable = true; }
    catch { _tmuxAvailable = false; }
  }
  return _tmuxAvailable;
}

// Detect the tmux session the server itself is running in (if any).
// The watcher must never auto-discover and manage this session.
let serverTmuxSession = null;
if (process.env.TMUX) {
  try {
    serverTmuxSession = execSync("tmux display-message -p '#S'", {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {}
}

function listTmuxWindows() {
  try {
    const out = execSync(
      "tmux list-windows -a -F '#{session_name}\t#{window_index}\t#{window_name}\t#{pane_current_command}\t#{session_attached}'",
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (!out) return [];
    return out.split('\n').filter(Boolean).map(line => {
      const [session, idx, wname, cmd, attached] = line.split('\t');
      const target = `${session}:${idx}`;
      const name   = wname && wname !== 'zsh' && wname !== 'bash' ? wname : `${session}:${idx} (${cmd})`;
      return { target, name, attached: parseInt(attached, 10) };
    });
  } catch { return []; }
}

// ── Terminal store ────────────────────────────────────────────────────────────
// Map<id, { pty, name, scrollback: string[], clients: Set<socket>, tmuxTarget?: string }>
const terminals = new Map();
let nextId = 1;

// When the last terminal closes, suppress the watcher for a bit so a new
// Terminal.app window auto-opened by macOS doesn't immediately create a new entry.
let lastEmptyAt = 0;
const EMPTY_COOLDOWN = 10_000; // ms

function createTerminal(name, cols = 220, rows = 50, tmuxTarget = null, openLocal = false) {
  const id = nextId++;

  const sessionName = `term-${id}`;
  const [rawFile, args] = tmuxTarget
    ? ['tmux', ['attach-session', '-t', tmuxTarget]]
    : tmuxAvailable()
      ? ['tmux', ['new-session', '-s', sessionName, '-x', String(cols), '-y', String(rows)]]
      : [SHELL, []];

  // Try to use absolute path for the executable if not already absolute
  let file = rawFile;
  if (!path.isAbsolute(file)) {
    try {
      file = execSync(`which ${file}`, { encoding: 'utf8' }).trim();
    } catch (_) {}
  }

  // Fallback to SHELL if tmux is not found or fails
  if (!fs.existsSync(file)) {
    console.error(`[pty] Executable not found: ${file}. Falling back to ${SHELL}`);
    file = SHELL;
    if (!path.isAbsolute(file)) {
      try { file = execSync(`which ${file}`, { encoding: 'utf8' }).trim(); } catch (_) {}
    }
  }

  const cwd = fs.existsSync(HOME) ? HOME : os.homedir();
  console.log(`[pty] Spawning: ${file} ${args.join(' ')} (cwd: ${cwd})`);

  let proc;
  try {
    proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
  } catch (e) {
    console.error(`[pty] Failed to spawn ${file}:`, e.message);
    throw e; // Rethrow to be caught by the caller or listener
  }

  let localWindowRef = null;
  // When created from the web UI on macOS, open a local Terminal.app window
  if (openLocal && os.platform() === 'darwin' && tmuxAvailable()) {
    try {
      const cmd = `osascript -e 'tell application "Terminal" to do script "remote-control-ai attach ${sessionName}"'`;
      const output = require('child_process').execSync(cmd, { encoding: 'utf8' }).trim();
      localWindowRef = output;
      require('child_process').exec(`osascript -e 'tell application "Terminal" to activate'`);
    } catch (e) {
      console.error('[pty] Failed to open local window:', e.message);
    }
  }

  const term = {
    pty: proc,
    name: name || (tmuxTarget ? tmuxTarget : `Terminal ${id}`),
    scrollback: [],
    clients: new Set(),
    tmuxTarget: tmuxTarget || (tmuxAvailable() ? sessionName : null),
    localWindowRef,
    createdAt: Date.now(),
  };
  terminals.set(id, term);

  let scrollbackSize = 0;
  proc.onData((data) => {
    term.scrollback.push(data);
    scrollbackSize += data.length;
    while (scrollbackSize > 300_000 && term.scrollback.length > 1) {
      scrollbackSize -= term.scrollback.shift().length;
    }
    term.clients.forEach((s) => s.emit('terminal:data', { id, data }));
  });

  proc.onExit(() => {
    if (!terminals.has(id)) return; // already cleaned up by terminal:kill
    terminals.delete(id);
    if (terminals.size === 0) lastEmptyAt = Date.now();
    io.emit('terminal:closed', id);
    console.log(`[pty] Terminal ${id} exited`);
  });

  console.log(`[pty] Terminal ${id} created "${term.name}"${term.tmuxTarget ? ` → tmux ${term.tmuxTarget}` : ''}`);
  return { id, name: term.name, isTmux: !!term.tmuxTarget };
}

// ── Tmux watcher ──────────────────────────────────────────────────────────────
// Polls tmux every WATCH_INTERVAL ms and syncs terminals automatically.
function startTmuxWatcher() {
  if (!tmuxAvailable()) return;

  setInterval(() => {
    const windows = listTmuxWindows();

    // Currently managed terminals indexed by tmux target
    const managed = new Map(
      Array.from(terminals.entries())
        .filter(([, t]) => t.tmuxTarget)
        .map(([id, t]) => [t.tmuxTarget, id])
    );

    // New tmux windows → create a terminal entry
    // Skip if we're in the cooldown period after the last terminal closed
    // (prevents Terminal.app auto-reopening from spawning a new entry)
    if (Date.now() - lastEmptyAt < EMPTY_COOLDOWN) return;

    windows.forEach(({ target, name, attached }) => {
      const sessionOfTarget = target.split(':')[0];
      if (managed.has(target) || managed.has(sessionOfTarget)) return;
      if (attached === 0) return; // skip unattached (invisible) windows
      if (serverTmuxSession && sessionOfTarget === serverTmuxSession) return; // skip server's own session

      try {
        const info = createTerminal(name, 220, 50, target);
        io.emit('terminal:new', info);
        console.log(`[watch] New tmux window: ${target}`);
      } catch (e) {
        console.error(`[watch] Failed to attach ${target}:`, e.message);
      }
    });

    // Closed or detached windows → remove terminal entry
    managed.forEach((id, target) => {
      const win  = windows.find(w => w.target === target || w.target.split(':')[0] === target);
      const term = terminals.get(id);

      let shouldKill = !win;
      if (win && term) {
        const sessionName = target.split(':')[0];
        const serverAttachmentsCount = Array.from(terminals.values())
          .filter(t => t.tmuxTarget && t.tmuxTarget.startsWith(sessionName + ':'))
          .length;

        const isSiteTerm = target.startsWith('term-');
        if (!isSiteTerm) {
          // Discovered sessions: close when only the server is attached
          if (win.attached <= serverAttachmentsCount) shouldKill = true;
        } else if (term.localWindowRef) {
          // Server-created sessions: close when the local window detached
          const age = Date.now() - (term.createdAt || 0);
          if (win.attached <= serverAttachmentsCount && age > 5000) shouldKill = true;
        }
      }

      if (shouldKill) {
        if (!term) return;
        if (target.startsWith('mac-')) {
          try { execSync(`tmux kill-session -t ${target.split(':')[0]}`); } catch (_) {}
        }
        try { term.pty.kill(); } catch (_) {}
        terminals.delete(id);
        io.emit('terminal:closed', id);
        console.log(`[watch] Terminal removed: ${target}`);
      }
    });
  }, WATCH_INTERVAL);

  console.log(`[watch] Tmux watcher started (interval: ${WATCH_INTERVAL / 1000}s)`);
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[ws] Client connected: ${socket.id}`);
  let authed = false;

  // ── Auth ──────────────────────────────────────────────────────────────────
  socket.on('auth', (credential) => {
    if (credential === AUTH_TOKEN) {
      authed = true;
      socket.emit('auth:ok');
      const list = Array.from(terminals.entries()).map(([id, t]) => ({
        id, name: t.name, isTmux: !!t.tmuxTarget,
      }));
      socket.emit('terminals:list', list);
      console.log(`[ws] Authenticated: ${socket.id}`);
    } else {
      socket.emit('auth:error', 'Invalid token');
    }
  });

  // ── Create ────────────────────────────────────────────────────────────────
  socket.on('terminal:create', ({ name, cols, rows } = {}) => {
    if (!authed) return;
    try {
      const info = createTerminal(name, cols, rows, null, true);
      io.emit('terminal:new', info);
      socket.emit('terminal:focus', info.id);
    } catch (e) {
      socket.emit('error', `Failed to create terminal: ${e.message}`);
    }
  });

  // ── Attach ────────────────────────────────────────────────────────────────
  socket.on('terminal:attach', ({ id, cols, rows }) => {
    if (!authed) return;
    const term = terminals.get(id);
    if (!term) return socket.emit('error', `Terminal ${id} not found`);

    const alreadyAttached = term.clients.has(socket);
    term.clients.add(socket);

    // Replay scrollback only for plain shells (not tmux).
    // For tmux sessions, replaying the scrollback shows stale TUI redraws on top
    // of each other. tmux sends a full fresh redraw on its own when the pty resizes.
    if (!alreadyAttached && term.scrollback.length && !term.tmuxTarget) {
      // Clear the terminal first to avoid overlays
      socket.emit('terminal:data', { id, data: '\x1bc' }); 
      socket.emit('terminal:data', { id, data: term.scrollback.join('') });
    }

    const c = cols || term.pty.cols;
    const r = rows || term.pty.rows;
    try { term.pty.resize(c, r); } catch (_) {}

    // For tmux sessions, force the window to the exact dimensions sent by the client,
    // then refresh so the client gets an immediate full redraw.
    if (term.tmuxTarget && tmuxAvailable()) {
      try { execSync(`tmux resize-window -t ${term.tmuxTarget} -x ${c} -y ${r}`, { stdio: 'ignore' }); } catch (_) {}
      try { execSync(`tmux refresh-client -t ${term.tmuxTarget}`, { stdio: 'ignore' }); } catch (_) {}
    }
  });

  // ── Detach ────────────────────────────────────────────────────────────────
  socket.on('terminal:detach', ({ id }) => {
    terminals.get(id)?.clients.delete(socket);
  });

  // ── Input ─────────────────────────────────────────────────────────────────
  socket.on('terminal:input', ({ id, data }) => {
    if (!authed) return;
    terminals.get(id)?.pty.write(data);
  });

  // ── Resize ────────────────────────────────────────────────────────────────
  socket.on('terminal:resize', ({ id, cols, rows }) => {
    if (!authed) return;
    const term = terminals.get(id);
    if (!term) return;
    try { term.pty.resize(cols, rows); } catch (_) {}
    if (term.tmuxTarget && tmuxAvailable()) {
      try { execSync(`tmux resize-window -t ${term.tmuxTarget} -x ${cols} -y ${rows}`, { stdio: 'ignore' }); } catch (_) {}
    }
  });

  // ── Rename ────────────────────────────────────────────────────────────────
  socket.on('terminal:rename', ({ id, name }) => {
    if (!authed) return;
    const term = terminals.get(id);
    if (!term) return;
    term.name = name;
    io.emit('terminal:renamed', { id, name });
  });

  // ── Kill ──────────────────────────────────────────────────────────────────
  socket.on('terminal:kill', ({ id }) => {
    if (!authed) return;
    const term = terminals.get(id);
    if (term) {
      // Close the associated Terminal.app window on macOS if one was opened
      if (term.localWindowRef && os.platform() === 'darwin') {
        try {
          const match = term.localWindowRef.match(/window id (\d+)/);
          if (match) {
            require('child_process').exec(
              `osascript -e 'tell application "Terminal" to close window id ${match[1]}'`
            );
          }
        } catch (e) {
          console.error('[pty] Failed to close local window:', e.message);
        }
      }

      // Kill the tmux session if we created it
      if (term.tmuxTarget && tmuxAvailable()) {
        try { execSync(`tmux kill-session -t ${term.tmuxTarget}`); } catch (_) {}
      }

      try { term.pty.kill(); } catch (_) {}
      terminals.delete(id);
      if (terminals.size === 0) lastEmptyAt = Date.now();
      io.emit('terminal:closed', id);
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    terminals.forEach((term) => term.clients.delete(socket));
    console.log(`[ws] Client disconnected: ${socket.id}`);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log(`  Remote Control AI  →  http://localhost:${PORT}`);
  console.log(`  Token            →  ${AUTH_TOKEN.slice(0, 12)}… (.auth-token)`);
  console.log(`  tmux             →  ${tmuxAvailable() ? 'available' : 'not found — brew install tmux'}`);
  console.log('');
  console.log('  Pair the mobile app:');
  console.log('    remote-control-ai connect https://xxxx.trycloudflare.com');
  console.log('');
  if (tmuxAvailable()) {
    console.log('  Auto-start tmux in every new terminal (add to ~/.zshrc):');
    console.log('    [[ -z "$TMUX" ]] && exec tmux new-session -s "mac-$(date +%s)"');
    console.log('');
  }
  startTmuxWatcher();
});
