-- Pokrenuti u Supabase: SQL Editor -> New query -> Run

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null,
  role text not null check (role in ('ured','vozac')) default 'vozac',
  active boolean not null default true
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  kind text not null check (kind in ('mjesalica','kiper')),
  active boolean not null default true
);

create table materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null check (unit in ('m3','t')),
  active boolean not null default true
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references clients,
  active boolean not null default true
);

create table deliveries (
  id uuid primary key,                       -- generira uredjaj (radi rada bez interneta)
  driver_id uuid not null references profiles,
  vehicle_id uuid not null references vehicles,
  material_id uuid not null references materials,
  client_id uuid not null references clients,
  site_id uuid not null references sites,
  delivery_date date not null,
  quantity numeric(10,2) not null check (quantity > 0),
  location text not null,
  delivery_note text,
  loaded_at time,
  unloaded_at time,
  created_at timestamptz not null default now()
);

create or replace function is_office() returns boolean
language sql security definer stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'ured' and active)
$$;

alter table profiles   enable row level security;
alter table vehicles   enable row level security;
alter table materials  enable row level security;
alter table clients    enable row level security;
alter table sites      enable row level security;
alter table deliveries enable row level security;

-- Popisi: svi prijavljeni citaju, samo ured mijenja
create policy "read" on vehicles  for select to authenticated using (true);
create policy "read" on materials for select to authenticated using (true);
create policy "read" on clients   for select to authenticated using (true);
create policy "read" on sites     for select to authenticated using (true);
create policy "office write" on vehicles  for all to authenticated using (is_office()) with check (is_office());
create policy "office write" on materials for all to authenticated using (is_office()) with check (is_office());
create policy "office write" on clients   for all to authenticated using (is_office()) with check (is_office());
create policy "office write" on sites     for all to authenticated using (is_office()) with check (is_office());

-- Profili: svatko cita svoj, ured cita i mijenja sve
create policy "own or office read" on profiles for select to authenticated
  using (id = auth.uid() or is_office());
create policy "office write" on profiles for all to authenticated
  using (is_office()) with check (is_office());

-- Isporuke: vozac unosi i vidi svoje, ured sve
create policy "driver insert own" on deliveries for insert to authenticated
  with check (driver_id = auth.uid());
create policy "own or office read" on deliveries for select to authenticated
  using (driver_id = auth.uid() or is_office());
create policy "office update" on deliveries for update to authenticated
  using (is_office()) with check (is_office());
create policy "office delete" on deliveries for delete to authenticated
  using (is_office());

-- Uzivo osvjezavanje u uredskom pregledu
alter publication supabase_realtime add table deliveries;

-- Novi korisnik automatski dobiva profil vozaca
create or replace function handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'vozac');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
