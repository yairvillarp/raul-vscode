import * as vscode from 'vscode';
import { GatewayClient } from '../gateway/client';
import { SettingsManager } from '../settings';
import { TerminalManager } from '../terminal/manager';

export function registerCommands(context: vscode.ExtensionContext, gateway: GatewayClient, settings: SettingsManager, terminalManager: TerminalManager) {
  // Quick ask about selected code
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.ask', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const selection = editor.document.getText(editor.selection);
      if (!selection) {
        vscode.window.showWarningMessage('No text selected');
        return;
      }

      const response = await gateway.sendMessage(
        `Explain this code:\n\`\`\`\n${selection}\n\`\`\``
      );
      vscode.window.showInformationMessage(response);
    })
  );

  // Explain code
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.explain', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.document.getText(editor.selection);
      if (!selection) return;

      const response = await gateway.sendMessage(
        `What does this code do? Explain it clearly:\n\`\`\`\n${selection}\n\`\`\``
      );

      // Show in a proper document
      const doc = await vscode.workspace.openTextDocument({
        content: `# Code Explanation\n\n**Selected Code:**\n\`\`\`\n${selection}\n\`\`\`\n\n**Explanation:**\n${response}`,
        language: 'markdown'
      });
      vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    })
  );

  // Refactor code
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.refactor', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.document.getText(editor.selection);
      if (!selection) return;

      const response = await gateway.sendMessage(
        `Refactor this code to be cleaner, more efficient, and follow best practices. Provide the refactored code with explanations:\n\`\`\`\n${selection}\n\`\`\``
      );

      // Show refactored code
      const doc = await vscode.workspace.openTextDocument({
        content: response,
        language: editor.document.languageId
      });
      vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    })
  );

  // Generate code from prompt
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.generate', async () => {
      const prompt = await vscode.window.showInputBox({
        prompt: 'Describe what code you want to generate',
        placeHolder: 'e.g., A React hook for fetching data with loading states'
      });

      if (!prompt) return;

      const editor = vscode.window.activeTextEditor;
      const language = editor?.document.languageId || 'javascript';

      const response = await gateway.sendMessage(
        `Generate ${language} code for: ${prompt}. Provide only the code with minimal explanation.`
      );

      // Create new document with generated code
      const doc = await vscode.workspace.openTextDocument({
        content: response,
        language
      });
      vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    })
  );

  // Open Raul terminal
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.openTerminal', async () => {
      const term = terminalManager.createTerminal('Raul');
      term.terminal.show();
      vscode.window.showInformationMessage(`Terminal "${term.name}" opened`);
    })
  );

  // Run selected code in terminal
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.runInTerminal', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('No active editor');
        return;
      }

      const selection = editor.document.getText(editor.selection);
      if (!selection) {
        // No selection, run the whole file
        const doc = editor.document;
        const fullText = doc.getText();
        
        let term = terminalManager.listTerminals().find(t => t.name === 'Raul');
        if (!term) {
          term = terminalManager.createTerminal('Raul');
        }
        term.terminal.sendText(fullText);
        term.terminal.show();
      } else {
        // Run selection
        let term = terminalManager.listTerminals().find(t => t.name === 'Raul');
        if (!term) {
          term = terminalManager.createTerminal('Raul');
        }
        term.terminal.sendText(selection);
        term.terminal.show();
      }
    })
  );

  // Kill terminal
  context.subscriptions.push(
    vscode.commands.registerCommand('raul.killTerminal', async () => {
      const terminals = terminalManager.listTerminals();
      if (terminals.length === 0) {
        vscode.window.showInformationMessage('No Raul terminals open');
        return;
      }
      
      const choice = await vscode.window.showQuickPick(
        terminals.map(t => t.name),
        { placeHolder: 'Select terminal to close' }
      );
      
      if (choice) {
        const term = terminals.find(t => t.name === choice);
        if (term) {
          terminalManager.disposeTerminal(term.id);
          vscode.window.showInformationMessage(`Terminal "${choice}" closed`);
        }
      }
    })
  );
}
