import { describe, expect, it } from "vitest";
import { buildOverpassQuery, parseEle, parseOverpass } from "@/lib/passes";

describe("cols (Overpass)", () => {
  it("parseEle gère les formats courants", () => {
    expect(parseEle("1326")).toBe(1326);
    expect(parseEle("1 326 m")).toBe(1326);
    expect(parseEle("1326;1330")).toBe(1326);
    expect(parseEle("1326,5")).toBe(1327);
    expect(parseEle("4000 ft")).toBe(1219);
    expect(parseEle("inconnu")).toBeNull();
    expect(parseEle(undefined)).toBeNull();
  });

  it("requête : cols et selles nommés avec altitude", () => {
    const q = buildOverpassQuery(45.19, 5.72, 40000);
    expect(q).toContain('node["mountain_pass"="yes"]["ele"]["name"](around:40000,45.1900,5.7200)');
    expect(q).toContain('node["natural"="saddle"]["ele"]["name"]');
  });

  it("filtre, dédoublonne, trie par distance", () => {
    const center: [number, number] = [5.72, 45.19];
    const passes = parseOverpass(
      {
        elements: [
          { type: "node", id: 1, lat: 45.3, lon: 5.75, tags: { mountain_pass: "yes", name: "Col de Porte", ele: "1326" } },
          { type: "node", id: 2, lat: 45.3, lon: 5.751, tags: { natural: "saddle", name: "Col de Porte", ele: "1327" } },
          { type: "node", id: 3, lat: 45.2, lon: 5.73, tags: { natural: "saddle", name: "Pas proche", ele: "900" } },
          { type: "node", id: 4, lat: 45.25, lon: 5.8, tags: { mountain_pass: "yes", ele: "1000" } },
          { type: "node", id: 5, lat: 45.25, lon: 5.8, tags: { mountain_pass: "yes", name: "Sans altitude" } },
        ],
      },
      center,
    );
    expect(passes.map((p) => p.name)).toEqual(["Pas proche", "Col de Porte"]);
    expect(passes[1].kind).toBe("col");
    expect(passes[0].kind).toBe("selle");
    expect(passes[0].distanceKm).toBeGreaterThan(1);
  });
});
