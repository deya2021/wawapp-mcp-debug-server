import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getTools } from './tool-registry.js';
import { environmentName, currentEnv } from '../config/environment.js';

export async function startMCPServer(): Promise<void> {
  const server = new Server(
    {
      name: 'wawapp-debug',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = getTools();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  // Register call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tools = getTools();
    const tool = tools.find((t) => t.name === request.params.name);

    if (!tool) {
      throw new Error(`Tool ${request.params.name} not found`);
    }

    try {
      const result = await tool.handler(request.params.arguments || {});

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: error.message,
                code: error.code || 'INTERNAL_ERROR',
                details: error.details,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[MCP] WawApp Debug Server running on stdio (env: ${environmentName}, project: ${currentEnv.projectId})`
  );
  console.error(`[MCP] Tools registered: ${getTools().length}`);
}
