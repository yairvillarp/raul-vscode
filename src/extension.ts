import * as vscode from 'vscode';
import { GatewayClient } from './gateway/client';
import { McpServer } from './mcp/server';
import { registerCommands } from './commands';
import { SettingsManager } from './settings';
import { TerminalManager } from './terminal/manager';

// Global instances
let gatewayClient: GatewayClient;
let mcpServer: McpServer;
let chatPanel: vscode.WebviewPanel | undefined;
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

  // Debug output channel
  const debugChannel = vscode.window.createOutputChannel('Raul Debug');
  debugChannel.appendLine(`[Raul] Gateway URL: ${config.gatewayUrl}`);
  debugChannel.appendLine(`[Raul] Token: ${config.token ? '(set)' : '(missing)'}`);
  gatewayClient.setDebug((msg: string) => debugChannel.appendLine(`[WS] ${msg}`));

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

  // Create chat panel when command is triggered
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.showChat', () => {
      createChatPanel(context);
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

  const currentConfig = settingsManager.getConfig();

  panel.webview.html = getSettingsHtml(currentConfig);

  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'save':
        settingsManager.saveConfig({
          gatewayUrl: message.gatewayUrl,
          token: message.token
        });
        
        // Update gateway client
        gatewayClient.updateConfig(message.gatewayUrl, message.token);
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

function getSettingsHtml(config: { gatewayUrl: string; token: string }): string {
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
        token: document.getElementById('token').value
      });
    });
    
    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
  </script>
</body>
</html>`;
}

function createChatPanel(context: vscode.ExtensionContext) {
  if (chatPanel) {
    chatPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  chatPanel = vscode.window.createWebviewPanel(
    'raul.chat',
    'Raul',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const webviewHtml = getChatHtml();
  chatPanel.webview.html = webviewHtml;

  chatPanel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'chat':
        console.log('[Extension] Received chat message from webview:', message.text);
        const response = await gatewayClient.sendMessage(message.text);
        console.log('[Extension] sendMessage resolved, sending to webview:', response?.substring(0, 100));
        chatPanel?.webview.postMessage({ type: 'response', text: response });
        break;
      case 'execute':
        await vscode.commands.executeCommand(message.command);
        break;
      case 'openSettings':
        openSettingsPanel(context);
        break;
    }
  });

  chatPanel.onDidDispose(() => {
    chatPanel = undefined;
  });
}

function getChatHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raul Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      color: #ccc;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #header {
      background: #2d2d2d;
      padding: 12px 16px;
      border-bottom: 1px solid #3e3e3e;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    #header .left { display: flex; align-items: center; gap: 10px; }
    #header .avatar {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    #header h2 { color: #fff; font-size: 14px; font-weight: 500; }
    #header .subtitle { color: #666; font-size: 12px; }
    #header button {
      background: #3e3e3e;
      border: none;
      border-radius: 4px;
      padding: 6px 10px;
      color: #aaa;
      font-size: 12px;
      cursor: pointer;
    }
    #header button:hover { background: #4e4e4e; color: #fff; }
    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .message.user {
      background: #007acc;
      color: #fff;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .message.raul {
      background: #2d2d2d;
      color: #ddd;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .message.raul code {
      background: #1a1a1a;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Fira Code', monospace;
      font-size: 12px;
    }
    .message.raul pre {
      background: #1a1a1a;
      padding: 10px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }
    #input-area {
      background: #2d2d2d;
      padding: 12px 16px;
      border-top: 1px solid #3e3e3e;
      display: flex;
      gap: 10px;
    }
    #input {
      flex: 1;
      background: #1e1e1e;
      border: 1px solid #3e3e3e;
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-size: 13px;
      resize: none;
      outline: none;
      font-family: inherit;
    }
    #input:focus { border-color: #667eea; }
    #send {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      color: #fff;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    #send:hover { opacity: 0.9; }
    #send:disabled { opacity: 0.5; cursor: not-allowed; }
    .typing {
      align-self: flex-start;
      color: #666;
      font-size: 13px;
      padding: 4px 0;
      font-style: italic;
    }
    .not-configured {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    .not-configured button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 6px;
      padding: 10px 20px;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div id="header">
    <div class="left">
      <div class="avatar">🤖</div>
      <div>
        <h2>Raul</h2>
        <span class="subtitle" id="status">● Online</span>
      </div>
    </div>
    <button id="settingsBtn">⚙️ Settings</button>
  </div>
  <div id="messages">
    <div class="message raul">Hey Yair! 👋 I'm Raul, your coding partner. What are we building today?</div>
  </div>
  <div id="input-area">
    <textarea id="input" placeholder="Ask me anything..." rows="1"></textarea>
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const settingsBtn = document.getElementById('settingsBtn');
    const status = document.getElementById('status');

    let isTyping = false;

    settingsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || isTyping) return;

      addMessage(text, 'user');
      input.value = '';

      isTyping = true;
      const typing = document.createElement('div');
      typing.className = 'message raul typing';
      typing.textContent = '...';
      messages.appendChild(typing);
      messages.scrollTop = messages.scrollHeight;

      try {
        vscode.postMessage({ type: 'chat', text });
      } catch (err) {
        typing.textContent = 'Error: Could not reach Raul';
        isTyping = false;
      }
    }

    function addMessage(text, sender) {
      const div = document.createElement('div');
      div.className = 'message ' + sender;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      console.log('[WebView] received from extension:', JSON.stringify(msg).substring(0, 300));
      if (msg.type === 'response') {
        const typing = messages.querySelector('.typing');
        if (typing) typing.remove();
        console.log('[WebView] adding raul message:', msg.text?.substring(0, 100));
        addMessage(msg.text, 'raul');
        isTyping = false;
      }
    });
  </script>
</body>
</html>`;
}

export function deactivate() {
  mcpServer?.stop();
  gatewayClient?.disconnect();
}
