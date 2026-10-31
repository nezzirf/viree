-- ═══════════════════════════════════════════════════════════════════════
--  Virée — schéma Supabase (offre gratuite)
--  À coller dans : Supabase → SQL Editor → New query → Run.
--  Ré-exécutable : les objets existants sont remplacés.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── Profils publics ────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_.\- ]{3,24}$'),
  region text not null check (char_length(region) between 2 and 60),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: lecture" on public.profiles;
create policy "profiles: lecture" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles: création de son profil" on public.profiles;
create policy "profiles: création de son profil" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles: modification de son profil" on public.profiles;
create policy "profiles: modification de son profil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists "profiles: suppression de son profil" on public.profiles;
create policy "profiles: suppression de son profil" on public.profiles for delete to authenticated using (id = auth.uid());

-- ─── Résumés de sorties (jamais la trace GPS) ──────────────────────────
create table if not exists public.rides (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id text not null check (char_length(client_id) <= 40),
  ride_date timestamptz not null,
  distance_km numeric(6, 1) not null,
  ascent_m integer not null,
  score integer not null,
  region text not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id),
  -- Garde-fous anti-triche simples (une vraie vérification demanderait la trace complète).
  constraint rides_distance_ok check (distance_km > 0 and distance_km <= 400),
  constraint rides_ascent_ok check (ascent_m >= 0 and ascent_m <= 8000),
  constraint rides_score_ok check (score >= 0 and score <= 3000)
);
create index if not exists rides_region_date on public.rides (region, ride_date);
alter table public.rides enable row level security;

drop policy if exists "rides: lecture des siennes" on public.rides;
create policy "rides: lecture des siennes" on public.rides for select to authenticated using (user_id = auth.uid());
drop policy if exists "rides: ajout des siennes" on public.rides;
create policy "rides: ajout des siennes" on public.rides for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "rides: suppression des siennes" on public.rides;
create policy "rides: suppression des siennes" on public.rides for delete to authenticated using (user_id = auth.uid());
-- Pas de policy UPDATE : une sortie envoyée ne se modifie pas (on la supprime puis on la renvoie).

-- Contrôles à l'insertion (dans un trigger et non un CHECK : un CHECK utilisant now()
-- ferait échouer la restauration d'une sauvegarde contenant des sorties anciennes).
--   - date plausible : ni dans le futur, ni plus de 60 jours en arrière ;
--   - 30 sorties par jour et par utilisateur maximum (protège la base gratuite de 500 Mo).
create or replace function public.rides_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.ride_date > now() + interval '1 day' or new.ride_date < now() - interval '60 days' then
    raise exception 'Date de sortie hors limites';
  end if;
  if (select count(*) from public.rides where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Trop de sorties envoyées aujourd''hui';
  end if;
  return new;
end $$;
drop trigger if exists rides_rate_limit on public.rides;
create trigger rides_rate_limit before insert on public.rides for each row execute function public.rides_rate_limit();

-- ─── Classement mensuel par région ─────────────────────────────────────
-- security definer : agrège toutes les sorties mais n'expose QUE pseudo + total.
create or replace function public.leaderboard_month(p_region text, p_month date default current_date)
returns table (rank bigint, user_id uuid, username text, total_km numeric, rides bigint)
language sql stable security definer set search_path = public as $$
  select rank() over (order by sum(r.distance_km) desc) as rank,
         p.id, p.username, sum(r.distance_km) as total_km, count(*) as rides
  from public.rides r
  join public.profiles p on p.id = r.user_id
  where r.region = p_region
    and r.ride_date >= date_trunc('month', p_month::timestamptz)
    and r.ride_date <  date_trunc('month', p_month::timestamptz) + interval '1 month'
  group by p.id, p.username
  order by total_km desc
  limit 100;
$$;
revoke all on function public.leaderboard_month(text, date) from public;
grant execute on function public.leaderboard_month(text, date) to anon, authenticated;

-- ─── Sorties à plusieurs ───────────────────────────────────────────────
create table if not exists public.group_rides (
  id bigint generated always as identity primary key,
  creator uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  description text check (char_length(description) <= 500),
  place_name text not null check (char_length(place_name) between 2 and 120),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  start_at timestamptz not null,
  pace text not null check (pace in ('cool', 'moyen', 'rapide')),
  speed_kmh integer check (speed_kmh between 10 and 45),
  distance_km integer check (distance_km between 5 and 300),
  region text not null,
  created_at timestamptz not null default now()
);
create index if not exists group_rides_region_start on public.group_rides (region, start_at);
alter table public.group_rides enable row level security;

drop policy if exists "group_rides: lecture" on public.group_rides;
create policy "group_rides: lecture" on public.group_rides for select to authenticated using (true);
drop policy if exists "group_rides: création" on public.group_rides;
create policy "group_rides: création" on public.group_rides for insert to authenticated
  with check (creator = auth.uid() and start_at > now() and start_at < now() + interval '90 days');
drop policy if exists "group_rides: modification par le créateur" on public.group_rides;
create policy "group_rides: modification par le créateur" on public.group_rides for update to authenticated
  using (creator = auth.uid()) with check (creator = auth.uid());
drop policy if exists "group_rides: suppression par le créateur" on public.group_rides;
create policy "group_rides: suppression par le créateur" on public.group_rides for delete to authenticated using (creator = auth.uid());

-- Limite : 5 sorties à venir par créateur.
create or replace function public.group_rides_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.group_rides where creator = new.creator and start_at > now()) >= 5 then
    raise exception 'Tu as déjà 5 sorties à venir';
  end if;
  return new;
end $$;
drop trigger if exists group_rides_limit on public.group_rides;
create trigger group_rides_limit before insert on public.group_rides for each row execute function public.group_rides_limit();

create table if not exists public.group_ride_members (
  ride_id bigint not null references public.group_rides (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);
alter table public.group_ride_members enable row level security;

drop policy if exists "members: lecture" on public.group_ride_members;
create policy "members: lecture" on public.group_ride_members for select to authenticated using (true);
drop policy if exists "members: rejoindre" on public.group_ride_members;
create policy "members: rejoindre" on public.group_ride_members for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "members: quitter" on public.group_ride_members;
create policy "members: quitter" on public.group_ride_members for delete to authenticated using (user_id = auth.uid());

-- ─── Ménage (optionnel) ────────────────────────────────────────────────
-- Les sorties de plus de 60 jours ne servent plus au classement mensuel.
-- Avec l'extension pg_cron (Database → Extensions), planifier :
--   select cron.schedule('viree-cleanup', '0 4 * * *',
--     $$ delete from public.rides where ride_date < now() - interval '60 days';
--        delete from public.group_rides where start_at < now() - interval '30 days'; $$);
