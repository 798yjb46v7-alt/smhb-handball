-- ══════════════════════════════════════════════════════════════
-- SMHB HANDBALL — Schéma Supabase
-- Coller dans : Supabase Dashboard > SQL Editor > New Query
-- ══════════════════════════════════════════════════════════════

-- Extension pour les UUIDs
create extension if not exists "uuid-ossp";

-- ─── CATÉGORIES D'ÉQUIPE ──────────────────────────────────────
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,              -- ex: "Seniors", "U18", "U15", "U13"
  min_age int,                     -- âge minimum
  max_age int,                     -- âge maximum (null = pas de limite)
  color text default '#F5C800',    -- couleur d'affichage
  created_at timestamptz default now()
);

insert into categories (name, min_age, max_age, color) values
  ('Seniors', 18, null, '#F5C800'),
  ('U18', 15, 17, '#22c55e'),
  ('U15', 13, 14, '#3b82f6'),
  ('U13', 11, 12, '#f97316');

-- ─── PROFILS UTILISATEURS ────────────────────────────────────
-- Étend la table auth.users de Supabase
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('coach', 'player', 'parent')),
  category_id uuid references categories(id),
  phone text,
  birth_date date,
  avatar_url text,
  push_subscription jsonb,         -- souscription Web Push (endpoint + keys)
  notify_new_event boolean default true,
  notify_changes boolean default true,
  notify_reminders boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── ENFANTS (lien parent → joueur mineur) ───────────────────
create table if not exists parent_children (
  id uuid primary key default uuid_generate_v4(),
  parent_id uuid not null references profiles(id) on delete cascade,
  child_id uuid not null references profiles(id) on delete cascade,
  unique(parent_id, child_id)
);

-- ─── ÉVÉNEMENTS (matchs + entraînements) ─────────────────────
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('match', 'training')),
  title text not null,
  date date not null,
  time time not null,
  location text,
  home_away text check (home_away in ('home', 'away', null)),
  category_id uuid references categories(id),   -- quelle équipe est concernée
  opponent text,                                 -- adversaire (pour matchs)
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── INSCRIPTIONS AUX ÉVÉNEMENTS ─────────────────────────────
create table if not exists registrations (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  player_id uuid not null references profiles(id) on delete cascade,
  registered_by uuid references profiles(id),   -- null = lui-même, sinon parent
  status text default 'confirmed' check (status in ('confirmed', 'pending', 'absent')),
  created_at timestamptz default now(),
  unique(event_id, player_id)
);

-- ─── NOTIFICATIONS LOG ────────────────────────────────────────
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,              -- 'new_event', 'change', 'reminder', 'cancellation'
  title text not null,
  body text not null,
  event_id uuid references events(id),
  read boolean default false,
  sent_at timestamptz default now()
);

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════════

alter table profiles enable row level security;
alter table events enable row level security;
alter table registrations enable row level security;
alter table notifications enable row level security;
alter table parent_children enable row level security;

-- Profils : chacun voit son profil ; les coachs voient tous
create policy "Profil visible par soi-même" on profiles
  for select using (auth.uid() = id);

create policy "Coachs voient tous les profils" on profiles
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'coach')
  );

create policy "Mise à jour de son propre profil" on profiles
  for update using (auth.uid() = id);

-- Événements : lecture pour tous les connectés, écriture coachs seulement
create policy "Événements lisibles par tous" on events
  for select using (auth.role() = 'authenticated');

create policy "Coachs créent les événements" on events
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'coach')
  );

create policy "Coachs modifient les événements" on events
  for update using (
    exists (select 1 from profiles where id = auth.uid() and role = 'coach')
  );

create policy "Coachs suppriment les événements" on events
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'coach')
  );

-- Inscriptions : chacun gère les siennes + parents gèrent enfants
create policy "Voir ses inscriptions" on registrations
  for select using (
    player_id = auth.uid() or registered_by = auth.uid() or
    exists (select 1 from profiles where id = auth.uid() and role = 'coach')
  );

create policy "S'inscrire soi-même ou inscrire son enfant" on registrations
  for insert with check (
    player_id = auth.uid() or
    exists (select 1 from parent_children where parent_id = auth.uid() and child_id = player_id)
  );

create policy "Se désinscrire" on registrations
  for delete using (
    player_id = auth.uid() or registered_by = auth.uid() or
    exists (select 1 from profiles where id = auth.uid() and role = 'coach')
  );

-- Notifications : chacun voit les siennes
create policy "Voir ses notifications" on notifications
  for select using (user_id = auth.uid());

create policy "Marquer comme lue" on notifications
  for update using (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════
-- FONCTIONS & TRIGGERS
-- ══════════════════════════════════════════════════════════════

-- Crée automatiquement un profil à l'inscription
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Utilisateur'),
    coalesce(new.raw_user_meta_data->>'role', 'player')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Met à jour updated_at automatiquement
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_updated_at before update on events
  for each row execute procedure update_updated_at();

create trigger profiles_updated_at before update on profiles
  for each row execute procedure update_updated_at();

-- ══════════════════════════════════════════════════════════════
-- VUES PRATIQUES
-- ══════════════════════════════════════════════════════════════

-- Vue : événements avec nombre d'inscrits et catégorie
create or replace view events_with_stats as
select
  e.*,
  c.name as category_name,
  c.color as category_color,
  count(r.id) as registration_count
from events e
left join categories c on e.category_id = c.id
left join registrations r on e.id = r.event_id
group by e.id, c.name, c.color;

-- Vue : joueurs avec leur catégorie
create or replace view players_with_category as
select
  p.*,
  c.name as category_name,
  c.color as category_color
from profiles p
left join categories c on p.category_id = c.id
where p.role = 'player';
