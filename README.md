# Raul VS Code Extension

Full AI integration for VS Code — Raul as your pair programmer.

## Features

- 💬 **Chat Panel** — Natural conversation with Raul inside VS Code
- 🛠️ **MCP Tools** — Access to file operations, git, exec, search via MCP protocol
- 🎯 **Context Commands** — Right-click to ask, explain, or refactor selected code
- ⚡ **Code Generation** — Generate code from natural language prompts
- 🔄 **Real-time Sync** — Connected to your OpenClaw gateway

## Installation

```bash
cd vscode-raul
npm install
npm run compile
```

## Development

```bash
# Watch mode
npm run watch

# Package for distribution
npm run package
```

## Configuration

Add to your VS Code settings (`settings.json`):

```json
{
  "raul.gatewayUrl": "http://localhost:18789",
  "raul.token": "your-openclaw-token"
}
```

## Commands

| Command | Description |
|---------|-------------|
| `Raul: Open Chat` | Opens the Raul chat panel |
| `Raul: Ask About Selection` | Ask Raul about selected code |
| `Raul: Explain Code` | Get explanation of selected code |
| `Raul: Refactor Selection` | Get refactored version of selected code |
| `Raul: Generate Code` | Generate code from a prompt |

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
│  └── Raul (main agent)             │
└─────────────────────────────────────┘
```

## MCP Tools Available

- `read_file` — Read file contents
- `write_file` — Write file contents
- `exec` — Run shell commands
- `git_status` — Git status
- `git_commit` — Git commit
- `search_code` — Search code patterns
- `list_directory` — List directory contents

## TODO

- [ ] Proper React webview with Webpack bundling
- [ ] Inline code decorations for generated code
- [ ] Terminal view integration
- [ ] File tree context menu
- [ ] GitLens-style blame annotations
- [ ] Settings UI
- [ ] Token management UI
