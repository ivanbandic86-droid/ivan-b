-- Testovi sheme i pravila pristupa. Pokreće ih supabase/tests/run.sh na lokalnom Postgresu.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- Pomoćne funkcije ------------------------------------------------------------

create function t_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), false);
end $$;

-- Naredba mora pasti s danim SQLSTATE-om.
create function t_fails(q text, code text, label text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    if sqlstate = code then
      raise notice 'ok    %', label;
      return;
    end if;
    raise exception 'FAIL  %: ocekivan %, dobiven % (%)', label, code, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL  %: naredba je prosla, a morala je pasti s %', label, code;
end $$;

-- Naredba mora zahvatiti tocno n redaka.
create function t_rows(q text, n bigint, label text) returns void language plpgsql as $$
declare got bigint;
begin
  execute q;
  get diagnostics got = row_count;
  if got <> n then
    raise exception 'FAIL  %: ocekivano % redaka, zahvaceno %', label, n, got;
  end if;
  raise notice 'ok    %', label;
end $$;

create function t_eq(got anyelement, want anyelement, label text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL  %: ocekivano %, dobiveno %', label, want, got;
  end if;
  raise notice 'ok    %', label;
end $$;

grant execute on all functions in schema public to authenticated;

-- Racuni ----------------------------------------------------------------------

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'Ivan.Bandic@example.com');
select t_eq((select role || ':' || active || ':' || username from profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'ured:true:ivan.bandic', 'prvi racun postaje aktivan ured');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b2', 'stranac@example.com');
select t_eq((select role || ':' || active from profiles where id = '00000000-0000-0000-0000-0000000000b2'),
  'vozac:false', 'samostalno registriran racun je neaktivan vozac');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b3', 'ivan.bandic@drugi.hr');
select t_eq((select username from profiles where id = '00000000-0000-0000-0000-0000000000b3'),
  'ivan.bandic1', 'zauzeto korisnicko ime dobiva nastavak');

\set ured '00000000-0000-0000-0000-0000000000a1'
\set stranac '00000000-0000-0000-0000-0000000000b2'

-- Popisi (kao ured)
set role authenticated;
select t_as(:'ured');
insert into vehicles (id, code, kind, category) values
  ('10000000-0000-0000-0000-000000000001', 'ST-1234-AB', 'kiper', 'vozilo'),
  ('10000000-0000-0000-0000-000000000002', 'BAGER-1', 'bager', 'stroj');
insert into materials (id, name, unit) values ('20000000-0000-0000-0000-000000000001', 'Tampon 0-31,5', 'm3');
insert into clients (id, name) values ('30000000-0000-0000-0000-000000000001', 'Hrvatske ceste');
insert into sites (id, name, client_id) values
  ('40000000-0000-0000-0000-000000000001', 'D8 Kastela', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', 'Baza Dugopolje', null);
insert into locations (id, name, kind) values ('50000000-0000-0000-0000-000000000001', 'Kamenolom Klis', 'kamenolom');

-- Otvaranje racuna
select create_user('Marko', 'Marko Maric', 'vozac', '123456') as marko \gset
select create_user('ante', 'Ante Antic', 'vozac', '654321') as ante \gset
select t_eq((select role || ':' || active || ':' || username || ':' || full_name from profiles where id = :'marko'),
  'vozac:true:marko:Marko Maric', 'create_user otvara aktivnog vozaca');
select t_fails($$select create_user('marko', 'Drugi Marko', 'vozac', '111111')$$, '23505', 'zauzeto korisnicko ime se odbija');
select t_fails($$select create_user('pero', 'Pero Peric', 'vozac', '12345')$$, '22023', 'prekratak PIN se odbija');
select t_fails($$select create_user('pero', 'Pero Peric', 'vozac', 'abcdef')$$, '22023', 'PIN sa slovima se odbija');
select t_fails($$select create_user('ana', 'Ana Anic', 'ured', '1234567')$$, '22023', 'prekratka lozinka ureda se odbija');
select t_fails($$select create_user('x y', 'Iks', 'vozac', '123456')$$, '22023', 'neispravno korisnicko ime se odbija');
select t_fails($$update profiles set role = 'vozac' where id = '00000000-0000-0000-0000-0000000000a1'$$, '22023', 'ured si ne moze oduzeti ulogu');
select t_fails($$update profiles set active = false where id = '00000000-0000-0000-0000-0000000000a1'$$, '22023', 'ured se ne moze sam deaktivirati');
select t_fails(format($$update profiles set username = 'novi' where id = %L$$, :'marko'), '22023', 'korisnicko ime se ne mijenja');

reset role;
select t_eq((select email || ':' || (encrypted_password = extensions.crypt('123456', encrypted_password))::text
    || ':' || (email_confirmed_at is not null)::text || ':' || (confirmation_token = '')::text
  from auth.users where id = :'marko'),
  'marko@kiperlog.local:true:true:true', 'racun za prijavu ima e-mail, PIN i potvrdu');
select t_eq((select count(*) from auth.identities where user_id = :'marko' and provider = 'email'), 1::bigint, 'racun ima identitet za prijavu');

-- Neaktivan racun ne vidi nista ------------------------------------------------
set role authenticated;
select t_as(:'stranac');
select t_eq((select count(*) from materials), 0::bigint, 'neaktivan racun ne vidi popise');
select t_eq((select count(*) from profiles), 1::bigint, 'neaktivan racun vidi samo svoj profil');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date, quantity_m3)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', now(), today_hr(), 12)$$, :'stranac'), '42501', 'neaktivan racun ne moze unijeti voznju');
select t_fails($$select create_user('haker', 'Haker', 'ured', 'lozinka123')$$, '42501', 'vozac ne moze otvarati racune');
select t_fails(format($$select set_user_secret(%L, 'novalozinka')$$, :'ured'), '42501', 'vozac ne moze mijenjati tudji PIN');

-- Vozac ------------------------------------------------------------------------
select t_as(:'marko');
select t_eq((select count(*) from materials), 1::bigint, 'vozac cita popise');
select t_fails($$insert into materials (name) values ('Pijesak')$$, '42501', 'vozac ne moze mijenjati popise');

insert into rides (id, driver_id, vehicle_id, site_id, material_id, load_location_id, ride_at, work_date, quantity_m3)
values ('60000000-0000-0000-0000-000000000001', :'marko', '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001', now(), today_hr(), 12);
insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date, quantity_m3, quantity_t)
values ('60000000-0000-0000-0000-000000000002', :'marko', '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now(), today_hr(), 11.5, 20.7);
insert into rides (id, driver_id, vehicle_id, site_id, ride_at, work_date, is_empty)
values ('60000000-0000-0000-0000-000000000003', :'marko', '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002', now(), today_hr(), true);
insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date, quantity_t)
values ('60000000-0000-0000-0000-000000000004', :'marko', '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', now() - interval '5 days', today_hr() - 5, 18);

select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date, quantity_m3)
  values ('60000000-0000-0000-0000-000000000001', %L, '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now(), today_hr(), 12)$$, :'marko'),
  '23505', 'ponovno slanje iste voznje ne stvara duplikat');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date, quantity_m3)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', now(), today_hr(), 12)$$, :'ante'), '42501', 'vozac ne moze unijeti voznju na tudje ime');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', now(), today_hr())$$, :'marko'), '23514', 'voznja s teretom mora imati kolicinu');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date, quantity_m3)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', now(), today_hr(), 0)$$, :'marko'), '23514', 'kolicina nula se odbija');

select t_rows($$update rides set quantity_m3 = 13 where id = '60000000-0000-0000-0000-000000000001'$$, 1, 'vozac ispravlja danasnju voznju');
select t_rows($$update rides set quantity_t = 19 where id = '60000000-0000-0000-0000-000000000004'$$, 0, 'vozac ne moze ispraviti staru voznju');
select t_rows($$delete from rides where id = '60000000-0000-0000-0000-000000000004'$$, 0, 'vozac ne moze obrisati staru voznju');
select t_fails(format($$update rides set driver_id = %L where id = '60000000-0000-0000-0000-000000000001'$$, :'ante'), '42501', 'vozac ne moze prebaciti voznju na drugoga');

-- Dnevni unos: drugi unos za isti dan i vozilo mijenja postojeci
insert into day_logs (driver_id, vehicle_id, work_date, start_km, work_start)
values (:'marko', '10000000-0000-0000-0000-000000000001', today_hr(), 152300, '06:30');
insert into day_logs (driver_id, vehicle_id, work_date, start_km, end_km, work_start, work_end)
values (:'marko', '10000000-0000-0000-0000-000000000001', today_hr(), 152300, 152480, '06:30', '15:10')
on conflict (driver_id, vehicle_id, work_date) do update
  set end_km = excluded.end_km, work_end = excluded.work_end;
select t_eq((select count(*) || ':' || max(end_km) from day_logs), '1:152480.0', 'dnevni unos se nadopunjuje bez duplikata');
select t_fails($$update day_logs set end_km = 100$$, '23514', 'zavrsni km manji od pocetnog se odbija');

insert into fuel_entries (id, driver_id, vehicle_id, fueled_at, work_date, liters, price_per_l, meter, full_tank)
values (gen_random_uuid(), :'marko', '10000000-0000-0000-0000-000000000001', now(), today_hr(), 180, 1.42, 152400, true);
insert into machine_logs (id, driver_id, vehicle_id, site_id, work_date, hours, activity)
values (gen_random_uuid(), :'marko', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', today_hr(), 7.5, 'iskop');
select t_fails(format($$insert into machine_logs (id, driver_id, vehicle_id, site_id, work_date, hours)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', today_hr(), 25)$$, :'marko'),
  '23514', 'vise od 24 sata stroja se odbija');

-- Drugi vozac ne vidi tudje
select t_as(:'ante');
select t_eq((select count(*) from rides), 0::bigint, 'vozac ne vidi tudje voznje');
select t_eq((select count(*) from fuel_entries) + (select count(*) from day_logs) + (select count(*) from machine_logs), 0::bigint,
  'vozac ne vidi tudje gorivo, dnevne unose ni sate stroja');
select t_eq((select count(*) from audit_log), 0::bigint, 'vozac ne vidi trag izmjena');
select t_eq((select count(*) from profiles), 1::bigint, 'vozac vidi samo svoj profil');

-- Radni nalozi
select t_as(:'ured');
insert into work_orders (work_date, driver_id, vehicle_id, site_id, material_id, planned_trips)
values (today_hr(), :'marko', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', 8);
select t_as(:'ante');
select t_eq((select count(*) from work_orders), 0::bigint, 'vozac ne vidi tudji nalog');
select t_as(:'marko');
select t_eq((select count(*) from work_orders), 1::bigint, 'vozac vidi svoj nalog');
select t_rows($$update work_orders set planned_trips = 1$$, 0, 'vozac ne moze mijenjati nalog');

-- Ured -------------------------------------------------------------------------
select t_as(:'ured');
select t_eq((select count(*) from rides), 4::bigint, 'ured vidi sve voznje');
select t_rows($$update rides set quantity_t = 19 where id = '60000000-0000-0000-0000-000000000004'$$, 1, 'ured ispravlja staru voznju');
select t_eq((select count(*) from audit_log where table_name = 'rides' and action = 'update'), 2::bigint, 'izmjene su zapisane u tragu');
select t_eq((select (old_row->>'quantity_t') || '>' || (new_row->>'quantity_t') || ':' || (actor = '00000000-0000-0000-0000-0000000000a1')::text
  from audit_log where row_id = '60000000-0000-0000-0000-000000000004'), '18.00>19.00:true', 'trag cuva staru i novu vrijednost te tko je mijenjao');

select t_eq((select string_agg(trips || '/' || empty_trips || '/' || m3 || '/' || t || '/' || m3_trips || '/' || t_trips, ' | '
    order by work_date, site_id) from ride_daily(today_hr() - 30, today_hr())),
  '1/0/0/19.00/0/1 | 2/0/24.50/20.70/2/1 | 0/1/0/0/0/0', 'ride_daily zbraja po danu i gradilistu, m3 i t odvojeno');

-- Zakljucavanje
update app_settings set locked_until = today_hr() - 3;
select t_rows($$update rides set quantity_t = 20 where id = '60000000-0000-0000-0000-000000000004'$$, 0, 'zakljucanu voznju ne moze ispraviti ni ured');
select t_rows($$delete from rides where id = '60000000-0000-0000-0000-000000000004'$$, 0, 'zakljucanu voznju ne moze obrisati ni ured');
select t_as(:'marko');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, material_id, ride_at, work_date, quantity_m3)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', now(), today_hr() - 4, 12)$$, :'marko'), '42501', 'unos u zakljucano razdoblje se odbija');
select t_rows($$update app_settings set locked_until = null$$, 0, 'vozac ne moze otkljucati razdoblje');
select t_rows($$update rides set quantity_m3 = 14 where id = '60000000-0000-0000-0000-000000000001'$$, 1, 'nezakljucan dan se i dalje moze ispravljati');
select t_as(:'ured');
update app_settings set locked_until = null;
select t_rows($$delete from rides where id = '60000000-0000-0000-0000-000000000004'$$, 1, 'nakon otkljucavanja ured brise voznju');
select t_eq((select count(*) from audit_log where action = 'delete'), 1::bigint, 'brisanje je zapisano u tragu');

-- PIN i deaktivacija
select set_user_secret(:'marko', '999888');
select t_fails(format($$select set_user_secret(%L, '12')$$, :'marko'), '22023', 'neispravan novi PIN se odbija');
reset role;
select t_eq((select encrypted_password = extensions.crypt('999888', encrypted_password) from auth.users where id = :'marko'), true, 'novi PIN je postavljen');
set role authenticated;
select t_as(:'ured');
update profiles set active = false where id = :'marko';
select t_as(:'marko');
select t_eq((select count(*) from rides) + (select count(*) from materials), 0::bigint, 'deaktivirani vozac vise ne vidi nista');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, ride_at, work_date, is_empty)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', now(), today_hr(), true)$$, :'marko'),
  '42501', 'deaktivirani vozac ne moze unositi');

-- Opcija "Ostalo"
select t_as(:'ante');
insert into rides (id, driver_id, vehicle_id, site_id, material_id, custom_site, custom_client, custom_material, ride_at, work_date, quantity_m3)
values ('60000000-0000-0000-0000-0000000000f1', :'ante', '10000000-0000-0000-0000-000000000001', null, null,
  'Privatno gradiliste Kastel Sucurac', 'Ivo Ivic', 'Crni tucanik', now(), today_hr(), 10);
select t_eq((select needs_review from rides where id = '60000000-0000-0000-0000-0000000000f1'), true, 'voznja s upisanim gradilistem ceka obradu');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, ride_at, work_date, is_empty)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', now(), today_hr(), true)$$, :'ante'),
  '23514', 'bez gradilista s popisa i bez upisanog teksta se odbija');
select t_fails(format($$insert into rides (id, driver_id, vehicle_id, site_id, custom_material, ride_at, work_date, quantity_m3)
  values (gen_random_uuid(), %L, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '  ', now(), today_hr(), 5)$$, :'ante'),
  '23514', 'prazan upisani materijal se odbija');
insert into machine_logs (id, driver_id, vehicle_id, site_id, custom_site, work_date, hours)
values (gen_random_uuid(), :'ante', '10000000-0000-0000-0000-000000000002', null, 'Nova lokacija', today_hr(), 3);
select t_eq((select count(*) from machine_logs where needs_review), 1::bigint, 'sati stroja na upisanom gradilistu cekaju obradu');
select t_as(:'ured');
select t_eq((select count(*) from rides where needs_review), 1::bigint, 'ured vidi voznje za obradu');
select t_rows($$update rides set site_id = '40000000-0000-0000-0000-000000000001', material_id = '20000000-0000-0000-0000-000000000001',
  custom_site = null, custom_client = null, custom_material = null where needs_review$$, 1, 'ured dodjeljuje stavke s popisa');
select t_eq((select count(*) from rides where needs_review), 0::bigint, 'nakon dodjele voznja vise ne ceka obradu');

-- Brisanje racuna
select t_as(:'ured');
select t_fails(format($$select delete_user(%L)$$, :'marko'), '22023', 'racun s unosima se ne moze obrisati');
select t_fails($$select delete_user('00000000-0000-0000-0000-0000000000a1')$$, '22023', 'vlastiti racun se ne moze obrisati');
select create_user('proba', 'Proba Probic', 'vozac', '111222') as proba \gset
select delete_user(:'proba');
select t_eq((select count(*) from profiles where username = 'proba'), 0::bigint, 'racun bez unosa je obrisan zajedno s profilom');
reset role;
select t_eq((select count(*) from auth.users where email = 'proba@kiperlog.local') + (select count(*) from auth.identities where user_id = :'proba'), 0::bigint, 'obrisana je i prijava racuna');
set role authenticated;
select t_as(:'ante');
select t_fails(format($$select delete_user(%L)$$, :'stranac'), '42501', 'vozac ne moze brisati racune');
select t_as(:'ured');
select t_fails($$delete from locations where id = '50000000-0000-0000-0000-000000000001'$$, '23503', 'stavka popisa koja se koristi u unosima ne moze se obrisati');
insert into materials (id, name) values ('20000000-0000-0000-0000-000000000009', 'Pijesak');
select t_rows($$delete from materials where id = '20000000-0000-0000-0000-000000000009'$$, 1, 'nekoristena stavka popisa se brise');

-- Fotografije otpremnica
select t_as(:'ante');
insert into storage.objects (bucket_id, name) values ('otpremnice', :'ante' || '/a.jpg');
select t_fails(format($$insert into storage.objects (bucket_id, name) values ('otpremnice', %L)$$, :'marko' || '/b.jpg'), '42501', 'fotografija ide samo u vlastitu mapu');
select t_as(:'ured');
select t_eq((select count(*) from storage.objects), 1::bigint, 'ured vidi fotografije svih vozaca');
select t_as(:'stranac');
select t_eq((select count(*) from storage.objects), 0::bigint, 'neaktivan racun ne vidi fotografije');

-- Neprijavljeni
reset role;
set role anon;
select t_fails($$select count(*) from rides$$, '42501', 'neprijavljeni nemaju pristup tablicama');
select t_fails($$select create_user('a', 'b', 'ured', 'lozinka123')$$, '42501', 'neprijavljeni ne mogu otvarati racune');
reset role;

\echo SVI TESTOVI BAZE SU PROSLI
