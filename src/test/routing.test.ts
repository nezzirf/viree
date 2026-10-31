import { afterEach, describe, expect, it, vi } from "vitest";
import { OrsProvider } from "@/lib/routing/ors";
import { DemoProvider } from "@/lib/routing/demo";
import { RoutingError } from "@/lib/routing/types";
import { planRoute } from "@/lib/server/planRoute";
import { haversine } from "@/lib/geo";

const start: [number, number] = [5.7245, 45.1885]; // Grenoble

function orsResponse(status = 200, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(
    JSON.stringify(
      body ?? {
        features: [
          {
            geometry: { coordinates: [[5.72, 45.18, 210], [5.73, 45.19, 260], [5.72, 45.18, 210]] },
            properties: { summary: { distance: 2400.4 }, ascent: 50.2, descent: 49.9 },
          },
        ],
      },
    ),
    { status, headers },
  );
}

afterEach(() => vi.restoreAllMocks());

describe("OrsProvider", () => {
  it("envoie une requête round_trip avec le bon profil et la clé en en-tête", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(orsResponse());
    const r = await new OrsProvider("KEY").roundTrip({ start, lengthM: 40000, bike: "gravel", hilliness: "montagneux", seed: 7 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v2/directions/cycling-regular/geojson");
    expect((init!.headers as Record<string, string>).Authorization).toBe("KEY");
    const body = JSON.parse(init!.body as string);
    expect(body.options.round_trip).toEqual({ length: 40000, points: 4, seed: 7 });
    expect(body.options.profile_params.weightings.steepness_difficulty).toBe(3);
    expect(body.elevation).toBe(true);
    expect(r).toMatchObject({ distanceM: 2400, ascentM: 50, provider: "ors" });
  });

  it("réessaie sans profile_params si ORS les refuse", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(orsResponse(400, { error: { code: 2003, message: "Parameter 'profile_params' invalid" } }))
      .mockResolvedValueOnce(orsResponse());
    await new OrsProvider("KEY").roundTrip({ start, lengthM: 30000, bike: "route", hilliness: "plat", seed: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body2 = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(body2.options.profile_params).toBeUndefined();
    expect(body2.options.round_trip).toBeDefined();
  });

  it("traduit 429 en erreur QUOTA avec délai", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(orsResponse(429, { error: "Rate limit" }));
    await expect(new OrsProvider("KEY").route({ waypoints: [start, [5.8, 45.2]], bike: "route", hilliness: "plat" })).rejects.toMatchObject({
      code: "QUOTA",
    });
  });

  it("traduit l'erreur 2009 en NO_ROUTE sans réessayer", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(orsResponse(400, { error: { code: 2009, message: "no route" } }));
    await expect(new OrsProvider("KEY").route({ waypoints: [start, [5.8, 45.2]], bike: "vtt", hilliness: "plat" })).rejects.toMatchObject({
      code: "NO_ROUTE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuse de partir sans clé", async () => {
    await expect(new OrsProvider("").roundTrip({ start, lengthM: 1, bike: "route", hilliness: "plat", seed: 0 })).rejects.toBeInstanceOf(
      RoutingError,
    );
  });
});

describe("DemoProvider + planRoute", () => {
  const demo = new DemoProvider();

  it("génère une boucle fermée de longueur proche de la demande", async () => {
    const r = await planRoute({ kind: "loop", start, distanceM: 40000, bike: "route", hilliness: "vallonne", seed: 3 }, demo);
    expect(r.coordinates[0].slice(0, 2)).toEqual(start);
    expect(haversine(r.coordinates.at(-1)!, start)).toBeLessThan(1);
    expect(r.distanceM).toBeGreaterThan(30000);
    expect(r.distanceM).toBeLessThan(50000);
    expect(r.ascentM).toBeGreaterThan(0);
  });

  it("des graines différentes donnent des boucles différentes, une même graine la même", async () => {
    const req = { kind: "loop" as const, start, distanceM: 30000, bike: "route" as const, hilliness: "plat" as const };
    const a = await planRoute({ ...req, seed: 1 }, demo);
    const b = await planRoute({ ...req, seed: 2 }, demo);
    const a2 = await planRoute({ ...req, seed: 1 }, demo);
    expect(a.coordinates[50]).not.toEqual(b.coordinates[50]);
    expect(a.coordinates).toEqual(a2.coordinates);
  });

  it("aller-retour vers un col : une seule requête, distance doublée, D+ = montée + descente", async () => {
    const spy = vi.spyOn(demo, "route");
    const target: [number, number] = [5.85, 45.3];
    const r = await planRoute({ kind: "pass", start, target, mode: "aller-retour", bike: "route", hilliness: "montagneux", seed: 0 }, demo);
    expect(spy).toHaveBeenCalledTimes(1);
    const go = await spy.mock.results[0].value;
    expect(r.distanceM).toBe(go.distanceM * 2);
    expect(r.ascentM).toBe(go.ascentM + go.descentM);
    expect(haversine(r.coordinates.at(-1)!, start)).toBeLessThan(1);
  });

  it("boucle vers un col : passe par le col avec deux points de passage latéraux", async () => {
    const spy = vi.spyOn(demo, "route");
    const target: [number, number] = [5.85, 45.3];
    await planRoute({ kind: "pass", start, target, mode: "boucle", bike: "route", hilliness: "plat", seed: 0 }, demo);
    const wps = spy.mock.calls[0][0].waypoints;
    expect(wps).toHaveLength(5);
    expect(wps[2]).toEqual(target);
    expect(wps[0]).toEqual(start);
    expect(wps[4]).toEqual(start);
  });

  it("au-delà de la limite round_trip du moteur : boucle par points de passage", async () => {
    const limited = Object.assign(new DemoProvider(), { maxRoundTripM: 100000 });
    const rt = vi.spyOn(limited, "roundTrip");
    const rp = vi.spyOn(limited, "route");
    const r = await planRoute({ kind: "loop", start, distanceM: 150000, bike: "route", hilliness: "plat", seed: 2 }, limited);
    expect(rt).not.toHaveBeenCalled();
    expect(rp.mock.calls[0][0].waypoints).toHaveLength(6);
    // Lignes droites du moteur démo ≈ longueur / 1,25 (le facteur route n'existe pas en démo)
    expect(r.distanceM).toBeGreaterThan(100000);
    expect(r.distanceM).toBeLessThan(150000);
  });

  it("refuse les distances hors bornes et les cols trop lointains", async () => {
    await expect(planRoute({ kind: "loop", start, distanceM: 1000, bike: "route", hilliness: "plat", seed: 0 }, demo)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      planRoute({ kind: "pass", start, target: [8, 47], mode: "boucle", bike: "route", hilliness: "plat", seed: 0 }, demo),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
