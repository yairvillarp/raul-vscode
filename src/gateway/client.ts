import { GatewayConfig, GatewayResponse, ChatMessage } from './types';

export class GatewayClient {
  private url: string;
  private token: string;
  private ws: WebSocket | null = null;
  private messageHandlers: Set<(msg: ChatMessage) => void> = new Set();
  private reconnectTimer: NodeJS.Timeout | null = null;

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
      try {
        const wsUrl = this.url.replace('http', 'ws') + '/ws';
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          // Authenticate
          this.ws?.send(JSON.stringify({
            type: 'auth',
            token: this.token
          }));
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'message') {
              const msg: ChatMessage = {
                type: data.sender === 'raul' ? 'raul' : 'user',
                text: data.text,
                timestamp: Date.now()
              };
              this.messageHandlers.forEach(handler => handler(msg));
            }
          } catch (e) {
            console.error('Failed to parse WS message:', e);
          }
        };

        this.ws.onclose = () => {
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          console.error('Gateway WS error:', err);
          reject(err);
        };
      } catch (err) {
        reject(err);
      }
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

  async sendMessage(text: string): Promise<string> {
    // Use HTTP for chat messages (simpler for request/response)
    const response = await fetch(this.url + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || data.response || JSON.stringify(data);
  }

  async exec(command: string, args: Record<string, unknown> = {}): Promise<GatewayResponse> {
    const response = await fetch(this.url + '/api/tools/exec', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ tool: command, args })
    });

    return response.json();
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
  }
}
