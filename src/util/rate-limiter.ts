/** Per-channel cooldown tracker to prevent the bot from replying too fast. */
export class RateLimiter {
  private lastSent = new Map<string, number>();

  constructor(private cooldownMs: number) {}

  /** Returns true if the channel is on cooldown (too soon to send). */
  isOnCooldown(channelId: string): boolean {
    const last = this.lastSent.get(channelId);
    if (!last) return false;
    return Date.now() - last < this.cooldownMs;
  }

  /** Record that a message was just sent in the given channel. */
  recordSend(channelId: string): void {
    this.lastSent.set(channelId, Date.now());
  }
}
