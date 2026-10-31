# Virée 🚲

**Dis combien de temps tu as, Virée trace la boucle.**
PWA mobile-first de création de circuits vélo, 100 % gratuite : pas d'abonnement, pas de paywall, aucune fonction verrouillée.
Toute l'infrastructure tient dans des offres gratuites.

- **Circuit** : boucle depuis ta position ou une adresse, selon une durée ou une distance, ton vélo (route, gravel, VTT, électrique) et le relief voulu. Bouton « Autre circuit ».
- **Cols** : cols OpenStreetMap autour de toi, en aller-retour ou en boucle.
- **Guidage** : export GPX (partage direct vers l'appli du compteur sur mobile) et mode « suivre le tracé » avec position en direct, alerte hors parcours, écran maintenu allumé, enregistrement de la sortie.
- **Sorties** : import GPX / TCX / FIT dans le navigateur, Ride Score, niveaux, 12 badges.
- **Classement** : km du mois par région, podium, « il te manque X km pour passer premier ».
- **À plusieurs** : proposer une sortie (lieu, date, allure) et rejoindre celles du coin.

Plan technique, schéma et architecture : [`docs/PLAN.md`](docs/PLAN.md).

## Installation

```bash
npm install
cp .env.example .env.local      # puis remplir (voir ci-dessous)
npm run dev                     # http://localhost:3000
```

Pour développer **sans aucune clé** : `ROUTING_PROVIDER=demo` dans `.env.local`. Les tracés sont alors géométriques (ils ne suivent pas les routes), mais toute l'interface fonctionne.

| Commande | Rôle |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Next.js (copie aussi le worker MapLibre dans `public/maplibre/`) |
| `npm test` | tests unitaires (Vitest) : routage, cache, rate limit, score, badges, parsers GPX/TCX/FIT, classement |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `node scripts/smoke.mjs` | parcours complet dans Chromium (serveur lancé avec `ROUTING_PROVIDER=demo`) |
| `node scripts/smoke-cloud.mjs` | pages compte / classement / à plusieurs avec un faux Supabase (build avec `NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co`) |
| `npm run icons` | régénère les icônes PNG depuis `public/icons/icon.svg` |

## Ce que tu dois configurer

### 1. OpenRouteService (obligatoire pour de vrais circuits)
1. Créer un compte sur <https://openrouteservice.org/dev/#/signup>.
2. Dashboard → créer un token (offre *Standard*, gratuite).
3. `ORS_API_KEY=...` dans `.env.local` (et dans les variables d'environnement de l'hébergeur).

La clé n'est lue que dans `src/lib/routing/ors.ts` (module `server-only`) : elle n'arrive jamais dans le navigateur.

### 2. Supabase (facultatif : classement + sorties à plusieurs)
Sans Supabase, l'app reste entièrement utilisable en local (circuits, cols, guidage, import, score, badges).
1. Créer un projet gratuit sur <https://supabase.com>.
2. *SQL Editor* → coller tout [`supabase/schema.sql`](supabase/schema.sql) → *Run*.
3. *Authentication → URL Configuration* : *Site URL* = l'URL de prod ; ajouter `http://localhost:3000/compte` et `https://<ton-domaine>/compte` aux *Redirect URLs*.
4. *Project Settings → API* : copier l'URL et la clé `anon` (ou *publishable*) dans `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. **SMTP (fortement conseillé)** : *Authentication → SMTP Settings* avec un fournisseur gratuit (Brevo, Resend…). Voir les limites plus bas.

> La clé `anon` est publique par conception : la sécurité repose sur les règles RLS du schéma. N'utilise **jamais** la clé `service_role` côté client.

### 3. Déploiement
- **Vercel** : importer le dépôt, ajouter les variables d'environnement, déployer. Rien d'autre à faire.
- **Cloudflare** : passer par l'adaptateur OpenNext (`@opennextjs/cloudflare`), la voie officielle pour Next.js sur Workers. Je ne l'ai pas testé ici.

## Limites des offres gratuites (et coûts cachés) ⚠️

| Service | Limite gratuite | Ce que fait l'app |
|---|---|---|
| **OpenRouteService** | 2 000 itinéraires/jour, 40/minute, pour **toute** l'app (une seule clé). `round_trip` limité à **100 km** et qualifié d'expérimental par ORS. | Cache serveur 24 h + cache IndexedDB 7 jours (même départ + mêmes réglages = même circuit, servi sans appel). Rate limit 6 circuits/min par IP. Au-delà de 100 km, boucle construite avec 4 points de passage. Message clair en cas de quota atteint (429). |
| **OpenFreeMap** (tuiles) | Gratuit, sans clé, financé par dons. Attribution obligatoire. | Attribution affichée. Pas de pré-téléchargement de tuiles par le service worker. |
| **Photon** (géocodage) | Usage raisonnable, sans garantie de service. | Debounce 600 ms, 3 caractères minimum, 1 requête/s sortante, cache 7 jours. |
| **Overpass** (cols) | ~10 000 requêtes/jour, serveur public souvent saturé. | Cache 24 h par zone de ~5 km, partagé entre utilisateurs. Message dédié si saturé. |
| **Open-Meteo** (altitude) | Non commercial, ~10 000 appels/jour. | Seulement pour les imports sans altitude : 1 appel de 100 points max par fichier. |
| **Supabase** | Base 500 Mo, 50 000 utilisateurs actifs/mois. **Projet mis en pause après 7 jours sans activité.** Emails d'auth intégrés : **quelques emails/heure seulement**. | Seuls des résumés de sorties sont stockés (pas de traces GPS), 30 envois/jour/utilisateur max, 5 sorties de groupe à venir max. Branche un SMTP gratuit pour l'auth. Un ping hebdomadaire (cron gratuit) évite la mise en pause. |
| **Vercel Hobby** | **Usage non commercial uniquement**, 100 Go de bande passante/mois, durée d'exécution des fonctions limitée. | App sans revenu = compatible. Si tu ajoutes un jour de la pub ou des dons au nom d'une entreprise, il faudra passer à Cloudflare ou au plan Pro. |

Autres limites à connaître :
- **Cache et rate limit en mémoire** : chaque instance serverless a les siens, perdus au redémarrage à froid. Ça protège bien contre les abus courants, mais ce n'est pas un plafond global. Pour un vrai plafond partagé, Upstash Redis (offre gratuite) se branche dans `src/lib/server/`.
- **Guidage PWA** : quand l'écran s'éteint, les navigateurs (surtout iOS Safari) suspendent le GPS. L'app maintient l'écran allumé (Wake Lock). Pour les longues sorties, mieux vaut exporter en GPX vers un compteur.
- **Relief** : ORS ne propose pas de dénivelé cible. Le niveau de relief n'est qu'une préférence de pente (`steepness_difficulty`), et l'app prévient si le D+ obtenu s'écarte beaucoup de la demande.
- **Classement** : basé sur la bonne foi (garde-fous en base : ≤ 400 km et ≤ 8 000 m de D+ par sortie, date plausible). Les traces ne sont pas vérifiées.
- **Suppression de compte** : « Effacer mes données en ligne » supprime le profil et tout ce qui en dépend (cascade). L'utilisateur `auth` lui-même ne peut être supprimé que via la clé `service_role` (tableau de bord Supabase ou Edge Function).

## Ride Score

Formule documentée et réglable dans [`src/lib/score.ts`](src/lib/score.ts) (`SCORE_RULES`) :

```
score = km × 1  +  D+ / 10  +  Σ km par tranche de pente × bonus
        bonus : 4–6 % → 2 pts/km · 6–8 % → 4 · 8–10 % → 6 · ≥ 10 % → 10
niveau N atteint à 150 × (N−1)^1,5 points cumulés
```

Les badges sont dans [`src/lib/badges.ts`](src/lib/badges.ts) : un badge = une règle d'une ligne.

## Changer de moteur de routage

Implémenter l'interface `RoutingProvider` (`src/lib/routing/types.ts` : `roundTrip()` + `route()`), l'enregistrer dans `src/lib/routing/index.ts`, puis définir `ROUTING_PROVIDER=<nom>`. GraphHopper (offre gratuite), BRouter ou Valhalla auto-hébergé se branchent ainsi sans toucher au reste de l'app.

## Licences et attributions
Cartes © OpenFreeMap, © OpenMapTiles, données © contributeurs OpenStreetMap (ODbL). Itinéraires © openrouteservice.org / HeiGIT. Géocodage Photon (komoot). Altitudes Open-Meteo (Copernicus DEM).
