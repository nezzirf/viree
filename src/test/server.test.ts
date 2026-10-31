import { describe, expect, it, vi } from "vitest";
import { cacheKey, TtlCache } from "@/lib/server/cache";
import { createThrottle, RateLimiter } from "@/lib/server/rateLimit";
import { distanceForDuration, estimateDurationS } from "@/lib/estimate";
import { closestOnTrack, elevationGain, resample, trackLength } from "@/lib/geo";

describe("TtlCache", () => {
  it("expire et évince le plus ancien", () => {
    vi.useFakeTimers();
    const c = new TtlCache<number>(1000, 2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a"); // a devient le plus récent
    c.set("c", 3); // évince b
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(c.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("clé indépendante de l'ordre des propriétés", () => {
    expect(cacheKey({ a: 1, b: { c: 2, d: 3 } })).toBe(cacheKey({ b: { d: 3, c: 2 }, a: 1 }));
  });
});

describe("RateLimiter", () => {
  it("autorise une rafale puis renvoie un délai, et se recharge", () => {
    const rl = new RateLimiter(2, 6); // 6/min = 1 jeton / 10 s
    const t = 1_000_000;
    expect(rl.take("ip", t)).toBe(0);
    expect(rl.take("ip", t)).toBe(0);
    expect(rl.take("ip", t)).toBe(10);
    expect(rl.take("autre", t)).toBe(0);
    expect(rl.take("ip", t + 10_000)).toBe(0);
  });

  it("throttle espace les appels", async () => {
    const throttle = createThrottle(50);
    const t0 = Date.now();
    await throttle();
    await throttle();
    await throttle();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(95);
  });
});

describe("estimation", () => {
  it("durée ⇄ distance sont cohérentes", () => {
    const d = distanceForDuration(2 * 3600, "route", "vallonne");
    const ascent = (d / 1000) * 12;
    expect(Math.abs(estimateDurationS(d, ascent, "route") - 7200)).toBeLessThan(30);
    expect(distanceForDuration(7200, "route", "plat")).toBeGreaterThan(distanceForDuration(7200, "route", "montagneux"));
    expect(distanceForDuration(7200, "vtt", "plat")).toBeLessThan(distanceForDuration(7200, "route", "plat"));
  });
});

describe("geo", () => {
  const line: [number, number, number][] = [
    [5.0, 45.0, 100],
    [5.01, 45.0, 110],
    [5.02, 45.0, 105],
  ];
  it("D+ avec hystérésis ignore le bruit", () => {
    const noisy: [number, number, number][] = Array.from({ length: 100 }, (_, i) => [5, 45 + i * 0.0001, 100 + (i % 2) * 2]);
    expect(elevationGain(noisy).ascent).toBe(0);
    expect(elevationGain(line, 4)).toEqual({ ascent: 10, descent: 5 });
  });
  it("resample conserve la longueur", () => {
    const L = trackLength(line);
    expect(Math.abs(trackLength(resample(line, 100)) - L)).toBeLessThan(2);
  });
  it("closestOnTrack mesure l'écart et la distance parcourue", () => {
    const c = closestOnTrack([5.015, 45.001], line);
    expect(c.offTrackM).toBeGreaterThan(100);
    expect(c.offTrackM).toBeLessThan(120);
    expect(c.alongM).toBeGreaterThan(1100);
    expect(c.alongM).toBeLessThan(1250);
  });
});
