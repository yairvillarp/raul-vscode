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
  private connected = false;
  private debugLog: ((msg: string) => void) | null = null;
  private isDebugEnabled: (() => boolean) = () => false;
  private challengeNonce: string = '';
  private extensionContext: vscode.ExtensionContext | null = null;

  // Pending sendMessage state
  private pendingTextResolver: ((text: string) => void) | null = null;
  private pendingTextBuffer: string = '';
  private pendingTextTimer: NodeJS.Timeout | null = null;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  setExtensionContext(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
  }

  setDebugLogger(logger: (msg: string) => void): void {
    this.debugLog = logger;
  }

  setDebugEnabled(enabled: () => boolean): void {
    this.isDebugEnabled = enabled;
  }

  private log(msg: string): void {
    if (this.isDebugEnabled() && this.debugLog) this.debugLog(msg);
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
          this.log(`[WS] <<< ${JSON.stringify(msg).substring(0, 500)}`);
          
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            this.log('Got connect challenge');
            this.challengeNonce = msg.payload.nonce;
            
            const identity = generateDeviceIdentity(this.token, this.challengeNonce);
            this.log(`Generated device: ${identity.deviceId.substring(0, 16)}...`);
            
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
              this.log('[CONNECT] handshake complete! roles=' + JSON.stringify(msg.payload.auth));
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
          } else if (msg.type === 'event' && (msg.event === 'agent' || msg.event === 'chat')) {
            // Handle agent/chat events which carry streaming text in 'delta' and final text in 'message'
            const delta = msg.payload?.data?.delta;
            const fullText = msg.payload?.message?.content?.[0]?.text;
            const runId = msg.payload?.runId;
            
            if (delta !== undefined) {
              this.log(`[EVENT] ${msg.event} delta="${delta.toString().substring(0, 100)}"`);
              // Streaming token - forward to UI and accumulate
              const chatMsg: ChatMessage = {
                type: 'raul',
                text: typeof delta === 'string' ? delta : JSON.stringify(delta),
                timestamp: Date.now()
              };
              this.messageHandlers.forEach(handler => handler(chatMsg));
              
              if (this.pendingTextResolver !== null) {
                this.pendingTextBuffer += chatMsg.text;
                this.log(`[BUF] accumulated ${this.pendingTextBuffer.length} chars, resetting 2.5s flush timer`);
                if (this.pendingTextTimer) clearTimeout(this.pendingTextTimer);
                this.pendingTextTimer = setTimeout(() => {
                  if (this.pendingTextResolver) {
                    const result = this.pendingTextBuffer;
                    this.log(`[FLUSH] 2.5s timeout fired, resolving with ${result.length} chars`);
                    this.pendingTextResolver(result);
                    this.pendingTextBuffer = '';
                    this.pendingTextResolver = null;
                  }
                }, 2500);
              }
            }
            
            if (fullText !== undefined) {
              this.log(`[EVENT] ${msg.event} FULL text="${fullText.toString().substring(0, 100)}"`);
              // Final message - resolve immediately if we have a pending resolver
              if (this.pendingTextResolver !== null) {
                this.log(`[RESOLVE] got full text (${fullText.length} chars), resolving now`);
                if (this.pendingTextTimer) clearTimeout(this.pendingTextTimer);
                this.pendingTextResolver(fullText.toString());
                this.pendingTextBuffer = '';
                this.pendingTextResolver = null;
              }
            }
          } else if (msg.type === 'event' && (msg.event === 'message' || msg.event === 'token')) {
            const text = msg.payload?.text || msg.payload?.content || '';
            this.log(`[EVENT] ${msg.event} text="${text.toString().substring(0, 100)}"`);
            const sender = msg.payload?.sender === 'raul' ? 'raul' : 'user';
            
            const chatMsg: ChatMessage = {
              type: sender,
              text: typeof text === 'string' ? text : JSON.stringify(text),
              timestamp: Date.now()
            };
            
            this.messageHandlers.forEach(handler => handler(chatMsg));
            
            if (this.pendingTextResolver !== null) {
              this.pendingTextBuffer += chatMsg.text;
              if (this.pendingTextTimer) clearTimeout(this.pendingTextTimer);
              this.pendingTextTimer = setTimeout(() => {
                if (this.pendingTextResolver) {
                  const result = this.pendingTextBuffer;
                  this.pendingTextResolver(result);
                  this.pendingTextBuffer = '';
                  this.pendingTextResolver = null;
                }
              }, 2500);
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
      this.log(`[WS] >>> ${JSON.stringify(req).substring(0, 500)}`);
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
      this.log(`[SEND] text="${text.substring(0, 80)}..."`);
      
      const sessionKey = `agent:raul:vscode:${Date.now()}`;
      const idempotencyKey = `vscode-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Set up pending state for text accumulation
      this.pendingTextBuffer = '';
      
      // Wrap resolve to also clear timer and reset state
      const wrappedResolve = (result: string) => {
        this.log(`[SEND] resolving with ${result.length} chars`);
        if (this.pendingTextTimer) clearTimeout(this.pendingTextTimer);
        this.pendingTextResolver = null;
        this.pendingTextBuffer = '';
        resolve(result);
      };
      
      this.pendingTextResolver = wrappedResolve;
      
      // Timeout fallback
      const timeout = setTimeout(() => {
        if (this.pendingTextResolver === wrappedResolve) {
          this.pendingTextResolver = null;
          const result = this.pendingTextBuffer;
          this.pendingTextBuffer = '';
          this.log(`sendMessage timeout, returning ${result.length} chars`);
          resolve(result);
        }
      }, 90000);
      
      this.sendRpc('chat.send', {
        sessionKey,
        message: text,
        idempotencyKey
      }).catch((err) => {
        clearTimeout(timeout);
        if (this.pendingTextResolver === wrappedResolve) {
          this.pendingTextResolver = null;
          this.pendingTextBuffer = '';
        }
        reject(err);
      });
    });
  }

  async exec(tool: string, args: Record<string, unknown> = {}): Promise<GatewayResponse> {
    this.log(`[EXEC] calling tool='${tool}' args=${JSON.stringify(args)}`);
    try {
      const result = await this.sendRpc('tools.invoke', { tool, args }) as GatewayResponse;
      this.log(`[EXEC] result success=${result.success} error=${result.error}`);
      return result;
    } catch (err) {
      this.log(`[EXEC] threw: ${err}`);
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
    if (this.pendingTextTimer) {
      clearTimeout(this.pendingTextTimer);
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.log('Disconnected');
  }
}
