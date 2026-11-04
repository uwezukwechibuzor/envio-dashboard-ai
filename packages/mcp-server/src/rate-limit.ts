export class RateLimiter {
  private readonly requests = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const times = (this.requests.get(key) ?? []).filter((t) => t > windowStart);
    if (times.length >= this.maxRequests) return false;
    times.push(now);
    this.requests.set(key, times);
    return true;
  }
}
