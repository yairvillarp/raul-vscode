import * as vscode from 'vscode';
import { GatewayClient } from './gateway/client';
import { McpServer } from './mcp/server';
import { registerCommands } from './commands';
import { SettingsManager, RaulConfig } from './settings';
import { TerminalManager } from './terminal/manager';

// Global instances
let gatewayClient: GatewayClient;
let mcpServer: McpServer;
let settingsManager: SettingsManager;
let terminalManager: TerminalManager;

export async function activate(context: vscode.ExtensionContext) {
  // Initialize settings manager
  settingsManager = new SettingsManager();

  // Initialize terminal manager
  terminalManager = new TerminalManager();
  context.subscriptions.push({
    dispose: () => terminalManager.disposeAll()
  });

  // Load saved config
  const config = settingsManager.getConfig();

  // Initialize gateway client
  gatewayClient = new GatewayClient(config.gatewayUrl, config.token);
  gatewayClient.setSessionId(config.sessionId);

  // Debug output channel
  const debugChannel = vscode.window.createOutputChannel('Raul Debug');
  debugChannel.appendLine(`[Raul] Gateway URL: ${config.gatewayUrl}`);
  debugChannel.appendLine(`[Raul] Token: ${config.token ? '(set)' : '(missing)'}`);
  gatewayClient.setDebugLogger((msg: string) => debugChannel.appendLine(`[WS] ${msg}`));
  gatewayClient.setDebugChatEnabled(() => settingsManager.isDebugEnabled() || settingsManager.isDebugChatEnabled());
  gatewayClient.setDebugToolsEnabled(() => settingsManager.isDebugEnabled() || settingsManager.isDebugToolsEnabled());

  // Register settings command
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.openSettings', () => {
      openSettingsPanel(context);
    })
  );

  // Try to connect (will fail gracefully if not configured)
  try {
    await gatewayClient.connect();
  } catch (err) {
    // Not configured yet, that's fine
  }

  // Initialize MCP server (Raul as MCP server for tools)
  mcpServer = new McpServer(gatewayClient, terminalManager);
  await mcpServer.start();

  // Register VS Code commands
  registerCommands(context, gatewayClient, settingsManager, terminalManager);

  // Register Chat Participant for VS Code native chat
  const chatParticipant = vscode.chat.createChatParticipant('raul', async (request, context, stream, token) => {
    const { prompt } = request;
    
    // Show thinking indicator
    stream.progress('Thinking...');

    try {
      // Send message to Raul via gateway
      const response = await gatewayClient.sendMessage(prompt);
      
      // Stream the response back
      stream.markdown(response);
    } catch (err) {
      stream.markdown(`**Error connecting to Raul:** ${err}`);
    }
  });

  // Set icon and name for the chat participant
  chatParticipant.iconPath = vscode.Uri.parse('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🤖</text></svg>');

  // Command to open chat with Raul
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.showChat', async () => {
      // Open the native chat panel with Raul
      await vscode.commands.executeCommand('workbench.action.openChat', { query: '' });
    })
  );

  // Set up status bar
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = '$(bot) Raul';
  statusBar.tooltip = 'Raul AI Partner — click to open chat';
  statusBar.command = 'raul.showChat';
  statusBar.show();

  vscode.window.showInformationMessage('Raul is online! 🚀');
}

function openSettingsPanel(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'raul.settings',
    'Raul Settings',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const currentConfig: RaulConfig = settingsManager.getConfig();

  panel.webview.html = getSettingsHtml(currentConfig);

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'save':
        settingsManager.saveConfig({
          gatewayUrl: message.gatewayUrl,
          token: message.token,
          sessionId: message.sessionId,
          debug: message.debug,
          debugChat: message.debugChat,
          debugTools: message.debugTools
        });
        
        // Update gateway client
        gatewayClient.updateConfig(message.gatewayUrl, message.token);
        gatewayClient.setSessionId(message.sessionId);
        gatewayClient.setDebugChatEnabled(() => settingsManager.isDebugEnabled() || settingsManager.isDebugChatEnabled());
        gatewayClient.setDebugToolsEnabled(() => settingsManager.isDebugEnabled() || settingsManager.isDebugToolsEnabled());
        try {
          await gatewayClient.connect();
        } catch (err) {
          vscode.window.showWarningMessage('Could not connect to gateway. Check URL and token.');
        }
        
        panel.dispose();
        vscode.window.showInformationMessage('Raul settings saved! ✅');
        break;
      case 'test':
        const testClient = new GatewayClient(message.gatewayUrl, message.token);
        try {
          await testClient.connect();
          testClient.disconnect();
          panel.webview.postMessage({ type: 'testResult', success: true });
        } catch (err) {
          panel.webview.postMessage({ type: 'testResult', success: false, error: String(err) });
        }
        break;
    }
  });
}

function getSettingsHtml(config: RaulConfig): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1e1e1e;
      color: #ccc;
      padding: 24px;
    }
    h2 {
      color: #fff;
      font-size: 18px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .field {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 13px;
      color: #aaa;
      margin-bottom: 6px;
      font-weight: 500;
    }
    input {
      width: 100%;
      background: #2d2d2d;
      border: 1px solid #3e3e3e;
      border-radius: 6px;
      padding: 10px 12px;
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    input:focus { border-color: #667eea; }
    input::placeholder { color: #666; }
    input[type="checkbox"] {
      width: auto;
      margin-right: 8px;
      cursor: pointer;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
    }
    .checkbox-row label {
      margin-bottom: 0;
      cursor: pointer;
    }
    .hint {
      font-size: 12px;
      color: #666;
      margin-top: 6px;
    }
    .btn-row {
      display: flex;
      gap: 10px;
      margin-top: 24px;
    }
    button {
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }
    .btn-secondary {
      background: #3e3e3e;
      color: #ccc;
    }
    .btn-test {
      background: #2d5a2d;
      color: #8f8;
    }
    .result {
      margin-top: 12px;
      padding: 10px;
      border-radius: 6px;
      font-size: 13px;
      display: none;
    }
    .result.show { display: block; }
    .result.success { background: #2d5a2d; color: #8f8; }
    .result.error { background: #5a2d2d; color: #f88; }
  </style>
</head>
<body>
  <h2>🤖 Raul Settings</h2>
  
  <div class="field">
    <label>Gateway URL</label>
    <input type="text" id="gatewayUrl" placeholder="http://localhost:18789" value="${config.gatewayUrl}">
    <div class="hint">OpenClaw Gateway address (use http://localhost:18789 for local)</div>
  </div>
  
  <div class="field">
    <label>Auth Token</label>
    <input type="password" id="token" placeholder="eyJhbGciOiJIUzI1NiIsInR5c..." value="${config.token}">
    <div class="hint">Get this from OpenClaw config: openclaw gateway config</div>
  </div>
  
  <div class="field">
    <label>Session ID</label>
    <input type="text" id="sessionId" placeholder="default" value="${config.sessionId}">
    <div class="hint">Use the same ID to maintain context across connections. Change for a fresh session.</div>
  </div>
  
  <div class="checkbox-row">
    <input type="checkbox" id="debug" ${config.debug ? 'checked' : ''}>
    <label for="debug">Enable All Debug Logging</label>
  </div>
  
  <div class="checkbox-row">
    <input type="checkbox" id="debugChat" ${config.debugChat ? 'checked' : ''}>
    <label for="debugChat">Debug Chat (WebSocket events, message flow)</label>
  </div>
  
  <div class="checkbox-row">
    <input type="checkbox" id="debugTools" ${config.debugTools ? 'checked' : ''}>
    <label for="debugTools">Debug MCP Tools (tools.invoke, exec results)</label>
  </div>
  
  <div class="btn-row">
    <button class="btn-test" id="testBtn">Test Connection</button>
    <button class="btn-secondary" id="cancelBtn">Cancel</button>
    <button class="btn-primary" id="saveBtn">Save</button>
  </div>
  
  <div class="result" id="result"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const result = document.getElementById('result');
    
    document.getElementById('testBtn').addEventListener('click', async () => {
      const url = document.getElementById('gatewayUrl').value;
      const token = document.getElementById('token').value;
      
      result.className = 'result show';
      result.textContent = 'Testing...';
      result.style.background = '#3e3e3e';
      result.style.color = '#ccc';
      
      vscode.postMessage({ type: 'test', gatewayUrl: url, token });
    });
    
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'testResult') {
        result.className = 'result show';
        if (msg.success) {
          result.textContent = '✓ Connection successful!';
          result.classList.add('success');
        } else {
          result.textContent = '✗ Connection failed: ' + msg.error;
          result.classList.add('error');
        }
      }
    });
    
    document.getElementById('saveBtn').addEventListener('click', () => {
      vscode.postMessage({
        type: 'save',
        gatewayUrl: document.getElementById('gatewayUrl').value,
        token: document.getElementById('token').value,
        sessionId: document.getElementById('sessionId').value || 'default',
        debug: document.getElementById('debug').checked,
        debugChat: document.getElementById('debugChat').checked,
        debugTools: document.getElementById('debugTools').checked
      });
    });
    
    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
  </script>
</body>
</html>`;
}

export function deactivate() {
  mcpServer?.stop();
  gatewayClient?.disconnect();
}
