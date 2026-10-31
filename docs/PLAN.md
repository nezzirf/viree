# Virée — plan technique

> **Virée** : « faire une virée » = partir faire un tour. L'app trace une boucle vélo
> depuis chez toi selon le temps dont tu disposes, ou vers un col.
> Identité : fond nuit (#0B0F14), accent **citron vif** (#D4FF3A) pour l'action,
> **corail** (#FF6B4A) pour le dénivelé. Logo : une boucle fermée avec un point de départ.

## 1. Architecture

```
Navigateur (PWA, Next.js client)                 Serveur (routes API Next.js)            Services gratuits
────────────────────────────────                 ────────────────────────────            ──────────────────
MapLibre GL  ───────── tuiles ─────────────────────────────────────────────────────────▶ OpenFreeMap
Formulaire circuit ──▶ POST /api/route ──▶ cache + rate-limit ──▶ RoutingProvider ────▶ OpenRouteService
Recherche adresse ───▶ GET  /api/geocode ─▶ cache + 1 req/s ─────────────────────────▶ Photon (komoot)
Liste des cols ──────▶ GET  /api/passes ──▶ cache 24 h ──────────────────────────────▶ Overpass (OSM)
Import sans altitude ▶ POST /api/elevation ▶ cache ──────────────────────────────────▶ Open-Meteo
IndexedDB (sorties, score, badges, cache client)
Supabase JS (auth email, classement, sorties à plusieurs) ──────────────────────────▶ Supabase (RLS)
```

- **Local-first** : sorties, scores, badges et cache des circuits vivent dans IndexedDB.
  Aucune inscription n'est nécessaire pour générer, exporter ou suivre un circuit.
- **Clés d'API côté serveur** : `ORS_API_KEY` n'est lue que dans `src/lib/routing/*`
  (code serveur). La clé `anon` de Supabase est *publique par conception* : c'est RLS qui protège les données.
- **`RoutingProvider`** (`src/lib/routing/types.ts`) : interface `roundTrip()` + `route()`.
  Implémentations : `ors.ts` (production) et `demo.ts` (hors ligne, pour développer sans clé).
  Ajouter GraphHopper, BRouter ou Valhalla = un fichier de plus + une ligne dans `index.ts`.

## 2. Schéma de base de données (Supabase / Postgres)

Voir `supabase/schema.sql` (à coller dans l'éditeur SQL).

| Table | Rôle | RLS |
|---|---|---|
| `profiles` (id → auth.users, username, region) | pseudo public + région | lecture : tous les connectés ; écriture : soi-même |
| `rides` (user_id, client_id, ride_date, distance_km, ascent_m, score, region) | résumé des sorties synchronisées (pas la trace GPS) | lecture/écriture : soi-même uniquement |
| `group_rides` (creator, title, place, lat, lon, start_at, pace, distance_km, region) | sorties à plusieurs | lecture : connectés ; écriture : créateur |
| `group_ride_members` (ride_id, user_id) | participants | lecture : connectés ; ajout/retrait : soi-même |
| fonction `leaderboard_month(region, month)` | km du mois agrégés | `security definer`, n'expose que pseudo + total |

## 3. Fichiers

```
src/app/                 pages : / (circuit), /cols, /suivre, /sorties, /classement, /groupes, /compte
src/app/api/*/route.ts   route | geocode | passes | elevation
src/components/          MapView, PlaceSearch, ElevationProfile, RouteCard, BottomNav, Logo…
src/lib/geo.ts           distances, D+, rééchantillonnage, point le plus proche
src/lib/estimate.ts      durée ⇄ distance selon vélo et dénivelé
src/lib/routing/         RoutingProvider + ORS + démo
src/lib/server/          cache TTL, rate limiting, erreurs
src/lib/gpx.ts           export GPX (client)
src/lib/parsers/         import GPX / TCX / FIT
src/lib/score.ts         Ride Score + niveaux (formule documentée)
src/lib/badges.ts        badges
src/lib/db.ts            IndexedDB
src/lib/supabase.ts      client Supabase + synchro
supabase/schema.sql      tables + RLS + fonction de classement
public/sw.js             service worker (cache de l'app, jamais des API)
```

## 4. Ce que tu dois configurer toi-même

1. **OpenRouteService** : créer un compte sur openrouteservice.org → *Dashboard* → token gratuit → `ORS_API_KEY`.
2. **Supabase** : créer un projet gratuit → *SQL editor* → coller `supabase/schema.sql` →
   *Authentication → URL configuration* : ajouter l'URL du site (et `http://localhost:3000`) →
   copier `Project URL` et la clé `anon`/publishable dans `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. **SMTP** (fortement conseillé) : l'envoi d'emails intégré à Supabase est limité à quelques emails/heure.
   Brancher un SMTP gratuit (Brevo, Resend…) dans *Authentication → SMTP*.
4. **Contact** : `CONTACT_EMAIL` est envoyé dans le User-Agent vers Photon/Overpass (politique d'usage).

## 5. Phases

| Phase | Contenu | Vérification |
|---|---|---|
| a | carte + génération de boucle | tests provider/cache/estimation + build + capture |
| b | export GPX + profil altimétrique + suivi | tests GPX aller-retour |
| c | cols (Overpass) | tests parsing Overpass |
| d | import GPX/TCX/FIT + score + badges | tests parsers + score |
| e | compte + classement | schéma SQL + build |
| f | sorties à plusieurs | build + capture |
