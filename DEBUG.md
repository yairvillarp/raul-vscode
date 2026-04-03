# Debugging Raul VS Code Extension

## Quick Start

1. **Open this project in VS Code**
   ```bash
   cd /Users/usuario/www/raul-vscode
   code .
   ```

2. **Press F5** or click **Run > Start Debugging**

3. A new VS Code window opens (Extension Development Host) with Raul loaded

4. **Set breakpoints** in any `.ts` file in VS Code

5. Trigger Raul (click status bar, run command, etc.)

---

## What You Can Debug

### Extension Host (Node.js side)
- `src/extension.ts` - Main activation, chat participant
- `src/gateway/client.ts` - WebSocket communication
- `src/mcp/server.ts` - MCP server
- `src/commands/index.ts` - Command handlers
- `src/terminal/manager.ts` - Terminal operations

### Breakpoints
Set breakpoints anywhere, including:
- ✅ Inside `chatParticipant` callback
- ✅ Inside `gatewayClient.sendMessage()`
- ✅ Inside command handlers
- ✅ Inside WebSocket message handlers

---

## Debug Console

In the **Debug Console** you can:
- See `console.log` output from the extension
- Evaluate expressions
- Inspect variables

---

## Watch Mode (Live Reload)

For a better development experience with auto-reload:

```bash
npm run watch
```

Then press **F5** to start debugging while watching for changes.

---

## Troubleshooting

### "Extension host terminated"
- Check the **Debug Console** for errors
- Make sure you ran `npm run compile` first

### Breakpoints not hitting
- Ensure the `.js.map` files exist in `dist/`
- Verify breakpoint is on compiled line (VS Code should show verified breakpoint)

### Can't see console.log output
- Output appears in the **Debug Console**, not the Extension Development Host

---

## Adding Logs for Debugging

```typescript
// In any .ts file
console.log('[DEBUG] Variable value:', variable);
console.log('[DEBUG] Object:', JSON.stringify(obj));
```

Logs appear in the Debug Console when attached.
