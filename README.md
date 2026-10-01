# Isporuke materijala

Mobilna web aplikacija (PWA) u kojoj vozači kamiona mješalica i kipera unose isporuke, a ured ih
pregledava uživo i izvozi u Excel. Radi i bez interneta: unosi se spremaju na mobitel i šalju kad se
veza vrati.

## Postavljanje

1. Na supabase.com napravite projekt.
2. U SQL Editoru pokrenite `supabase/schema.sql`.
3. Kopirajte `.env.example` u `.env` i upišite URL i `anon` ključ projekta (Project Settings → API).
4. U Authentication → Users dodajte korisnike (e-mail i zaporka).
5. Prvog korisnika za ured postavite u SQL Editoru (zamijenite e-mail svojim):

   ```sql
   update profiles set role = 'ured'
   where id = (select id from auth.users where email = 'vas@email.hr');
   ```

   Ostale uloge i imena mijenjate u aplikaciji, u dijelu Popisi → Korisnici.
6. Pokretanje: `npm install`, zatim `npm run dev`.

## Objava

Povežite GitHub repozitorij s Vercelom ili Netlifyjem (build naredba `npm run build`, izlazna mapa
`dist`) i u njihovim postavkama dodajte varijable `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
Vozači aplikaciju otvore u pregledniku mobitela i odaberu „Dodaj na početni zaslon”.

## Struktura

- `src/pages/DriverEntry.jsx`: obrazac za vozače s redom čekanja za rad bez interneta
- `src/pages/Deliveries.jsx`, `Lists.jsx`, `Reports.jsx`: uredski dio
- `src/lib/offlineQueue.js`: lokalno spremanje i slanje
- `supabase/schema.sql`: tablice i pravila pristupa
