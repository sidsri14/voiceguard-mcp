import assert from 'node:assert/strict';
import test from 'node:test';

import { startVoiceGuardServer } from '../src/server.mjs';

test('serves the simulation and routes browser calls through MCP', async () => {
  const running = await startVoiceGuardServer({ port: 0 });
  try {
    const health = await fetch(`${running.url}/health`).then((response) => response.json());
    assert.equal(health.status, 'ok');
    assert.equal(health.simulationOnly, true);

    const page = await fetch(running.url).then((response) => response.text());
    assert.match(page, /VoiceGuard MCP/);
    assert.match(page, /hackathon simulation/i);

    const response = await fetch(`${running.url}/api/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'evaluate_voice_action',
        arguments: {
          sessionId: 'http-session',
          transcript: 'Check my balance.',
          action: 'check_balance',
          amount: 0
        }
      })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).decision, 'approved');
  } finally {
    await running.close();
  }
});
