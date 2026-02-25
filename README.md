# Remote Control AI 🖥️📱

**Remote Control AI** is an open-source, free solution to access and control any terminal-based AI (like `claude code`, `gemini-cli`, `ollama`, and more) directly from your mobile phone or web browser.

No more being tethered to your desk: run your favorite AI agents in your local terminal and interact with them anywhere with full `tmux` support and interactive TUI compatibility.

## Features
- **AI-Ready:** Perfect for `claude code`, `gemini-cli`, `vim`, and any CLI-based AI tool.
- **Persistent Sessions:** Powered by `tmux`, your AI agents stay alive even if you disconnect.
- **Mobile Optimized:** Custom toolbar for mobile browsers and a dedicated React Native app.
- **100% Free & Open Source:** Your data stays on your machine.
- **Bi-directional Scroll:** Works even in TUI apps using mouse-wheel simulation.

---

## Demo
![Remote Control AI Demo](assets/demo.gif)

---

## 1. Prerequisites

- **Node.js** (v18+)
- **tmux** (required for session management)
  ```bash
  brew install tmux
  ```
- **Cloudflare Tunnel** (recommended to access from outside your local network)

---

## 2. Server Setup

1. **Clone and Install:**
   ```bash
   git clone https://github.com/RobSqui/remote-control-ai.git
   cd remote-control-ai
   npm install
   ```

2. **Start the Server:**
   ```bash
   npm start
   ```
   *The first run will generate a unique token in `.auth-token`.*

3. **Configure tmux (Crucial for Scrolling):**
   To ensure scrolling works perfectly in apps like `gemini-cli` and `claude code`, add this to your `~/.tmux.conf`:
   ```bash
   echo "set -g mouse on" >> ~/.tmux.conf
   tmux source-file ~/.tmux.conf
   ```

4. **Make the CLI Global:**
   To use the `remote-control-ai` command from anywhere, run:
   ```bash
   npm link
   ```
   *Note for Mac/Linux: If the command is not found, add the npm global bin to your PATH:*
   ```bash
   echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```


---

## 3. Mobile App Setup

1. **Navigate to mobile directory:**
   ```bash
   cd mobile
   npm install
   ```

2. **Run with Expo:**
   ```bash
   npx expo start
   ```
   *Scan the QR code with your phone (using the Expo Go app).*

---

## 4. Connecting Everything

1. **Expose your server:**
   Using Cloudflare Tunnel (free and no account required for quick tunnels):
   ```
   cloudflared tunnel --url http://localhost:4000
   ```
2. **Pairing:**
   On your computer, run:
   ```bash
   npm run connect <your-public-url>
   ```
   Scan the generated QR code with the mobile app to pair instantly.

---

## 5. Usage Tips

### Scrolling in TUI apps
The mobile app includes a special "Mouse Wheel" simulation. When in `gemini-cli` or `vim`, use the chevron up/down buttons. They send real mouse events that `tmux` (with `mouse on`) understands.

---

## Architecture
- **Backend:** Node.js, `node-pty` (pseudo-terminal), `socket.io`.
- **Frontend:** xterm.js (terminal rendering).
- **Mobile:** React Native (Expo), `react-native-webview`.
