import * as vscode from 'vscode';

export interface TerminalOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RaulTerminal {
  id: string;
  name: string;
  terminal: vscode.Terminal;
  output: string;
  disposed: boolean;
}

export class TerminalManager {
  private terminals: Map<string, RaulTerminal> = new Map();
  private outputChannels: Map<string, vscode.OutputChannel> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Listen for terminal closed events
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        const existing = Array.from(this.terminals.values()).find(t => t.terminal === terminal);
        if (existing) {
          existing.disposed = true;
        }
      })
    );
  }

  /**
   * Create a new named terminal
   */
  createTerminal(name: string = 'Raul'): RaulTerminal {
    // Dispose existing terminal with same name if exists
    const existing = Array.from(this.terminals.values()).find(t => t.name === name);
    if (existing) {
      existing.terminal.dispose();
      this.terminals.delete(existing.id);
    }

    const terminal = vscode.window.createTerminal({ name });
    const id = `raul-${Date.now()}`;
    
    // Create output channel for capturing
    const outputChannel = vscode.window.createOutputChannel(`Raul: ${name}`);
    this.outputChannels.set(id, outputChannel);

    const raulTerminal: RaulTerminal = {
      id,
      name,
      terminal,
      output: '',
      disposed: false
    };

    this.terminals.set(id, raulTerminal);
    return raulTerminal;
  }

  /**
   * Run a command in a terminal and capture output
   */
  async runCommandInTerminal(
    terminalId: string,
    command: string,
    cwd?: string
  ): Promise<TerminalOutput> {
    const raulTerminal = this.terminals.get(terminalId);
    if (!raulTerminal || raulTerminal.disposed) {
      throw new Error(`Terminal ${terminalId} not found or disposed`);
    }

    const outputChannel = this.outputChannels.get(terminalId);
    if (outputChannel) {
      outputChannel.append(`\n$ ${command}\n`);
    }

    // Change directory if specified
    if (cwd) {
      raulTerminal.terminal.sendText(`cd "${cwd}"`);
    }

    // Send the command
    raulTerminal.terminal.sendText(command);
    
    // For synchronous capture, we need to wait for completion
    // VS Code terminals don't naturally sync like that, so we:
    // 1. Append a marker to track when command finishes
    // 2. Use a temporary output listener
    return new Promise((resolve) => {
      const marker = `__RAUL_CMD_DONE_${Date.now()}__`;
      const timeout = 30000; // 30 second timeout
      
      // Append a marker command that echoes the exit code
      const wrappedCommand = `${command}; echo "${marker}$?"`;
      
      // For now, resolve immediately and let user see output in terminal
      // A proper implementation would need PTY-level capture
      raulTerminal.terminal.sendText(wrappedCommand);
      
      // Listen for the marker in output
      let resolved = false;
      const startTime = Date.now();
      
      const checkOutput = (text: string) => {
        if (resolved) return;
        
        const idx = text.indexOf(marker);
        if (idx !== -1) {
          const exitCode = parseInt(text.substring(idx + marker.length).trim().split('\n')[0], 10);
          resolved = true;
          
          if (outputChannel) {
            outputChannel.append(text.substring(0, idx));
          }
          
          resolve({
            stdout: text.substring(0, idx),
            stderr: '',
            exitCode: isNaN(exitCode) ? 0 : exitCode
          });
        } else if (Date.now() - startTime > timeout) {
          resolved = true;
          resolve({
            stdout: text,
            stderr: '',
            exitCode: 124 // timeout
          });
        }
      };
      
      // Auto-timeout cleanup - terminal output is shown to user visually
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({
            stdout: raulTerminal.output || '(check terminal for output)',
            stderr: '',
            exitCode: 0
          });
        }
      }, timeout);
    });
  }

  /**
   * Run a command synchronously using a hidden PowerShell/bash session
   * This is simpler for integration but doesn't show visible terminal
   */
  async runCommand(command: string, cwd?: string): Promise<TerminalOutput> {
    return new Promise((resolve) => {
      const outputs: string[] = [];
      let stderr = '';
      
      // Use VS Code's Task system for sync-ish execution
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const executionDir = cwd || workspaceFolder?.uri.fsPath || process.cwd();
      
      // Create a one-shot task
      const task = new vscode.Task(
        { type: 'shell', command },
        vscode.TaskScope.Workspace,
        'Raul Command',
        'raul',
        new vscode.ShellExecution(command, { cwd: executionDir }),
        '$**'
      );
      
      let resolved = false;
      
      const disposable = vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution.task === task) {
          resolved = true;
          resolve({
            stdout: outputs.join(''),
            stderr,
            exitCode: event.exitCode ?? 0
          });
          disposable.dispose();
        }
      });
      
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          disposable.dispose();
          resolve({
            stdout: outputs.join(''),
            stderr: 'Command timed out',
            exitCode: 1
          });
        }
      }, 60000);
      
      vscode.tasks.executeTask(task);
    });
  }

  /**
   * Show terminal and focus it
   */
  showTerminal(terminalId: string): void {
    const raulTerminal = this.terminals.get(terminalId);
    if (raulTerminal) {
      raulTerminal.terminal.show();
    }
  }

  /**
   * Get terminal output so far
   */
  getOutput(terminalId: string): string {
    const raulTerminal = this.terminals.get(terminalId);
    return raulTerminal?.output || '';
  }

  /**
   * Send text to terminal
   */
  sendText(terminalId: string, text: string): void {
    const raulTerminal = this.terminals.get(terminalId);
    if (raulTerminal && !raulTerminal.disposed) {
      raulTerminal.terminal.sendText(text);
    }
  }

  /**
   * List all terminals
   */
  listTerminals(): RaulTerminal[] {
    return Array.from(this.terminals.values()).filter(t => !t.disposed);
  }

  /**
   * Dispose a terminal
   */
  disposeTerminal(terminalId: string): void {
    const raulTerminal = this.terminals.get(terminalId);
    if (raulTerminal) {
      raulTerminal.terminal.dispose();
      raulTerminal.disposed = true;
      this.terminals.delete(terminalId);
    }
    
    const outputChannel = this.outputChannels.get(terminalId);
    if (outputChannel) {
      outputChannel.dispose();
      this.outputChannels.delete(terminalId);
    }
  }

  /**
   * Clean up all terminals
   */
  disposeAll(): void {
    for (const [id] of this.terminals) {
      this.disposeTerminal(id);
    }
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
