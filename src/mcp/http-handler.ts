/**
 * MCP HTTP Handler for Kalshi SDK
 * Handles authentication, request validation, and tool execution
 */

import { Request, Response, NextFunction } from 'express';
import { getApiKeyService } from '../services/apikey.service.js';
import { kalshiTools, executeTool, ToolContext } from './tools.js';

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPHttpHandler {
  /**
   * Handle MCP requests
   */
  async handleRequest(req: Request, res: Response): Promise<void> {
    const body: MCPRequest = req.body;

    // Validate JSON-RPC format
    if (!body || body.jsonrpc !== '2.0' || !body.method) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: body?.id || null,
        error: {
          code: -32600,
          message: 'Invalid JSON-RPC request',
        },
      });
      return;
    }

    try {
      // Handle different MCP methods
      switch (body.method) {
        case 'initialize':
          res.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: {
                name: 'quantish-kalshi-sdk',
                version: '1.0.0',
              },
              capabilities: {
                tools: {},
              },
            },
          });
          return;

        case 'tools/list':
          res.json({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: kalshiTools,
            },
          });
          return;

        case 'tools/call':
          await this.handleToolCall(req, res, body);
          return;

        default:
          res.json({
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32601,
              message: `Method not found: ${body.method}`,
            },
          });
          return;
      }
    } catch (error: any) {
      console.error('MCP Error:', error);
      res.json({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32603,
          message: error.message || 'Internal error',
        },
      });
    }
  }

  /**
   * Handle tool calls with authentication
   */
  private async handleToolCall(req: Request, res: Response, body: MCPRequest): Promise<void> {
    const { name, arguments: args } = body.params || {};

    if (!name) {
      res.json({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32602,
          message: 'Tool name required',
        },
      });
      return;
    }

    // Check if tool exists
    const tool = kalshiTools.find(t => t.name === name);
    if (!tool) {
      res.json({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32602,
          message: `Unknown tool: ${name}`,
        },
      });
      return;
    }

    // Build context
    const context: ToolContext = {};

    // Unauthenticated tools (no API key required)
    const unauthenticatedTools = [
      'kalshi_signup',              // Self-service signup - creates user + wallet + API key
      'kalshi_request_api_key',
      'kalshi_get_wallet_import_instructions',
      'kalshi_import_private_key',  // Creates new user, no existing auth needed
      // Read-only market discovery (public data from DFlow)
      'kalshi_search_markets',
      'kalshi_get_market',
      'kalshi_get_events',
      'kalshi_get_live_data',
      'kalshi_check_market_initialization',
      'kalshi_check_redemption_status',
      'kalshi_get_market_by_mint',
    ];
    
    console.log(`[MCP] Tool call: ${name}, is unauthenticated: ${unauthenticatedTools.includes(name)}`);
    
    if (!unauthenticatedTools.includes(name)) {
      // Require authentication
      const apiKey = req.headers['x-api-key'] as string;
      
      if (!apiKey) {
        res.json({
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32000,
            message: 'API key required',
          },
        });
        return;
      }

      const apiKeyService = getApiKeyService();
      const validation = await apiKeyService.validateApiKey(apiKey);

      if (!validation.isValid) {
        res.json({
          jsonrpc: '2.0',
          id: body.id,
          error: {
            code: -32000,
            message: validation.message || 'Invalid API key',
          },
        });
        return;
      }

      context.userId = validation.userId;

      // Optional HMAC validation
      const hmacSignature = req.headers['x-hmac-signature'] as string;
      const hmacTimestamp = req.headers['x-hmac-timestamp'] as string;

      if (hmacSignature && hmacTimestamp && validation.keyRecord?.apiSecret) {
        const bodyString = JSON.stringify(req.body);
        const isValidHmac = apiKeyService.validateHmacSignature(
          validation.keyRecord.apiSecret,
          hmacTimestamp,
          req.method,
          req.originalUrl,
          bodyString,
          hmacSignature
        );

        if (!isValidHmac) {
          res.json({
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32000,
              message: 'Invalid HMAC signature',
            },
          });
          return;
        }
      }
    }

    try {
      const result = await executeTool(name, args || {}, context);
      
      res.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      });
    } catch (error: any) {
      console.error(`Tool ${name} error:`, error);
      res.json({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: -32603,
          message: error.message || 'Tool execution failed',
        },
      });
    }
  }
}

// Singleton
let handlerInstance: MCPHttpHandler | null = null;

export function getMCPHttpHandler(): MCPHttpHandler {
  if (!handlerInstance) {
    handlerInstance = new MCPHttpHandler();
  }
  return handlerInstance;
}

