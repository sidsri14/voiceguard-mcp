# VoiceGuard MCP

[![CI](https://github.com/sidsri14/voiceguard-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sidsri14/voiceguard-mcp/actions/workflows/ci.yml)

VoiceGuard MCP is a simulated Alexa+ experience that puts a policy checkpoint between a voice request and a consequential tool action. It exposes a real Streamable HTTP Model Context Protocol server, a browser-based simulation, and a local policy engine with explicit confirmation and tamper-evident auditing.

Built for the **Alexa+ track** and **Open Source mini challenge** of the Build, Ship, Shape: Amazon Developer Hackathon.

![VoiceGuard MCP simulation showing a blocked transcript and a valid audit chain](voiceguard-risk-blocked.png)

## What is implemented

- MCP 2026-07-28 server over Streamable HTTP using the official TypeScript SDK.
- Three MCP tools: `evaluate_voice_action`, `resolve_voice_confirmation`, and `get_voiceguard_audit`.
- Transcript pattern screening for a small, documented set of prompt-injection phrases.
- Tool allowlisting and session/daily simulated spend limits.
- One-time, expiring confirmation challenges for high-value actions.
- Revalidation of spend limits when a pending action is confirmed.
- SHA-256 hash-linked audit entries with tamper detection.
- A responsive browser simulation whose actions are routed through the MCP endpoint.
- Unit, in-process MCP, and full HTTP integration tests.

## Scope and non-claims

This repository is a **simulation**, not a production Alexa+ integration. It does not process audio, detect ultrasound, verify biometrics, call Amazon payment/device APIs, or execute transactions. Its implemented surface is the MCP transport, policy state machine, browser experience, and audit system.

Amazon's hackathon permits a simulated Alexa+ experience. The MCP protocol version used here is later than the required 2025-11-25 baseline.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm test
npm start
```

Open `http://127.0.0.1:8787`.

The MCP endpoint is `http://127.0.0.1:8787/mcp`. Health and protocol metadata are available at `http://127.0.0.1:8787/health`.

## Demo flow

1. Submit the default $6.50 coffee request. It is approved.
2. Submit a $75 ride request. VoiceGuard pauses and creates a one-time confirmation challenge.
3. Confirm or deny it in the UI. The decision is routed through `resolve_voice_confirmation`.
4. Load the risky example. Its explicit injection phrase is blocked.
5. Inspect the audit table and chain integrity indicator.

## Architecture

```text
Browser simulation
       |
       | POST /api/call
       v
Local MCP client ---- Streamable HTTP ----> /mcp
                                              |
                                   evaluate_voice_action
                                   resolve_voice_confirmation
                                   get_voiceguard_audit
                                              |
                                              v
                                      VoiceGuard policy
                                      - phrase screening
                                      - tool allowlist
                                      - spend ceilings
                                      - confirmation state
                                      - hash-chain audit
```

The browser API deliberately connects to the same Streamable HTTP MCP endpoint an external client would use; it does not bypass the MCP tools and call the policy engine directly.

## Security choices

- The server binds to `127.0.0.1` by default.
- Official MCP host/origin validation protects the local MCP route from DNS rebinding and cross-origin requests.
- Browser calls are restricted to the three known tools.
- Request bodies are capped at 32 KB.
- Static paths are normalized and constrained to `public/`.
- Confirmation challenges are one-time and expire after five minutes.
- Spend ceilings are rechecked at confirmation time to avoid stale approvals.

For a real deployment, the in-memory state should move to a transactional store, authenticated caller identity should be propagated into policy, and the MCP endpoint should require OAuth or a verified bearer token.

## Tests

```bash
npm run check
npm test
```

Coverage includes policy decisions, confirmation replay prevention, ceiling revalidation, audit tamper detection, MCP tool discovery/calls, static serving, health metadata, and the browser-to-MCP HTTP path.

## License

MIT
