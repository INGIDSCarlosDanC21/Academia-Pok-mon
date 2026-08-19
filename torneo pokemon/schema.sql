-- =========================================================
-- COPA 151 UABCS - Esquema completo de Supabase
-- Ejecutar todo este archivo en: Supabase > SQL Editor > New query
-- =========================================================

-- Extensión necesaria para generar UUIDs
create extension if not exists "pgcrypto";

-- =========================================================
-- 1. TABLA: profiles
-- Un perfil por usuario de auth.users
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null default 'player' check (role in ('player','host','admin')),
  academy_points int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

-- =========================================================
-- 2. TABLA: tournaments
-- =========================================================
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  event_time time not null,
  location text not null,
  format text not null default 'Dobles 4 vs 4',
  rules text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 3. TABLA: teams
-- Un equipo "vivo" por jugador y torneo (se actualiza al corregir)
-- =========================================================
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  raw_text text not null,
  pokemons jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','invalid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tournament_id)
);

create index if not exists idx_teams_tournament on public.teams(tournament_id);
create index if not exists idx_teams_status on public.teams(status);
create index if not exists idx_teams_user on public.teams(user_id);

-- Guarda cada versión anterior del texto de un equipo antes de sobrescribirlo,
-- para no perder el historial cuando el jugador corrige y reenvía.
create table if not exists public.team_versions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  raw_text text not null,
  pokemons jsonb not null default '[]'::jsonb,
  status_at_save text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_versions_team on public.team_versions(team_id);

-- =========================================================
-- 4. TABLA: team_reviews (historial de revisiones del Host/Admin)
-- =========================================================
create table if not exists public.team_reviews (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  status text not null check (status in ('approved','invalid')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_reviews_team on public.team_reviews(team_id);

-- =========================================================
-- 5. TABLA: matches
-- =========================================================
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player1_id uuid not null references public.profiles(id),
  player2_id uuid not null references public.profiles(id),
  round int not null default 1,
  match_date date,
  match_time time,
  status text not null default 'pending' check (status in ('pending','en_curso','finalizado')),
  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_matches_tournament on public.matches(tournament_id);
create index if not exists idx_matches_player1 on public.matches(player1_id);
create index if not exists idx_matches_player2 on public.matches(player2_id);

-- =========================================================
-- 6. TABLA: points (historial de "Puntos de Academia")
-- =========================================================
create table if not exists public.points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tournament_id uuid references public.tournaments(id),
  amount int not null,
  reason text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_points_user on public.points(user_id);

-- =========================================================
-- 7. Función auxiliar para leer el rol del usuario actual
-- (SECURITY DEFINER evita recursión infinita en las políticas de RLS)
-- =========================================================
create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_host_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role in ('host','admin') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- =========================================================
-- 8. Trigger: crear perfil automáticamente al registrarse
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    'player'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 9. ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.team_versions enable row level security;
alter table public.team_reviews enable row level security;
alter table public.matches enable row level security;
alter table public.points enable row level security;

-- ---------- profiles ----------
-- Lectura pública (necesaria para la tabla de clasificación en /liga)
create policy "profiles_select_public" on public.profiles
  for select using (true);

-- Un usuario puede actualizar solo su propio username (no su rol ni sus puntos)
create policy "profiles_update_own_username" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles p where p.id = auth.uid())
    and academy_points = (select academy_points from public.profiles p where p.id = auth.uid())
  );

-- Admin puede actualizar cualquier perfil (roles, puntos, etc.)
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin());

-- Los perfiles se crean solo mediante el trigger (security definer), no por insert directo del cliente.
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------- tournaments ----------
create policy "tournaments_select_public" on public.tournaments
  for select using (true);

create policy "tournaments_admin_write" on public.tournaments
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- teams ----------
-- El jugador ve solo su propio equipo
create policy "teams_select_own" on public.teams
  for select using (auth.uid() = user_id);

-- Host/Admin ven todos los equipos
create policy "teams_select_host_admin" on public.teams
  for select using (public.is_host_or_admin());

-- El jugador crea su propio equipo
create policy "teams_insert_own" on public.teams
  for insert with check (auth.uid() = user_id);

-- El jugador puede actualizar su propio equipo (para corregir y reenviar),
-- pero solo puede dejarlo como "pending" (no puede auto-aprobarse).
create policy "teams_update_own" on public.teams
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status = 'pending');

-- Host/Admin pueden actualizar el estado de cualquier equipo (aprobar/invalidar)
create policy "teams_update_host_admin" on public.teams
  for update using (public.is_host_or_admin());

-- ---------- team_versions ----------
create policy "team_versions_select_owner_or_staff" on public.team_versions
  for select using (
    public.is_host_or_admin()
    or exists (select 1 from public.teams t where t.id = team_id and t.user_id = auth.uid())
  );

create policy "team_versions_insert_owner_or_staff" on public.team_versions
  for insert with check (
    public.is_host_or_admin()
    or exists (select 1 from public.teams t where t.id = team_id and t.user_id = auth.uid())
  );

-- ---------- team_reviews ----------
-- El jugador puede ver las revisiones de su propio equipo (para ver el motivo)
create policy "team_reviews_select_owner" on public.team_reviews
  for select using (
    exists (select 1 from public.teams t where t.id = team_id and t.user_id = auth.uid())
  );

-- Host/Admin ven todas las revisiones
create policy "team_reviews_select_host_admin" on public.team_reviews
  for select using (public.is_host_or_admin());

-- Solo Host/Admin pueden crear revisiones, y deben ser ellos mismos el reviewer_id
create policy "team_reviews_insert_host_admin" on public.team_reviews
  for insert with check (public.is_host_or_admin() and reviewer_id = auth.uid());

-- ---------- matches ----------
create policy "matches_select_public" on public.matches
  for select using (true);

create policy "matches_write_admin" on public.matches
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- points ----------
create policy "points_select_own" on public.points
  for select using (auth.uid() = user_id);

create policy "points_select_host_admin" on public.points
  for select using (public.is_host_or_admin());

create policy "points_write_admin" on public.points
  for insert with check (public.is_admin());

-- =========================================================
-- 10. Trigger: cuando se agrega un registro en "points",
-- actualizar el total en profiles.academy_points automáticamente
-- (corre con privilegios del dueño de la función, no del cliente)
-- =========================================================
create or replace function public.apply_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set academy_points = academy_points + new.amount
    where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists on_points_insert on public.points;
create trigger on_points_insert
  after insert on public.points
  for each row execute procedure public.apply_points();

-- =========================================================
-- 11. Primer torneo: Copa 151 UABCS
-- =========================================================
insert into public.tournaments (name, event_date, event_time, location, format, rules)
select
  'Copa 151 UABCS',
  '2026-08-25',
  '13:30',
  'Tienda MacDoñas, UABCS',
  'Dobles 4 vs 4',
  'Batallas dobles. 4 Pokémon por jugador. Solo Kanto #001-#151. Máximo 1 legendario. Mew prohibido. Sin repetidos. Sin Megaevolución/Z-Moves/Dynamax/Terastal. Equipos enviados vía Pokémon Showdown antes del lunes 24 de agosto de 2026, 23:59.'
where not exists (select 1 from public.tournaments where name = 'Copa 151 UABCS');

-- =========================================================
-- 12. Cómo convertir tu primera cuenta en admin (ejecutar manualmente
-- después de registrarte desde la web, reemplazando el correo):
--
-- update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
-- =========================================================
