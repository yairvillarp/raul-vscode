import * as vscode from 'vscode';
import { GatewayClient } from './gateway/client';
import { McpServer } from './mcp/server';
import { registerCommands } from './commands';

// Global instances
let gatewayClient: GatewayClient;
let mcpServer: McpServer;
let chatPanel: vscode.WebviewPanel | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('raul');
  const gatewayUrl = config.get<string>('gatewayUrl', 'http://localhost:18789');
  const token = config.get<string>('token', '');

  // Initialize gateway client
  gatewayClient = new GatewayClient(gatewayUrl, token);
  await gatewayClient.connect();

  // Initialize MCP server (Raul as MCP server for tools)
  mcpServer = new McpServer(gatewayClient);
  await mcpServer.start();

  // Register VS Code commands
  registerCommands(context, gatewayClient);

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

  // Get the webview HTML
  const webviewHtml = getWebviewHtml(context);
  chatPanel.webview.html = webviewHtml;

  // Handle messages from webview
  chatPanel.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'chat':
        const response = await gatewayClient.sendMessage(message.text);
        chatPanel?.webview.postMessage({ type: 'response', text: response });
        break;
      case 'execute':
        await vscode.commands.executeCommand(message.command);
        break;
    }
  });

  chatPanel.onDidDispose(() => {
    chatPanel = undefined;
  });
}

function getWebviewHtml(context: vscode.ExtensionContext): string {
  const scriptUri = chatPanel?.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview.js')
  ) || '';

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
      gap: 10px;
    }
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
    #header span { color: #6px; font-size: 12px; }
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
    }
  </style>
</head>
<body>
  <div id="header">
    <div class="avatar">🤖</div>
    <div>
      <h2>Raul</h2>
      <span id="status">● Connected</span>
    </div>
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
    const status = document.getElementById('status');

    let isTyping = false;

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || isTyping) return;

      // Add user message
      addMessage(text, 'user');
      input.value = '';

      // Show typing indicator
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
      if (msg.type === 'response') {
        // Remove typing indicator
        const typing = messages.querySelector('.typing');
        if (typing) typing.remove();

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
