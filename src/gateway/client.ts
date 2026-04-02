import { GatewayConfig, GatewayResponse, ChatMessage } from './types';

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
  private challengeNonce: string = '';
  private deviceKeyPair: CryptoKeyPair | null = null;
  private deviceId: string = '';

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
    this.deviceId = 'raul-vscode-' + Math.random().toString(36).substring(2, 15);
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

  private async generateKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );
  }

  private async exportPublicKey(): Promise<string> {
    if (!this.deviceKeyPair) throw new Error('No key pair');
    const exported = await crypto.subtle.exportKey('spki', this.deviceKeyPair.publicKey);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  private async sign(data: string): Promise<string> {
    if (!this.deviceKeyPair) throw new Error('No key pair');
    const encoder = new TextEncoder();
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.deviceKeyPair.privateKey,
      encoder.encode(data)
    );
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
  }

  async connect(): Promise<void> {
    // Generate key pair if not exists
    if (!this.deviceKeyPair) {
      this.log('Generating device key pair...');
      this.deviceKeyPair = await this.generateKeyPair();
    }

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
            
            // Get public key
            const publicKey = await this.exportPublicKey();
            
            // Sign the v2 payload: clientId + role + scopes + token + nonce
            const signPayload = JSON.stringify({
              clientId: 'cli',
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              token: this.token,
              nonce: this.challengeNonce
            });
            const signature = await this.sign(signPayload);

            // Send connect request with device auth
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
                  platform: 'macos',
                  mode: 'operator'
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                caps: [],
                commands: [],
                permissions: {},
                auth: { token: this.token },
                locale: 'en-US',
                userAgent: 'raul-vscode/0.1.0',
                device: {
                  id: this.deviceId,
                  publicKey: publicKey,
                  signature: signature,
                  signedAt: Date.now(),
                  nonce: this.challengeNonce
                }
              }
            };
            this.log('Sending connect with device auth...');
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
          } else if (msg.type === 'event' && msg.event === 'message') {
            const chatMsg: ChatMessage = {
              type: msg.payload?.sender === 'raul' ? 'raul' : 'user',
              text: msg.payload?.text || '',
              timestamp: Date.now()
            };
            this.messageHandlers.forEach(handler => handler(chatMsg));
          } else if (msg.type === 'event' && msg.event === 'token') {
            this.messageHandlers.forEach(handler => handler({
              type: 'raul',
              text: msg.payload?.text || '',
              timestamp: Date.now()
            }));
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
    this.log(`Sending message: ${text.substring(0, 50)}...`);
    try {
      const result = await this.sendRpc('message.send', { text }) as { text?: string };
      this.log('Got response');
      return result?.text || '';
    } catch (err) {
      this.log(`sendMessage error: ${err}`);
      throw err;
    }
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
