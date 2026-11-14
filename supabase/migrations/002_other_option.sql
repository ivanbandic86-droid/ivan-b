-- Dodatak za baze postavljene prije ove izmjene: opcija "Ostalo" za materijal, gradilište i
-- naručitelja kod vožnji i sati stroja. Pokrenuti jednom u Supabase SQL Editoru.

alter table rides
  alter column site_id drop not null,
  add column custom_site text,
  add column custom_client text,
  add column custom_material text,
  add column needs_review boolean generated always as (site_id is null or (material_id is null and not is_empty)) stored;
alter table rides drop constraint rides_check;
alter table rides
  add check (site_id is not null or nullif(trim(custom_site), '') is not null),
  add check (is_empty or ((material_id is not null or nullif(trim(custom_material), '') is not null)
    and (quantity_m3 is not null or quantity_t is not null)));
create index on rides (work_date) where needs_review;

alter table machine_logs
  alter column site_id drop not null,
  add column custom_site text,
  add column custom_client text,
  add column needs_review boolean generated always as (site_id is null) stored,
  add check (site_id is not null or nullif(trim(custom_site), '') is not null);
create index on machine_logs (work_date) where needs_review;
