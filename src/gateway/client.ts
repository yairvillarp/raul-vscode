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

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  updateConfig(url: string, token: string): void {
    this.url = url;
    this.token = token;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.url.replace('http', 'ws') + '/ws';
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            // Handle challenge - send connect request
            const nonce = msg.payload.nonce;
            const connectReq = {
              type: 'req',
              id: String(++this.requestId),
              method: 'connect',
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: 'raul-vscode',
                  version: '0.1.0',
                  platform: 'vscode',
                  mode: 'operator'
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                caps: [],
                commands: [],
                permissions: {},
                auth: { token: this.token },
                locale: 'en-US',
                userAgent: 'raul-vscode/0.1.0'
              }
            };
            this.ws?.send(JSON.stringify(connectReq));
          } else if (msg.type === 'res' && msg.ok) {
            if (msg.payload?.type === 'hello-ok') {
              this.connected = true;
              resolve();
            }
            // Handle pending request responses
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              pending.resolve(msg.payload);
            }
          } else if (msg.type === 'res' && !msg.ok) {
            // Reject pending request
            const pending = this.pendingRequests.get(msg.id);
            if (pending) {
              this.pendingRequests.delete(msg.id);
              pending.reject(new Error(msg.error || 'Request failed'));
            }
          } else if (msg.type === 'event' && msg.event === 'message') {
            // Incoming message from agent
            const chatMsg: ChatMessage = {
              type: msg.payload.sender === 'raul' ? 'raul' : 'user',
              text: msg.payload.text,
              timestamp: Date.now()
            };
            this.messageHandlers.forEach(handler => handler(chatMsg));
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (e) {
        console.error('Reconnect failed:', e);
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
      this.ws?.send(JSON.stringify(req));

      // Timeout
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
    try {
      const result = await this.sendRpc('message.send', { text }) as { text?: string };
      return result?.text || 'OK';
    } catch (err) {
      console.error('sendMessage error:', err);
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

  onMessage(handler: (msg: ChatMessage) => void) {
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
  }
}
