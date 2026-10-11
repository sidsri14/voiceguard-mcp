import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { VoiceGuard } from './voice_guard.mjs';

export const guard = new VoiceGuard();

function asToolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

export function createVoiceGuardServer(guardInstance = guard) {
  const server = new McpServer({
    name: 'voiceguard-mcp',
    version: '1.0.0'
  });

  server.registerTool(
    'evaluate_voice_action',
    {
      description: 'Evaluate a simulated Alexa+ transcript and proposed tool action against local safety and spend policy.',
      inputSchema: z.object({
        sessionId: z.string().min(1),
        transcript: z.string().max(2000).default(''),
        action: z.string().min(1),
        amount: z.number().nonnegative().default(0)
      })
    },
    async (input) => asToolResult(guardInstance.evaluateAction(input))
  );

  server.registerTool(
    'resolve_voice_confirmation',
    {
      description: 'Approve or deny a one-time confirmation challenge created for a high-value simulated action.',
      inputSchema: z.object({
        challengeId: z.string().uuid(),
        approved: z.boolean()
      })
    },
    async (input) => asToolResult(guardInstance.resolveChallenge(input))
  );

  server.registerTool(
    'get_voiceguard_audit',
    {
      description: 'Return recent policy decisions, counters, spend, and hash-chain integrity status.',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20)
      })
    },
    async ({ limit }) => asToolResult(guardInstance.getAuditSummary(limit))
  );

  return server;
}

export function createVoiceGuardHandler(guardInstance = guard) {
  return createMcpHandler(() => createVoiceGuardServer(guardInstance));
}
