import * as vscode from 'vscode';

export interface RaulConfig {
  gatewayUrl: string;
  token: string;
  debug: boolean;
  debugChat: boolean;
  debugTools: boolean;
}

const DEFAULT_CONFIG: RaulConfig = {
  gatewayUrl: 'http://localhost:18789',
  token: '',
  debug: false,
  debugChat: false,
  debugTools: false
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
    const debugChat = workspaceConfig.get<boolean>('debugChat', DEFAULT_CONFIG.debugChat);
    const debugTools = workspaceConfig.get<boolean>('debugTools', DEFAULT_CONFIG.debugTools);

    return { gatewayUrl, token, debug, debugChat, debugTools };
  }

  getConfig(): RaulConfig {
    return { ...this.config };
  }

  isDebugEnabled(): boolean {
    const workspaceConfig = vscode.workspace.getConfiguration('raul');
    return workspaceConfig.get<boolean>('debug', DEFAULT_CONFIG.debug);
  }

  isDebugChatEnabled(): boolean {
    const workspaceConfig = vscode.workspace.getConfiguration('raul');
    return workspaceConfig.get<boolean>('debugChat', DEFAULT_CONFIG.debugChat);
  }

  isDebugToolsEnabled(): boolean {
    const workspaceConfig = vscode.workspace.getConfiguration('raul');
    return workspaceConfig.get<boolean>('debugTools', DEFAULT_CONFIG.debugTools);
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

    if (config.debugChat !== undefined) {
      workspaceConfig.update('debugChat', config.debugChat, vscode.ConfigurationTarget.Global);
      this.config.debugChat = config.debugChat;
    }

    if (config.debugTools !== undefined) {
      workspaceConfig.update('debugTools', config.debugTools, vscode.ConfigurationTarget.Global);
      this.config.debugTools = config.debugTools;
    }
  }

  isConfigured(): boolean {
    return !!(this.config.gatewayUrl && this.config.token);
  }
}
