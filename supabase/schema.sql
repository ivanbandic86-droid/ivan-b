-- KiperLog: baza, pravila pristupa i funkcije.
-- Pokrenuti jednom u Supabaseu: SQL Editor -> New query -> zalijepiti cijelu datoteku -> Run.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Korisnici
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  full_name text not null,
  role text not null default 'vozac' check (role in ('ured', 'vozac')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active)
$$;

create or replace function is_office() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and role = 'ured')
$$;

-- Svaki novi račun dobiva profil. Prvi račun u sustavu postaje ured; svi ostali
-- nastaju neaktivni, pa netko tko se sam registrira ne vidi ništa dok ga ured
-- ne aktivira. Račune koje ured otvara u aplikaciji aktivira create_user().
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_first boolean := not exists (select 1 from profiles where role = 'ured');
  base text := regexp_replace(lower(split_part(coalesce(new.email, new.id::text), '@', 1)), '[^a-z0-9._-]', '.', 'g');
  uname text;
  n int := 0;
begin
  if length(base) < 3 then
    base := rpad(base, 3, '0');
  end if;
  base := substr(base, 1, 26);
  uname := base;
  while exists (select 1 from profiles where username = uname) loop
    n := n + 1;
    uname := base || n;
  end loop;
  insert into profiles (id, username, full_name, role, active)
  values (
    new.id, uname,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), uname),
    case when is_first then 'ured' else 'vozac' end,
    is_first
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Ured ne može sam sebi oduzeti ulogu ni deaktivirati se (da se ne zaključa),
-- a korisničko ime se ne mijenja jer je vezano uz prijavu.
create or replace function guard_profile_update() returns trigger
language plpgsql as $$
begin
  if new.username <> old.username then
    raise exception 'Korisničko ime se ne može mijenjati.' using errcode = '22023';
  end if;
  if old.id = auth.uid() and (new.role <> old.role or new.active <> old.active) then
    raise exception 'Vlastitu ulogu i status ne možete mijenjati.' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_update();

create or replace function check_secret(p_role text, p_secret text) returns void
language plpgsql immutable as $$
begin
  if p_role = 'vozac' and p_secret !~ '^[0-9]{6,12}$' then
    raise exception 'PIN vozača mora imati 6 do 12 znamenki.' using errcode = '22023';
  end if;
  if p_role = 'ured' and length(p_secret) < 8 then
    raise exception 'Lozinka ureda mora imati najmanje 8 znakova.' using errcode = '22023';
  end if;
end $$;

-- Ured otvara račun vozaču: korisničko ime + PIN, bez e-maila.
create or replace function create_user(p_username text, p_full_name text, p_role text, p_secret text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := gen_random_uuid();
  uname text := lower(trim(p_username));
  mail text;
begin
  if not is_office() then
    raise exception 'Samo ured može otvarati račune.' using errcode = '42501';
  end if;
  if uname !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Korisničko ime: 3 do 30 znakova, mala slova, brojke, točka, crtica.' using errcode = '22023';
  end if;
  if p_role not in ('ured', 'vozac') then
    raise exception 'Nepoznata uloga.' using errcode = '22023';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Upišite ime i prezime.' using errcode = '22023';
  end if;
  perform check_secret(p_role, p_secret);
  if exists (select 1 from profiles where username = uname) then
    raise exception 'Korisničko ime je zauzeto.' using errcode = '23505';
  end if;

  mail := uname || '@kiperlog.local';
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
    crypt(p_secret, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name)), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), uid, uid::text, 'email',
    jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
    now(), now(), now()
  );
  update profiles set full_name = trim(p_full_name), role = p_role, active = true where id = uid;
  return uid;
end $$;

-- Ured postavlja novi PIN ili lozinku.
create or replace function set_user_secret(p_user uuid, p_secret text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  target_role text;
begin
  if not is_office() then
    raise exception 'Samo ured može mijenjati PIN.' using errcode = '42501';
  end if;
  select role into target_role from profiles where id = p_user;
  if target_role is null then
    raise exception 'Korisnik ne postoji.' using errcode = '22023';
  end if;
  perform check_secret(target_role, p_secret);
  update auth.users set encrypted_password = crypt(p_secret, gen_salt('bf')), updated_at = now()
  where id = p_user;
end $$;

revoke execute on function create_user(text, text, text, text) from public, anon;
revoke execute on function set_user_secret(uuid, text) from public, anon;
grant execute on function create_user(text, text, text, text) to authenticated;
grant execute on function set_user_secret(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Popisi
-- ---------------------------------------------------------------------------

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- registracija ili interna oznaka stroja
  name text,
  category text not null default 'vozilo' check (category in ('vozilo', 'stroj')),
  kind text not null,                        -- kiper, kamion, mješalica, bager, valjak...
  capacity_m3 numeric(8,2) check (capacity_m3 > 0),
  capacity_t numeric(8,2) check (capacity_t > 0),
  default_driver_id uuid references profiles on delete set null,
  active boolean not null default true
);

create table materials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'm3' check (unit in ('m3', 't')),
  active boolean not null default true
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  internal boolean not null default false,
  active boolean not null default true
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  client_id uuid references clients,
  active boolean not null default true
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'ostalo'
    check (kind in ('kamenolom', 'betonara', 'asfaltna_baza', 'deponij', 'skladiste', 'ostalo')),
  active boolean not null default true
);

-- Zaključavanje: unosi s datumom do locked_until (uključivo) više se ne mogu mijenjati.
create table app_settings (
  id boolean primary key default true check (id),
  locked_until date
);
insert into app_settings (id) values (true);

create or replace function is_locked(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(d <= (select locked_until from app_settings), false)
$$;

create or replace function today_hr() returns date
language sql stable as $$
  select (now() at time zone 'Europe/Zagreb')::date
$$;

-- Vozač ispravlja današnje i jučerašnje unose (noćne smjene i kasno slanje).
create or replace function driver_can_edit(d date) returns boolean
language sql stable as $$
  select d >= today_hr() - 1
$$;

-- ---------------------------------------------------------------------------
-- Radni nalozi i unosi
-- ---------------------------------------------------------------------------

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  driver_id uuid not null references profiles,
  vehicle_id uuid references vehicles,
  site_id uuid not null references sites,
  material_id uuid references materials,
  load_location_id uuid references locations,
  unload_location_id uuid references locations,
  planned_trips int check (planned_trips > 0),
  note text,
  status text not null default 'otvoren' check (status in ('otvoren', 'zavrsen', 'otkazan')),
  created_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);
create index on work_orders (work_date, driver_id);

-- id svih unosa generira mobitel, pa ponovno slanje nakon slabog signala
-- ne može stvoriti duplikat.
create table rides (
  id uuid primary key,
  driver_id uuid not null references profiles,
  vehicle_id uuid not null references vehicles,
  site_id uuid not null references sites,
  material_id uuid references materials,
  load_location_id uuid references locations,
  unload_location_id uuid references locations,
  work_order_id uuid references work_orders on delete set null,
  ride_at timestamptz not null,
  work_date date not null,
  is_empty boolean not null default false,   -- vožnja bez tereta
  quantity_m3 numeric(10,2) check (quantity_m3 > 0),
  quantity_t numeric(10,2) check (quantity_t > 0),
  delivery_note text,
  recipient text,
  note text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_empty or (material_id is not null and (quantity_m3 is not null or quantity_t is not null)))
);
create index on rides (work_date);
create index on rides (driver_id, work_date);

create table day_logs (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references profiles,
  vehicle_id uuid not null references vehicles,
  work_date date not null,
  start_km numeric(10,1) check (start_km >= 0),
  end_km numeric(10,1),
  work_start time,
  work_end time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_id, vehicle_id, work_date),
  check (end_km is null or start_km is null or end_km >= start_km)
);
create index on day_logs (work_date);

create table machine_logs (
  id uuid primary key,
  driver_id uuid not null references profiles,
  vehicle_id uuid not null references vehicles,
  site_id uuid not null references sites,
  work_order_id uuid references work_orders on delete set null,
  work_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  activity text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on machine_logs (work_date);

create table fuel_entries (
  id uuid primary key,
  driver_id uuid not null references profiles,
  vehicle_id uuid not null references vehicles,
  fueled_at timestamptz not null,
  work_date date not null,
  liters numeric(8,2) not null check (liters > 0),
  price_per_l numeric(8,3) check (price_per_l >= 0),
  meter numeric(10,1) check (meter >= 0),    -- km (vozilo) ili moto-sati (stroj) pri točenju
  full_tank boolean not null default true,
  station text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on fuel_entries (vehicle_id, work_date);

-- Trag izmjena: svaka promjena i brisanje unosa ostaje zapisano.
create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  action text not null,
  actor uuid,
  at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);
create index on audit_log (at desc);

create or replace function audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into audit_log (table_name, row_id, action, actor, old_row)
    values (tg_table_name, old.id, 'delete', auth.uid(), to_jsonb(old));
    return old;
  end if;
  insert into audit_log (table_name, row_id, action, actor, old_row, new_row)
  values (tg_table_name, new.id, 'update', auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end $$;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Pravila pristupa
-- ---------------------------------------------------------------------------

alter table profiles     enable row level security;
alter table app_settings enable row level security;
alter table work_orders  enable row level security;
alter table audit_log    enable row level security;

create policy "own or office read" on profiles for select to authenticated
  using (id = auth.uid() or is_office());
create policy "office update" on profiles for update to authenticated
  using (is_office()) with check (is_office());

create policy "member read" on app_settings for select to authenticated using (is_member());
create policy "office update" on app_settings for update to authenticated
  using (is_office()) with check (is_office());

create policy "own or office read" on work_orders for select to authenticated
  using (is_office() or (driver_id = auth.uid() and is_member()));
create policy "office write" on work_orders for all to authenticated
  using (is_office()) with check (is_office());

create policy "office read" on audit_log for select to authenticated using (is_office());

do $$
declare
  t text;
begin
  -- Popisi: aktivni korisnici čitaju, ured mijenja.
  foreach t in array array['vehicles', 'materials', 'clients', 'sites', 'locations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "member read" on %I for select to authenticated using (is_member())', t);
    execute format('create policy "office write" on %I for all to authenticated using (is_office()) with check (is_office())', t);
  end loop;

  -- Unosi: vozač unosi i vidi svoje, ispravlja ih danas i sutradan; ured vidi i
  -- ispravlja sve. Zaključano razdoblje ne može mijenjati nitko.
  foreach t in array array['rides', 'day_logs', 'machine_logs', 'fuel_entries'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$
      create policy "own or office read" on %I for select to authenticated
        using (is_office() or (driver_id = auth.uid() and is_member()))
    $p$, t);
    execute format($p$
      create policy "insert" on %I for insert to authenticated
        with check (not is_locked(work_date) and (is_office() or (driver_id = auth.uid() and is_member())))
    $p$, t);
    execute format($p$
      create policy "update" on %I for update to authenticated
        using (not is_locked(work_date)
          and (is_office() or (driver_id = auth.uid() and is_member() and driver_can_edit(work_date))))
        with check (not is_locked(work_date)
          and (is_office() or (driver_id = auth.uid() and is_member() and driver_can_edit(work_date))))
    $p$, t);
    execute format($p$
      create policy "delete" on %I for delete to authenticated
        using (not is_locked(work_date)
          and (is_office() or (driver_id = auth.uid() and is_member() and driver_can_edit(work_date))))
    $p$, t);
    execute format('create trigger %I after update or delete on %I for each row execute function audit_change()', t || '_audit', t);
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Izvještaji
-- ---------------------------------------------------------------------------

-- Zbroj vožnji po danu, gradilištu, materijalu, vozaču i vozilu. Računa baza, pa
-- izvještaj ne ovisi o broju redaka koje preglednik smije dohvatiti odjednom.
create or replace function ride_daily(p_from date, p_to date)
returns table (
  work_date date, site_id uuid, material_id uuid, driver_id uuid, vehicle_id uuid,
  trips bigint, empty_trips bigint, m3 numeric, t numeric, m3_trips bigint, t_trips bigint
)
language sql stable set search_path = public as $$
  select r.work_date, r.site_id, r.material_id, r.driver_id, r.vehicle_id,
    count(*) filter (where not r.is_empty),
    count(*) filter (where r.is_empty),
    coalesce(sum(r.quantity_m3), 0),
    coalesce(sum(r.quantity_t), 0),
    count(r.quantity_m3),
    count(r.quantity_t)
  from rides r
  where r.work_date between p_from and p_to
  group by r.work_date, r.site_id, r.material_id, r.driver_id, r.vehicle_id
  order by r.work_date, r.site_id, r.material_id, r.driver_id, r.vehicle_id
$$;

-- ---------------------------------------------------------------------------
-- Fotografije otpremnica (privatno spremište) i osvježavanje uživo
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('otpremnice', 'otpremnice', false)
on conflict (id) do nothing;

create policy "otpremnice upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'otpremnice' and (storage.foldername(name))[1] = auth.uid()::text and is_member());
create policy "otpremnice read own or office" on storage.objects for select to authenticated
  using (bucket_id = 'otpremnice' and (is_office() or ((storage.foldername(name))[1] = auth.uid()::text and is_member())));
create policy "otpremnice office delete" on storage.objects for delete to authenticated
  using (bucket_id = 'otpremnice' and is_office());

alter publication supabase_realtime add table rides, fuel_entries, machine_logs, day_logs, work_orders;
