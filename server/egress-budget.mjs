// Application traffic allowance, not a provider billing cap. Reserve body bytes
// plus 2 KiB per response for headers/protocol overhead. Keep 2 GB of the Hobby
// allowance unused for platform traffic, retries and measurement differences.
export const MONTHLY_EGRESS_BYTES = 3_000_000_000;
export class EgressBudget {
  constructor(sqlite, limit = MONTHLY_EGRESS_BYTES, now = Date.now) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw Error('Monthly egress allowance must be a positive integer.');
    this.limit = limit; this.now = now;
    sqlite.exec('CREATE TABLE IF NOT EXISTS arena_egress (month TEXT PRIMARY KEY, reserved INTEGER NOT NULL)');
    this.read = sqlite.prepare('SELECT reserved FROM arena_egress WHERE month = ?');
    this.write = sqlite.prepare('INSERT INTO arena_egress (month, reserved) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET reserved = excluded.reserved');
  }
  usage() {
    const month = new Date(this.now()).toISOString().slice(0, 7);
    return {month, reserved: this.read.get(month)?.reserved ?? 0};
  }
  exhausted() { return this.usage().reserved >= this.limit; }
  reserve(bodyBytes) {
    const {month, reserved} = this.usage(), next = reserved + bodyBytes + 2048;
    if (reserved >= this.limit) return false;
    // Persist before sending; process restarts cannot reset the allowance.
    this.write.run(month, Math.min(next, this.limit));
    return next <= this.limit;
  }
}
