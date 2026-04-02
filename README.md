# Raul VS Code Extension

[![CI](https://github.com/yairvillarp/raul-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/yairvillarp/raul-vscode/actions/workflows/ci.yml)
[![Release](https://github.com/yairvillarp/raul-vscode/actions/workflows/release.yml/badge.svg)](https://github.com/yairvillarp/raul-vscode/actions/workflows/release.yml)

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

## CI/CD

### GitHub Actions

**CI** (`ci.yml`): Runs on every push/PR to `main`
- Compiles TypeScript
- Validates extension structure
- Packages VSIX artifact

**Release** (`release.yml`): Runs on every git tag `v*`
- Compiles and packages VSIX
- Creates GitHub Release with artifact attached

### Creating a Release

```bash
# Update version in package.json, then:
git add .
git commit -m "Release v0.2.0"
git tag v0.2.0
git push && git push --tags
```

This triggers the release workflow automatically.

## TODO

- [ ] Proper React webview with Webpack bundling
- [ ] Inline code decorations for generated code
- [ ] Terminal view integration
- [ ] File tree context menu
- [ ] GitLens-style blame annotations
- [ ] Settings UI
- [ ] Token management UI
