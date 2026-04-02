import * as vscode from 'vscode';

export interface RaulConfig {
  gatewayUrl: string;
  token: string;
}

const DEFAULT_CONFIG: RaulConfig = {
  gatewayUrl: 'http://localhost:18789',
  token: ''
};

export class SettingsManager {
  private context: vscode.ExtensionContext;
  private config: RaulConfig;

  constructor() {
    // Get from global state or workspace
    this.config = this.loadConfig();
  }

  private loadConfig(): RaulConfig {
    // Try workspace configuration first
    const workspaceConfig = vscode.workspace.getConfiguration('raul');
    const gatewayUrl = workspaceConfig.get<string>('gatewayUrl', DEFAULT_CONFIG.gatewayUrl);
    const token = workspaceConfig.get<string>('token', DEFAULT_CONFIG.token);

    return { gatewayUrl, token };
  }

  getConfig(): RaulConfig {
    return { ...this.config };
  }

  saveConfig(config: Partial<RaulConfig>): void {
    const workspaceConfig = vscode.workspace.getConfiguration('raul');
    
    if (config.gatewayUrl !== undefined) {
      workspaceConfig.update('gatewayUrl', config.gatewayUrl, vscode.ConfigurationTarget.Global);
      this.config.gatewayUrl = config.gatewayUrl;
    }
    
    if (config.token !== undefined) {
      workspaceConfig.update('token', config.token, vscode.ConfigurationTarget.Global);
      this.config.token = config.token;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.gatewayUrl && this.config.token);
  }
}
