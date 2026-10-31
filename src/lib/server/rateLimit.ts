/**
 * Rate limiting « seau à jetons » par identifiant (IP).
 *
 * ⚠ Même limite que le cache : la mémoire est propre à chaque instance serverless.
 * C'est une protection raisonnable contre les abus et les boucles accidentelles,
 * pas une barrière absolue. Pour un plafond global strict : Upstash Ratelimit (gratuit).
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  /**
   * @param capacity  nombre de requêtes autorisées en rafale
   * @param refillPerMinute  jetons rendus par minute
   */
  constructor(
    private capacity: number,
    private refillPerMinute: number,
  ) {}

  /** Consomme un jeton. Retourne le délai d'attente en secondes si refusé, sinon 0. */
  take(id: string, now = Date.now()): number {
    const b = this.buckets.get(id) ?? { tokens: this.capacity, updated: now };
    const refill = ((now - b.updated) / 60000) * this.refillPerMinute;
    b.tokens = Math.min(this.capacity, b.tokens + refill);
    b.updated = now;
    if (b.tokens < 1) {
      this.buckets.set(id, b);
      return Math.ceil(((1 - b.tokens) / this.refillPerMinute) * 60);
    }
    b.tokens -= 1;
    this.buckets.set(id, b);
    if (this.buckets.size > 10000) this.buckets.clear(); // garde-fou mémoire
    return 0;
  }
}

/**
 * File d'attente globale : garantit un intervalle minimal entre deux appels sortants
 * (ex. Photon/Nominatim : 1 requête par seconde maximum).
 */
export function createThrottle(minIntervalMs: number) {
  let next = 0;
  return async function throttle() {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + minIntervalMs;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  };
}

export function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}
