export interface GatewayConfig {
  url: string;
  token: string;
}

export interface ChatMessage {
  type: 'user' | 'raul' | 'system';
  text: string;
  timestamp: number;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface GatewayResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
