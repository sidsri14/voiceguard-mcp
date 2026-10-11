import { createHash, randomUUID } from 'node:crypto';

const DEFAULT_ALLOWED_ACTIONS = [
  'check_balance',
  'query_device_status',
  'request_ride',
  'place_coffee_order',
  'authorize_micro_spend',
  'notify_user'
];

const DEFAULT_RISK_PATTERNS = [
  /ignore (all |any )?(previous|prior) (instructions|audio)/i,
  /authorize (the )?maximum transfer/i,
  /disable (the )?confirmation/i,
  /override (the )?(safety|spend) (limit|envelope)/i,
  /reveal (the )?(system prompt|hidden instructions)/i
];

export class VoiceGuard {
  constructor(config = {}) {
    this.maxSpendPerSession = config.maxSpendPerSession ?? 100;
    this.maxSpendDaily = config.maxSpendDaily ?? 500;
    this.requiresConfirmationAbove = config.requiresConfirmationAbove ?? 50;
    this.challengeTtlMs = config.challengeTtlMs ?? 5 * 60 * 1000;
    this.allowedActions = new Set(config.allowedActions ?? DEFAULT_ALLOWED_ACTIONS);
    this.riskPatterns = config.riskPatterns ?? DEFAULT_RISK_PATTERNS;
    this.sessionSpends = new Map();
    this.dailySpent = 0;
    this.dailySpendDate = this.#currentDateKey();
    this.pendingChallenges = new Map();
    this.auditLogs = [];
    this.lastHash = '0'.repeat(64);
  }

  evaluateAction({ sessionId, transcript = '', action, amount = 0 }) {
    this.#refreshDailySpend();
    this.#assertNonEmptyString(sessionId, 'sessionId');
    this.#assertNonEmptyString(action, 'action');
    const normalizedAmount = this.#normalizeAmount(amount);

    const matchedPattern = this.riskPatterns.find((pattern) => pattern.test(transcript));
    if (matchedPattern) {
      return this.#record({
        sessionId,
        action,
        amount: normalizedAmount,
        transcript,
        decision: 'blocked',
        reason: 'TRANSCRIPT_INJECTION_PATTERN'
      });
    }

    if (!this.allowedActions.has(action)) {
      return this.#record({
        sessionId,
        action,
        amount: normalizedAmount,
        transcript,
        decision: 'blocked',
        reason: 'ACTION_NOT_ALLOWLISTED'
      });
    }

    const ceilingFailure = this.#checkSpendCeilings(sessionId, normalizedAmount);
    if (ceilingFailure) {
      return this.#record({
        sessionId,
        action,
        amount: normalizedAmount,
        transcript,
        decision: 'blocked',
        reason: ceilingFailure
      });
    }

    if (normalizedAmount > this.requiresConfirmationAbove) {
      const challengeId = randomUUID();
      this.pendingChallenges.set(challengeId, {
        sessionId,
        transcript,
        action,
        amount: normalizedAmount,
        expiresAt: Date.now() + this.challengeTtlMs
      });
      return this.#record({
        sessionId,
        action,
        amount: normalizedAmount,
        transcript,
        decision: 'confirmation_required',
        reason: 'EXPLICIT_USER_CONFIRMATION_REQUIRED',
        challengeId
      });
    }

    this.#commitSpend(sessionId, normalizedAmount);
    return this.#record({
      sessionId,
      action,
      amount: normalizedAmount,
      transcript,
      decision: 'approved',
      reason: 'POLICY_CHECKS_PASSED'
    });
  }

  resolveChallenge({ challengeId, approved }) {
    this.#refreshDailySpend();
    this.#assertNonEmptyString(challengeId, 'challengeId');
    if (typeof approved !== 'boolean') {
      throw new TypeError('approved must be a boolean');
    }

    const pending = this.pendingChallenges.get(challengeId);
    if (!pending) {
      return {
        decision: 'blocked',
        reason: 'CHALLENGE_NOT_FOUND_OR_ALREADY_USED',
        challengeId
      };
    }
    this.pendingChallenges.delete(challengeId);

    if (Date.now() > pending.expiresAt) {
      return this.#record({
        ...pending,
        decision: 'blocked',
        reason: 'CONFIRMATION_EXPIRED',
        challengeId
      });
    }

    if (!approved) {
      return this.#record({
        ...pending,
        decision: 'blocked',
        reason: 'USER_DENIED_ACTION',
        challengeId
      });
    }

    const ceilingFailure = this.#checkSpendCeilings(pending.sessionId, pending.amount);
    if (ceilingFailure) {
      return this.#record({
        ...pending,
        decision: 'blocked',
        reason: ceilingFailure,
        challengeId
      });
    }

    this.#commitSpend(pending.sessionId, pending.amount);
    return this.#record({
      ...pending,
      decision: 'approved',
      reason: 'USER_CONFIRMED_ACTION',
      challengeId
    });
  }

  getAuditSummary(limit = 20) {
    this.#refreshDailySpend();
    this.#purgeExpiredChallenges();
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const counts = { approved: 0, blocked: 0, confirmation_required: 0 };
    for (const entry of this.auditLogs) {
      counts[entry.decision] = (counts[entry.decision] ?? 0) + 1;
    }
    return {
      counts,
      dailySpent: this.dailySpent,
      pendingConfirmations: this.pendingChallenges.size,
      auditChainValid: this.verifyAuditChain(),
      recent: this.auditLogs.slice(-safeLimit).reverse()
    };
  }

  verifyAuditChain() {
    let previousHash = '0'.repeat(64);
    for (const entry of this.auditLogs) {
      if (entry.previousHash !== previousHash) return false;
      const { hash, ...unsignedEntry } = entry;
      const computed = createHash('sha256').update(JSON.stringify(unsignedEntry)).digest('hex');
      if (computed !== hash) return false;
      previousHash = hash;
    }
    return true;
  }

  #checkSpendCeilings(sessionId, amount) {
    if (amount <= 0) return null;
    const nextSessionSpend = (this.sessionSpends.get(sessionId) ?? 0) + amount;
    if (nextSessionSpend > this.maxSpendPerSession) return 'SESSION_SPEND_LIMIT_EXCEEDED';
    if (this.dailySpent + amount > this.maxSpendDaily) return 'DAILY_SPEND_LIMIT_EXCEEDED';
    return null;
  }

  #refreshDailySpend() {
    const currentDate = this.#currentDateKey();
    if (currentDate !== this.dailySpendDate) {
      this.dailySpendDate = currentDate;
      this.dailySpent = 0;
    }
  }

  #purgeExpiredChallenges() {
    const now = Date.now();
    for (const [challengeId, challenge] of this.pendingChallenges) {
      if (challenge.expiresAt < now) this.pendingChallenges.delete(challengeId);
    }
  }

  #currentDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  #commitSpend(sessionId, amount) {
    if (amount <= 0) return;
    this.sessionSpends.set(sessionId, (this.sessionSpends.get(sessionId) ?? 0) + amount);
    this.dailySpent += amount;
  }

  #record({ sessionId, transcript, action, amount, decision, reason, challengeId }) {
    const unsignedEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      transcript,
      action,
      amount,
      decision,
      reason,
      challengeId: challengeId ?? null,
      previousHash: this.lastHash
    };
    const hash = createHash('sha256').update(JSON.stringify(unsignedEntry)).digest('hex');
    const entry = { ...unsignedEntry, hash };
    this.lastHash = hash;
    this.auditLogs.push(entry);
    return entry;
  }

  #normalizeAmount(amount) {
    const normalized = Number(amount);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new TypeError('amount must be a finite, non-negative number');
    }
    return Math.round(normalized * 100) / 100;
  }

  #assertNonEmptyString(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new TypeError(`${name} must be a non-empty string`);
    }
  }
}
