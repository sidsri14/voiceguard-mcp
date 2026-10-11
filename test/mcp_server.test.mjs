import assert from 'node:assert/strict';
import test from 'node:test';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { createVoiceGuardHandler } from '../src/mcp_server.mjs';
import { VoiceGuard } from '../src/voice_guard.mjs';

function parseResult(result) {
  return JSON.parse(result.content.find((item) => item.type === 'text').text);
}

test('exposes policy tools through Streamable HTTP MCP', async () => {
  const handler = createVoiceGuardHandler(new VoiceGuard());
  const client = new Client({ name: 'voiceguard-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init))
  }));

  try {
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ['evaluate_voice_action', 'get_voiceguard_audit', 'resolve_voice_confirmation']
    );

    const result = await client.callTool({
      name: 'evaluate_voice_action',
      arguments: {
        sessionId: 'mcp-session',
        transcript: 'Order a coffee.',
        action: 'place_coffee_order',
        amount: 5
      }
    });
    assert.equal(parseResult(result).decision, 'approved');
  } finally {
    await client.close();
    await handler.close();
  }
});
