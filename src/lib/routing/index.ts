/**
 * Sélection du moteur via ROUTING_PROVIDER (défaut : "ors").
 * Pour ajouter un moteur : l'importer ici et l'ajouter au registre.
 */
import "server-only";
import { DemoProvider } from "./demo";
import { OrsProvider } from "./ors";
import type { RoutingProvider } from "./types";

const registry: Record<string, () => RoutingProvider> = {
  ors: () => new OrsProvider(),
  demo: () => new DemoProvider(),
  // graphhopper: () => new GraphHopperProvider(),
  // brouter: () => new BRouterProvider(),
};

let instance: RoutingProvider | undefined;

export function getRoutingProvider(): RoutingProvider {
  if (!instance) {
    const name = process.env.ROUTING_PROVIDER ?? "ors";
    const factory = registry[name];
    if (!factory) throw new Error(`ROUTING_PROVIDER inconnu : ${name}`);
    instance = factory();
  }
  return instance;
}

export * from "./types";
