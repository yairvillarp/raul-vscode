# Raul VS Code Extension

[![CI](https://github.com/yairvillarp/raul-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/yairvillarp/raul-vscode/actions/workflows/ci.yml)
[![Release](https://github.com/yairvillarp/raul-vscode/actions/workflows/release.yml/badge.svg)](https://github.com/yairvillarp/raul-vscode/actions/workflows/release.yml)

Full AI integration for VS Code — Raul as your pair programmer, powered by OpenClaw.

## Install

### From VSIX (Recommended for now)

1. Download the latest `.vsix` from [Releases](https://github.com/yairvillarp/raul-vscode/releases)
2. Run: `code --install-extension raul-vscode.vsix`

Or install directly from file:
```bash
code --install-extension ./raul-vscode.vsix
```

### From Source

```bash
git clone https://github.com/yairvillarp/raul-vscode.git
cd raul-vscode
npm install
npm run compile
code --install-extension dist/raul-vscode.vsix
```

## Setup

### 1. Get your OpenClaw Gateway URL and Token

```bash
openclaw gateway config
```

Note the URL (default: `http://localhost:18789`) and generate/get your auth token.

### 2. Configure the Extension

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run:

```
Raul: Open Settings
```

Enter your Gateway URL and token, then click **Test Connection** to verify before saving.

Or edit your `settings.json` directly:

```json
{
  "raul.gatewayUrl": "http://localhost:18789",
  "raul.token": "your-openclaw-token-here"
}
```

## Usage

### Chat Panel

Press `Ctrl+Shift+P` → **Raul: Open Chat** (or click the 🤖 status bar item)

A chat panel opens where you can talk to Raul directly.

### Context Commands

Right-click on any selected code:

| Command | What it does |
|---------|-------------|
| **Raul: Ask About Selection** | Ask Raul anything about the selected code |
| **Raul: Explain Code** | Get a clear explanation in a new tab |
| **Raul: Refactor Selection** | Get a cleaner, better version |

### Command Palette

Press `Ctrl+Shift+P` and search `Raul:`:

- `Raul: Open Chat` — Chat panel
- `Raul: Open Settings` — Configure connection
- `Raul: Generate Code` — Describe what to generate
- `Raul: Open Terminal` — Open Raul's terminal
- `Raul: Run in Terminal` — Run selected code in terminal

### Terminal

Raul can run commands in VS Code's actual terminal — you see what he runs and can interact with it.

## Features

- 💬 **Chat** — Natural conversation with Raul inside VS Code
- 🤖 **MCP Tools** — File ops, git, search, exec via MCP protocol
- 🎯 **Context Actions** — Ask, explain, refactor selected code
- ⚡ **Code Generation** — From prompt to file
- 🖥️ **Terminal Integration** — Raul uses real VS Code terminals

## Architecture

```
┌─────────────────────────────────────┐
│  VS Code                            │
│  ├── Extension Host (Node.js)      │
│  │   ├── GatewayClient              │
│  │   ├── McpServer                  │
│  │   └── Commands                   │
│  └── WebView (Chat UI)              │
└─────────────────────────────────────┘
           │
           │ WebSocket / HTTP
           ↓
┌─────────────────────────────────────┐
│  OpenClaw Gateway                  │
│  └── Raul (your AI partner)        │
└─────────────────────────────────────┘
```

## MCP Tools

When used as an MCP server, Raul exposes:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write content to file |
| `exec` | Run shell command |
| `git_status` | Git status |
| `git_commit` | Commit with message |
| `search_code` | Search code patterns |
| `list_directory` | List directory |

## Development

```bash
# Install dependencies
npm install

# Compile (TypeScript + webpack)
npm run compile

# Watch mode
npm run watch

# Package VSIX
npm run package
```

## CI/CD

- **CI**: Runs on every push/PR — compiles, validates, packages
- **Release**: Creates GitHub Release on git tags (`v*`)

```bash
# Create a release
git tag v0.1.0
git push --tags
```

## License

MIT
