import * as vscode from 'vscode';

export interface RaulConfig {
  gatewayUrl: string;
  token: string;
  debug: boolean;
}

const DEFAULT_CONFIG: RaulConfig = {
  gatewayUrl: 'http://localhost:18789',
  token: '',
  debug: false
};

export class SettingsManager {
  private config: RaulConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): RaulConfig {
    const workspaceConfig = vscode.workspace.getConfiguration('raul');
    const gatewayUrl = workspaceConfig.get<string>('gatewayUrl', DEFAULT_CONFIG.gatewayUrl);
    const token = workspaceConfig.get<string>('token', DEFAULT_CONFIG.token);
    const debug = workspaceConfig.get<boolean>('debug', DEFAULT_CONFIG.debug);

    return { gatewayUrl, token, debug };
  }

  getConfig(): RaulConfig {
    return { ...this.config };
  }

  isDebugEnabled(): boolean {
    const workspaceConfig = vscode.workspace.getConfiguration('raul');
    return workspaceConfig.get<boolean>('debug', DEFAULT_CONFIG.debug);
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

    if (config.debug !== undefined) {
      workspaceConfig.update('debug', config.debug, vscode.ConfigurationTarget.Global);
      this.config.debug = config.debug;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.gatewayUrl && this.config.token);
  }
}
