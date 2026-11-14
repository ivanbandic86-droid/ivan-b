-- Minimalna zamjena za Supabase okruženje, samo za lokalne testove sheme.
-- Na pravom Supabaseu ovo već postoji i NE pokreće se.
create schema auth;
create schema extensions;
create schema storage;
create extension pgcrypto with schema extensions;

do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth, storage, extensions to anon, authenticated;

create table auth.users (
  instance_id uuid, id uuid primary key, aud varchar, role varchar, email varchar unique,
  encrypted_password varchar, email_confirmed_at timestamptz,
  confirmation_token varchar, recovery_token varchar, email_change_token_new varchar, email_change varchar,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz
);
create table auth.identities (
  id uuid primary key, user_id uuid not null references auth.users on delete cascade,
  provider_id text not null, provider text not null, identity_data jsonb not null,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  unique (provider_id, provider)
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

create publication supabase_realtime;
