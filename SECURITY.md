# Security

VoiceGuard MCP is a hackathon simulation and must not be used as an authorization boundary for real money, devices, or user accounts.

Please report a suspected vulnerability privately through GitHub's security advisory flow rather than opening a public issue. Include the affected commit, reproduction steps, expected behavior, and observed behavior.

The current design binds to loopback, validates Host and Origin headers, limits browser calls to known tools, caps request bodies, expires confirmation challenges, and rechecks spend limits at confirmation time. It does not provide authentication, durable transactional state, distributed locking, or production secret management.
