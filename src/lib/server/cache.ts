/**
 * Cache mémoire avec durée de vie (TTL) et taille maximale (éviction du plus ancien).
 *
 * ⚠ Limite cachée : sur Vercel/Cloudflare, chaque instance serverless a sa propre mémoire,
 * qui disparaît au redémarrage à froid. Ce cache réduit beaucoup les appels répétés
 * (même utilisateur qui revient sur le même circuit) mais n'est pas partagé entre instances.
 * Le client garde en plus sa propre copie dans IndexedDB (voir src/lib/db.ts).
 * Pour un cache partagé gratuit : Upstash Redis (10 000 commandes/jour) ou Cloudflare KV.
 */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Rafraîchit la position (LRU simple : Map garde l'ordre d'insertion).
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  get size() {
    return this.map.size;
  }
}

/** Clé de cache stable à partir d'un objet (clés triées). */
export function cacheKey(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
