import { GatewayConfig, GatewayResponse, ChatMessage } from './types';
import * as vscode from 'vscode';
import { generateDeviceIdentity } from './crypto';

export class GatewayClient {
  private url: string;
  private token: string;
  private ws: WebSocket | null = null;
  private messageHandlers: Set<(msg: ChatMessage) => void> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private requestId = 0;
  private pendingRequests: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private pendingResponses: Map<string, (text: string) => void> = new Map();
  private connected = false;
  private debugLog: ((msg: string) => void) | null = null;
  private challengeNonce: string = '';
  private extensionContext: vscode.ExtensionContext | null = null;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  setExtensionContext(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
  }

  setDebug(logger: (msg: string) => void): void {
    this.debugLog = logger;
  }

  private log(msg: string): void {
    if (this.debugLog) this.debugLog(msg);
    console.log(`[GatewayClient] ${msg}`);
  }

  updateConfig(url: string, token: string): void {
    this.url = url;
    this.token = token;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.url.replace('http', 'ws') + '/ws';
      this.log(`Connecting to ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        this.log('Connection timeout');
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.onopen = () => {
        this.log('WebSocket opened');
        clearTimeout(timeout);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            this.log('Got connect challenge');
            this.challengeNonce = msg.payload.nonce;
            
            // Generate device identity using extension host crypto
            const identity = generateDeviceIdentity(this.token, this.challengeNonce);
            this.log(`Generated device: ${identity.deviceId.substring(0, 16)}...`);
            
            // Proper connect with valid client.id and client.mode + device auth
            const connectReq = {
              type: 'req',
              id: String(++this.requestId),
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: 'cli',
                  version: '1.2.3',
                  platform: 'darwin',
                  mode: 'cli'
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write', 'operator.admin'],
                auth: { token: this.token },
                locale: 'en-US',
                userAgent: 'raul-vscode/0.1.0',
                device: {
                  id: identity.deviceId,
                  publicKey: identity.publicKey,
                  signature: identity.signature,
                  signedAt: identity.signedAt,
                  nonce: this.challengeNonce
                }
              }
            };
            this.log('Sending connect with Ed25519 device auth...');
            this.ws?.send(JSON.stringify(connectReq));
          } else if (msg.type === 'res' && msg.ok) {
            if (msg.payload?.type === 'hello-ok') {
              this.log('Connected! Gateway handshake complete');
              this.connected = true;
              resolve();
            }
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              pending.resolve(msg.payload);
            }
          } else if (msg.type === 'res' && !msg.ok) {
            this.log(`Request failed: ${JSON.stringify(msg.error || msg)}`);
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              pending.reject(new Error(msg.error?.message || 'Request failed'));
            }
          } else if (msg.type === 'event' && (msg.event === 'message' || msg.event === 'token')) {
            // Forward to registered message handlers AND resolve pending responses
            const text = msg.payload?.text || msg.payload?.content || '';
            const sender = msg.payload?.sender === 'raul' ? 'raul' : 'user';
            
            const chatMsg: ChatMessage = {
              type: sender,
              text: typeof text === 'string' ? text : JSON.stringify(text),
              timestamp: Date.now()
            };
            this.messageHandlers.forEach(handler => handler(chatMsg));
            
            // Resolve any pending sendMessage that was waiting for this session
            if (msg.payload?.sessionKey) {
              const resolver = this.pendingResponses.get(msg.payload.sessionKey);
              if (resolver) {
                resolver(chatMsg.text);
                this.pendingResponses.delete(msg.payload.sessionKey);
              }
            }
          }
        } catch (e) {
          this.log(`Error: ${e}`);
        }
      };

      this.ws.onclose = (event) => {
        this.log(`WebSocket closed: code=${event.code} reason=${event.reason || 'none'}`);
        this.connected = false;
        if (this.reconnectTimer) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        this.log(`WebSocket error: ${JSON.stringify(err)}`);
        clearTimeout(timeout);
        reject(err);
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.log('Scheduling reconnect in 5s...');
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (e) {
        this.log(`Reconnect failed: ${e}`);
      }
    }, 5000);
  }

  private async sendRpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    return new Promise((resolve, reject) => {
      const id = String(++this.requestId);
      this.pendingRequests.set(id, { resolve, reject });
      
      const req = { type: 'req', id, method, params };
      this.log(`Sending RPC: ${method}`);
      this.ws?.send(JSON.stringify(req));

      setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          pending.reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async sendMessage(text: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.log(`Sending message: ${text.substring(0, 50)}...`);
      
      // chat.send requires: sessionKey, message (string), idempotencyKey
      const sessionKey = `agent:raul:vscode:${Date.now()}`;
      const idempotencyKey = `vscode-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Timeout if no response
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(sessionKey);
        reject(new Error('Message send timeout'));
      }, 60000);
      
      // Store pending response handler
      this.pendingResponses.set(sessionKey, (responseText: string) => {
        clearTimeout(timeout);
        resolve(responseText);
      });
      
      this.sendRpc('chat.send', {
        sessionKey,
        message: text,
        idempotencyKey
      }).catch((err) => {
        clearTimeout(timeout);
        this.pendingResponses.delete(sessionKey);
        reject(err);
      });
    });
  }

  async exec(tool: string, args: Record<string, unknown> = {}): Promise<GatewayResponse> {
    try {
      const result = await this.sendRpc('tools.invoke', { tool, args }) as GatewayResponse;
      return result;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  onMessage(handler: (msg: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.log('Disconnected');
  }
}
