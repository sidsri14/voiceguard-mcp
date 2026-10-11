# Contributing

Small, reviewable changes are welcome.

1. Open an issue describing the behavior or failure mode.
2. Keep policy changes explicit and covered by a focused test.
3. Run `npm run check`, `npm test`, and `npm audit --omit=dev --audit-level=high`.
4. Do not add claims about Alexa+, audio analysis, identity, payments, or hardware unless the corresponding integration and reproducible evidence are included.

The project intentionally stays local and simulated. A production integration should be proposed separately because authentication, durable state, and transactional execution materially change the threat model.
