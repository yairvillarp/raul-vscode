import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { GatewayClient } from '../gateway/client';
import { McpTool } from '../gateway/types';

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
    description: 'Execute a shell command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory' }
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
  }
];

export class McpServer {
  private server: Server;
  private gateway: GatewayClient;

  constructor(gateway: GatewayClient) {
    this.gateway = gateway;

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
      const { name, arguments: args } = request.params;

      try {
        let result: string;

        switch (name) {
          case 'read_file':
            const readResult = await this.gateway.exec('read', { path: args.path });
            result = readResult.success ? String(readResult.data) : `Error: ${readResult.error}`;
            break;

          case 'write_file':
            const writeResult = await this.gateway.exec('write', {
              path: args.path,
              content: args.content
            });
            result = writeResult.success ? 'File written successfully' : `Error: ${writeResult.error}`;
            break;

          case 'exec':
            const execResult = await this.gateway.exec('exec', {
              command: args.command,
              cwd: args.cwd
            });
            result = execResult.success ? String(execResult.data) : `Error: ${execResult.error}`;
            break;

          case 'git_status':
            const statusResult = await this.gateway.exec('exec', { command: 'git status --short' });
            result = statusResult.success ? String(statusResult.data) : `Error: ${statusResult.error}`;
            break;

          case 'git_commit':
            const commitResult = await this.gateway.exec('exec', {
              command: `git add -A && git commit -m "${args.message}"`
            });
            result = commitResult.success ? String(commitResult.data) : `Error: ${commitResult.error}`;
            break;

          case 'search_code':
            const searchResult = await this.gateway.exec('exec', {
              command: `grep -r "${args.query}" ${args.fileFilter || '.'} --include="*.ts" --include="*.js" 2>/dev/null | head -50`
            });
            result = searchResult.success ? String(searchResult.data) : `Error: ${searchResult.error}`;
            break;

          case 'list_directory':
            const lsResult = await this.gateway.exec('exec', {
              command: `ls -la ${args.path || '.'}`
            });
            result = lsResult.success ? String(lsResult.data) : `Error: ${lsResult.error}`;
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
