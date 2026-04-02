import { GatewayConfig, GatewayResponse, ChatMessage } from './types';

export class GatewayClient {
  private url: string;
  private token: string;
  private debugLog: ((msg: string) => void) | null = null;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  setDebug(logger: (msg: string) => void): void {
    this.debugLog = logger;
  }

  private log(msg: string): void {
    if (this.debugLog) this.debugLog(msg);
    console.log(`[GatewayClient] ${msg}`);
  }

  updateConfig(url: string, token: string): void {
    this.url = url.replace(/\/$/, '');
    this.token = token;
  }

  async connect(): Promise<void> {
    this.log('Using HTTP OpenAI-compatible endpoint');
    // For HTTP, we don't need a persistent connection
    // Just verify the gateway is reachable
    try {
      const res = await fetch(`${this.url}/v1/models`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      if (res.ok) {
        this.log('Gateway connection verified');
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      this.log(`Connection failed: ${err}`);
      throw err;
    }
  }

  async sendMessage(text: string): Promise<string> {
    this.log(`Sending message: ${text.substring(0, 50)}...`);

    const response = await fetch(`${this.url}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({
        model: 'mini-max',
        messages: [
          { role: 'system', content: 'You are Raul, a helpful AI coding assistant. Keep responses concise and practical.' },
          { role: 'user', content: text }
        ],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      this.log(`HTTP error: ${response.status} - ${errText}`);
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    this.log(`Received response: ${JSON.stringify(data).substring(0, 100)}`);

    // Parse OpenAI-style response
    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content;
    }
    
    // Fallback: return raw data
    return JSON.stringify(data);
  }

  async exec(tool: string, args: Record<string, unknown> = {}): Promise<GatewayResponse> {
    try {
      const response = await fetch(`${this.url}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ tool, args })
      });

      const data = await response.json();
      return data;
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  onMessage(handler: (msg: ChatMessage) => void): () => void {
    // No-op for HTTP client - we don't have real-time messages
    return () => {};
  }

  disconnect(): void {
    this.log('Disconnected');
  }
}
