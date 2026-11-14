# KiperLog

Mobilna web aplikacija (PWA) za građevinsku tvrtku s kamionima, kiperima i strojevima. Vozači i
strojari unose vožnje, gorivo, kilometre i sate rada; ured uživo prati količine po gradilištu,
potrošnju goriva i trošak, zadaje radne naloge, zaključava razdoblja i izvozi Excel.

Radi i bez signala: unosi se spremaju na mobitel i šalju sami kad se veza vrati.

## Što aplikacija radi

**Vozač / strojar (mobitel)**
- Prijava korisničkim imenom i PIN-om koje dodjeljuje ured.
- Radni nalozi za danas s gumbom „+ Tura”: količina je već upisana, treba je samo potvrditi.
- Vožnja bez naloga, „Ponovi zadnju”, vožnja bez tereta, fotografija otpremnice.
- Ako gradilište, naručitelj ili materijal nisu u izborniku, vozač odabere „Ostalo” i upiše ih sam.
- Radni dan (početni i završni km, vrijeme), točenje goriva, sati stroja po gradilištu.
- Ispravak vlastitih unosa isti i sljedeći dan; starije ispravlja ured.

**Ured (računalo ili mobitel)**
- Pregled uživo: ture, m³ i tone (uvijek odvojeno), km, gorivo, sati strojeva, po gradilištu,
  materijalu, vozaču, vozilu i danu.
- Potrošnja goriva metodom punog tanka i trošak goriva raspoređen po gradilištima.
- „Za obradu”: gradilišta, naručitelji i materijali koje su vozači upisali pod „Ostalo”; ured ih jednim
  klikom dodijeli stavci s popisa ili doda u popis, za sve unose odjednom.
- Unosi s ispravkom i brisanjem, radni nalozi, popisi, korisnici, Excel izvještaj.
- Zaključavanje razdoblja i trag svih izmjena i brisanja.

## Demo bez baze

Bez postavki baze aplikacija se pokreće u demo načinu s primjerima podataka koji ostaju samo u
pregledniku. Tako se može isprobati prije spajanja Supabasea:

```
npm install
npm run dev
```

## Postavljanje (jednom)

1. Na supabase.com otvorite projekt (besplatni plan je dovoljan).
2. U **SQL Editoru** zalijepite cijelu datoteku `supabase/schema.sql` i pokrenite je.
3. **Authentication → Users → Add user**: upišite svoj e-mail i lozinku i uključite „Auto Confirm
   User”. Prvi račun u sustavu automatski postaje ured.
4. **Authentication → Sign In / Providers**: isključite „Allow new users to sign up”. Račune vozača
   otvara ured u aplikaciji (Popisi → Korisnici), a to radi i s isključenom registracijom.
5. Kopirajte `.env.example` u `.env` i upišite URL i `anon` ključ projekta
   (Project Settings → API).
6. Objava: povežite repozitorij s Vercelom ili Netlifyjem (build `npm run build`, izlazna mapa
   `dist`) i u postavkama dodajte varijable `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
7. Prijavite se u aplikaciju (Ured, e-mail i lozinka), u **Popisima** unesite vozila, materijale,
   naručitelje, gradilišta i lokacije te otvorite račune vozačima.

Vozači aplikaciju otvore u pregledniku mobitela i odaberu „Dodaj na početni zaslon”. Prva prijava
mora biti uz signal; nakon toga aplikacija radi i bez njega.

Ako jedini korisnik ureda zaboravi lozinku, nova se postavlja u Supabaseu
(Authentication → Users). Ostalima PIN ili lozinku mijenja ured u aplikaciji.

## Nadogradnja postojeće baze

Ako ste bazu postavili prije neke izmjene, u SQL Editoru jednom pokrenite pripadajuću datoteku iz
`supabase/migrations/` (po redu): `001_delete_user.sql` (brisanje korisnika) i
`002_other_option.sql` (opcija „Ostalo”). Nova postavljanja koriste samo `schema.sql`.

## Testovi

```
npm test          # red čekanja, izračuni goriva i troška, datumi i brojevi
npm run test:db   # shema i pravila pristupa na lokalnom Postgresu (ne dira Supabase)
```

`test:db` treba lokalni Postgres; naredba za spajanje zadaje se varijablom `PSQL`.

## Struktura

- `supabase/schema.sql`: tablice, pravila pristupa, zaključavanje, trag izmjena, računi
- `src/lib/outbox.js`, `sync.js`: red čekanja za rad bez signala
- `src/lib/report.js`: zbrojevi, potrošnja metodom punog tanka, trošak po gradilištu
- `src/lib/db.supabase.js`, `db.demo.js`: pristup bazi i demo način
- `src/pages/driver`: ekrani vozača; `src/pages/office`: ekrani ureda
