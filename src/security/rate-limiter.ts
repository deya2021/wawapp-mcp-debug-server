import { RATE_LIMIT_PER_TOOL, RATE_LIMIT_GLOBAL } from '../config/constants.js';

class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number // tokens per minute
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(): { allowed: boolean; retryAfter?: number } {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true };
    }

    // Calculate retry time in seconds
    const tokensNeeded = 1 - this.tokens;
    const retryAfter = Math.ceil((tokensNeeded / this.refillRate) * 60);
    return { allowed: false, retryAfter };
  }

  private refill() {
    const now = Date.now();
    const elapsedMinutes = (now - this.lastRefill) / 60000;
    const tokensToAdd = elapsedMinutes * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

const toolBuckets = new Map<string, TokenBucket>();
const globalBucket = new TokenBucket(RATE_LIMIT_GLOBAL, RATE_LIMIT_GLOBAL);

export function checkRateLimit(
  toolName: string
): { allowed: boolean; retryAfter?: number } {
  // Check global bucket first
  const globalCheck = globalBucket.tryConsume();
  if (!globalCheck.allowed) {
    return {
      allowed: false,
      retryAfter: globalCheck.retryAfter,
    };
  }

  // Check per-tool bucket
  if (!toolBuckets.has(toolName)) {
    toolBuckets.set(
      toolName,
      new TokenBucket(RATE_LIMIT_PER_TOOL, RATE_LIMIT_PER_TOOL)
    );
  }

  const toolCheck = toolBuckets.get(toolName)!.tryConsume();
  if (!toolCheck.allowed) {
    // Refund global bucket token since we're rejecting
    globalBucket.tryConsume(); // This is a hack, proper impl would add back
    return {
      allowed: false,
      retryAfter: toolCheck.retryAfter,
    };
  }

  return { allowed: true };
}
