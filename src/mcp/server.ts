import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { GatewayClient } from '../gateway/client';
import { McpTool } from '../gateway/types';
import { TerminalManager } from '../terminal/manager';

// Tools that Raul exposes to VS Code via MCP
const RAUL_TOOLS: McpTool[] = [
  {
    name: 'read_file',
    description: 'Read contents of a file from the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the workspace',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file' },
        content: { type: 'string', description: 'Content to write' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'exec',
    description: 'Execute a shell command in VS Code terminal',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' }
      },
      required: ['command']
    }
  },
  {
    name: 'git_status',
    description: 'Get git status of the workspace',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'git_commit',
    description: 'Commit changes with a message',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' }
      },
      required: ['message']
    }
  },
  {
    name: 'search_code',
    description: 'Search for code patterns in workspace files',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        fileFilter: { type: 'string', description: 'File pattern filter (e.g., *.ts)' }
      },
      required: ['query']
    }
  },
  {
    name: 'list_directory',
    description: 'List files in a directory',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path' }
      }
    }
  },
  {
    name: 'vscode_create_terminal',
    description: 'Create a new VS Code terminal',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Terminal name' }
      }
    }
  },
  {
    name: 'vscode_send_text',
    description: 'Send text to a VS Code terminal',
    inputSchema: {
      type: 'object',
      properties: {
        terminalId: { type: 'string', description: 'Terminal ID' },
        text: { type: 'string', description: 'Text to send' }
      },
      required: ['terminalId', 'text']
    }
  },
  {
    name: 'vscode_show_terminal',
    description: 'Show and focus a VS Code terminal',
    inputSchema: {
      type: 'object',
      properties: {
        terminalId: { type: 'string', description: 'Terminal ID' }
      },
      required: ['terminalId']
    }
  },
  {
    name: 'vscode_list_terminals',
    description: 'List all open VS Code terminals',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

export class McpServer {
  private server: Server;
  private gateway: GatewayClient;
  private terminalManager: TerminalManager;

  constructor(gateway: GatewayClient, terminalManager: TerminalManager) {
    this.gateway = gateway;
    this.terminalManager = terminalManager;

    this.server = new Server(
      {
        name: 'raul-vscode',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: RAUL_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      const a = args as Record<string, unknown>;

      try {
        let result: string;

        switch (name) {
          case 'read_file':
            const readResult = await this.gateway.exec('read', { path: String(a.path) });
            result = readResult.success ? String(readResult.data) : `Error: ${readResult.error}`;
            break;

          case 'write_file':
            const writeResult = await this.gateway.exec('write', {
              path: String(a.path),
              content: String(a.content)
            });
            result = writeResult.success ? 'File written successfully' : `Error: ${writeResult.error}`;
            break;

          case 'exec':
            // Use VS Code terminal for execution
            try {
              const execResult = await this.terminalManager.runCommand(
                String(a.command),
                a.cwd ? String(a.cwd) : undefined
              );
              result = execResult.stdout || `(exited with code ${execResult.exitCode})`;
              if (execResult.stderr) {
                result += `\nSTDERR:\n${execResult.stderr}`;
              }
            } catch (err) {
              result = `Error: ${err}`;
            }
            break;

          case 'git_status':
            const statusResult = await this.gateway.exec('exec', { command: 'git status --short' });
            result = statusResult.success ? String(statusResult.data) : `Error: ${statusResult.error}`;
            break;

          case 'git_commit':
            const commitResult = await this.gateway.exec('exec', {
              command: `git add -A && git commit -m "${String(a.message)}"`
            });
            result = commitResult.success ? String(commitResult.data) : `Error: ${commitResult.error}`;
            break;

          case 'search_code':
            const searchResult = await this.gateway.exec('exec', {
              command: `grep -r "${String(a.query)}" ${String(a.fileFilter || '.')} --include="*.ts" --include="*.js" 2>/dev/null | head -50`
            });
            result = searchResult.success ? String(searchResult.data) : `Error: ${searchResult.error}`;
            break;

          case 'list_directory':
            const lsResult = await this.gateway.exec('exec', {
              command: `ls -la ${String(a.path || '.')}`
            });
            result = lsResult.success ? String(lsResult.data) : `Error: ${lsResult.error}`;
            break;

          case 'vscode_create_terminal':
            const term = this.terminalManager.createTerminal(String(a.name || 'Raul'));
            result = `Created terminal: ${term.name} (ID: ${term.id})`;
            break;

          case 'vscode_send_text':
            this.terminalManager.sendText(String(a.terminalId), String(a.text));
            result = `Sent to terminal ${a.terminalId}: ${a.text}`;
            break;

          case 'vscode_show_terminal':
            this.terminalManager.showTerminal(String(a.terminalId));
            result = `Showed terminal ${a.terminalId}`;
            break;

          case 'vscode_list_terminals':
            const terminals = this.terminalManager.listTerminals();
            result = terminals.length 
              ? terminals.map(t => `${t.id}: ${t.name}`).join('\n')
              : 'No terminals open';
            break;

          default:
            result = `Unknown tool: ${name}`;
        }

        return {
          content: [{ type: 'text', text: result }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error}` }],
          isError: true
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  stop() {
    this.server.close();
  }
}
