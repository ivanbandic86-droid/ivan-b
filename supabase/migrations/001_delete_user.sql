-- Dodatak za baze postavljene prije 15. 11. 2026.: brisanje korisnika.
-- Pokrenuti jednom u Supabase SQL Editoru.

-- Ured briše račun koji nema nijedan unos ni nalog. Račun s unosima se ne može
-- obrisati (unosi bi ostali bez vozača), nego se deaktivira.
create or replace function delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_office() then
    raise exception 'Samo ured može brisati račune.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Vlastiti račun ne možete obrisati.' using errcode = '22023';
  end if;
  begin
    delete from auth.users where id = p_user;
  exception when foreign_key_violation then
    raise exception 'Korisnik ima unose ili naloge pa se ne može obrisati. Deaktivirajte ga.' using errcode = '22023';
  end;
end $$;

revoke execute on function delete_user(uuid) from public, anon;
grant execute on function delete_user(uuid) to authenticated;
