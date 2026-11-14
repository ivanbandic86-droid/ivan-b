import { useState } from 'react'
import { Banner, Check, Dialog, Icon, Num, Seg, Select, Text, useAction, useConfirm } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { db } from '../../lib/db'
import { KIND_LABEL, useLists } from '../../lib/lists'
import { fmt, parseNum } from '../../lib/num'

const yesNo = (v) => (v ? 'Da' : 'Ne')

// Opis svakog popisa: stupci tablice i polja obrasca.
const TABLES = {
  vehicles: {
    label: 'Vozila i strojevi', one: 'vozilo ili stroj', sort: 'code',
    blank: { code: '', name: '', category: 'vozilo', kind: 'kiper', capacity_m3: '', capacity_t: '', default_driver_id: null, active: true },
    columns: [['Oznaka', (r) => r.code], ['Naziv', (r) => r.name ?? ''], ['Vrsta', (r) => r.kind],
      ['m³', (r) => (r.capacity_m3 != null ? fmt(r.capacity_m3) : '–'), 'r'], ['t', (r) => (r.capacity_t != null ? fmt(r.capacity_t) : '–'), 'r'],
      ['Dodijeljeno', (r, L) => (r.default_driver_id ? L.userName(r.default_driver_id) : '')]],
    fields: (f, set, L) => <>
      <Select label="Skupina" value={f.category} onChange={(v) => set({ category: v ?? 'vozilo' })} options={[['vozilo', 'Vozilo (kamion, kiper, mješalica)'], ['stroj', 'Stroj (bager, valjak, finišer)']]} placeholder="Vozilo" />
      <Text label={f.category === 'stroj' ? 'Interna oznaka' : 'Registracija'} value={f.code} onChange={(v) => set({ code: v })} autoCapitalize="characters" />
      <div className="grid2">
        <Text label="Vrsta" hint="npr. kiper, bager" value={f.kind} onChange={(v) => set({ kind: v })} />
        <Text label="Naziv" hint="marka i tip" value={f.name} onChange={(v) => set({ name: v })} />
      </div>
      {f.category !== 'stroj' && <div className="grid2">
        <Num label="Nosivost m³" value={f.capacity_m3} onChange={(v) => set({ capacity_m3: v })} />
        <Num label="Nosivost t" value={f.capacity_t} onChange={(v) => set({ capacity_t: v })} />
      </div>}
      <Select label="Dodijeljeno vozaču" value={f.default_driver_id} onChange={(v) => set({ default_driver_id: v })} options={L.options.drivers(f.default_driver_id)} placeholder="Nikome" />
    </>,
    row: (f) => {
      const m3 = parseNum(f.capacity_m3)
      const t = parseNum(f.capacity_t)
      if (!f.code.trim() || !f.kind.trim()) throw new Error('Upišite oznaku i vrstu.')
      if (Number.isNaN(m3) || Number.isNaN(t) || m3 === 0 || t === 0) throw new Error('Nosivost mora biti broj veći od 0.')
      const machine = f.category === 'stroj'
      return {
        code: f.code.trim().toUpperCase(), name: f.name?.trim() || null, category: f.category, kind: f.kind.trim().toLowerCase(),
        capacity_m3: machine ? null : m3, capacity_t: machine ? null : t, default_driver_id: f.default_driver_id, active: f.active,
      }
    },
  },
  materials: {
    label: 'Materijali', one: 'materijal', sort: 'name',
    blank: { name: '', unit: 'm3', active: true },
    columns: [['Naziv', (r) => r.name], ['Glavna jedinica', (r) => (r.unit === 't' ? 't' : 'm³')]],
    fields: (f, set) => <>
      <Text label="Naziv" value={f.name} onChange={(v) => set({ name: v })} />
      <Select label="Glavna jedinica" value={f.unit} onChange={(v) => set({ unit: v ?? 'm3' })} options={[['m3', 'm³'], ['t', 't (tone)']]} placeholder="m³" />
    </>,
    row: (f) => {
      if (!f.name.trim()) throw new Error('Upišite naziv.')
      return { name: f.name.trim(), unit: f.unit, active: f.active }
    },
  },
  sites: {
    label: 'Gradilišta', one: 'gradilište', sort: 'name',
    blank: { name: '', client_id: null, active: true },
    columns: [['Naziv', (r) => r.name], ['Naručitelj', (r, L) => L.clientName(r.client_id)]],
    fields: (f, set, L) => <>
      <Text label="Naziv" value={f.name} onChange={(v) => set({ name: v })} />
      <Select label="Naručitelj" value={f.client_id} onChange={(v) => set({ client_id: v })} options={L.options.clients(f.client_id)} placeholder="Nije upisan" />
    </>,
    row: (f) => {
      if (!f.name.trim()) throw new Error('Upišite naziv.')
      return { name: f.name.trim(), client_id: f.client_id, active: f.active }
    },
  },
  clients: {
    label: 'Naručitelji', one: 'naručitelja', sort: 'name',
    blank: { name: '', internal: false, active: true },
    columns: [['Naziv', (r) => r.name], ['Interno', (r) => yesNo(r.internal)]],
    fields: (f, set) => <>
      <Text label="Naziv" value={f.name} onChange={(v) => set({ name: v })} />
      <Check label="Interno (vlastita tvrtka)" checked={f.internal} onChange={(v) => set({ internal: v })} />
    </>,
    row: (f) => {
      if (!f.name.trim()) throw new Error('Upišite naziv.')
      return { name: f.name.trim(), internal: f.internal, active: f.active }
    },
  },
  locations: {
    label: 'Lokacije', one: 'lokaciju', sort: 'name',
    blank: { name: '', kind: 'kamenolom', active: true },
    columns: [['Naziv', (r) => r.name], ['Vrsta', (r) => KIND_LABEL[r.kind]]],
    fields: (f, set) => <>
      <Text label="Naziv" value={f.name} onChange={(v) => set({ name: v })} />
      <Select label="Vrsta" value={f.kind} onChange={(v) => set({ kind: v ?? 'ostalo' })} options={Object.entries(KIND_LABEL)} placeholder="Ostalo" />
    </>,
    row: (f) => {
      if (!f.name.trim()) throw new Error('Upišite naziv.')
      return { name: f.name.trim(), kind: f.kind, active: f.active }
    },
  },
}

function ItemDialog({ table, item, onClose, onSaved }) {
  const cfg = TABLES[table]
  const L = useLists()
  const [run, busy] = useAction()
  const confirm = useConfirm()
  const [f, setF] = useState({ ...cfg.blank, ...item })
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const save = async () => {
    const ok = await run(async () => {
      const row = cfg.row(f)
      return item ? db.update(table, item.id, row) : db.create(table, row)
    }, 'Spremljeno.')
    if (ok) onSaved()
  }
  const remove = async () => {
    if (!(await confirm(`Trajno obrisati: ${cfg.one}? Stavka koja se koristi u unosima ne može se obrisati, nego samo deaktivirati.`))) return
    if (await run(() => db.remove(table, item.id), 'Obrisano.')) onSaved()
  }
  return (
    <Dialog open title={item ? `Uredi: ${cfg.one}` : `Dodaj: ${cfg.one}`} onClose={onClose} onSubmit={save}
      footer={<>
        {item && <button type="button" className="btn danger" onClick={remove} disabled={busy} aria-label="Obriši"><Icon name="trash" /></button>}
        <button type="submit" className="btn primary grow" disabled={busy}>Spremi</button>
      </>}>
      {cfg.fields(f, set, L)}
      <Check label="Aktivno (nudi se u izbornicima)" checked={f.active} onChange={(v) => set({ active: v })} />
    </Dialog>
  )
}

function UserDialog({ user, onClose, onSaved }) {
  const { me } = useAuth()
  const [run, busy] = useAction()
  const confirm = useConfirm()
  const [f, setF] = useState({ username: '', full_name: '', role: 'vozac', active: true, secret: '', ...user })
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const driver = f.role === 'vozac'
  const self = user?.id === me.id
  const secretLabel = driver ? 'PIN (6 do 12 znamenki)' : 'Lozinka (najmanje 8 znakova)'

  const save = async () => {
    const ok = await run(async () => {
      if (!f.full_name.trim()) throw new Error('Upišite ime i prezime.')
      if (!user) {
        await db.rpc('create_user', { p_username: f.username, p_full_name: f.full_name, p_role: f.role, p_secret: f.secret })
        return
      }
      const patch = { full_name: f.full_name.trim() }
      if (!self) Object.assign(patch, { role: f.role, active: f.active })
      await db.update('profiles', user.id, patch)
      if (f.secret) await db.rpc('set_user_secret', { p_user: user.id, p_secret: f.secret })
    }, user ? 'Korisnik je spremljen.' : 'Račun je otvoren.')
    if (ok) onSaved()
  }

  const remove = async () => {
    if (!(await confirm(`Trajno obrisati račun „${user.username}”? Korisnik s unosima ne može se obrisati, nego samo deaktivirati.`))) return
    if (await run(() => db.rpc('delete_user', { p_user: user.id }), 'Račun je obrisan.')) onSaved()
  }
  return (
    <Dialog open title={user ? 'Korisnik' : 'Novi korisnik'} onClose={onClose} onSubmit={save}
      footer={<>
        {user && !self && <button type="button" className="btn danger" onClick={remove} disabled={busy} aria-label="Obriši"><Icon name="trash" /></button>}
        <button type="submit" className="btn primary grow" disabled={busy}>Spremi</button>
      </>}>
      {user ? <p className="small muted">Korisničko ime: <strong>{user.username}</strong></p> : (
        <Text label="Korisničko ime" hint="mala slova i brojke, npr. marko" value={f.username} onChange={(v) => set({ username: v })}
          autoCapitalize="none" autoCorrect="off" spellCheck="false" />
      )}
      <Text label="Ime i prezime" value={f.full_name} onChange={(v) => set({ full_name: v })} />
      {!self && <Select label="Uloga" value={f.role} onChange={(v) => set({ role: v ?? 'vozac' })} options={[['vozac', 'Vozač ili strojar'], ['ured', 'Ured (vidi i uređuje sve)']]} placeholder="Vozač" />}
      <Text label={user ? `Novi ${secretLabel}` : secretLabel} hint={user ? 'ostavite prazno ako se ne mijenja' : undefined} value={f.secret}
        onChange={(v) => set({ secret: v })} inputMode={driver ? 'numeric' : undefined} autoComplete="off" />
      {user && !self && <Check label="Aktivan (može se prijaviti i unositi)" checked={f.active} onChange={(v) => set({ active: v })} />}
      {self && <Banner icon="lock">Vlastitu ulogu i status ne možete mijenjati, da se ne zaključate iz aplikacije.</Banner>}
    </Dialog>
  )
}

export default function Lists() {
  const L = useLists()
  const [table, setTable] = useState('vehicles')
  const [open, setOpen] = useState(null)
  const users = table === 'users'
  const cfg = TABLES[table]
  const rows = users
    ? [...L.lists.users].sort((a, b) => a.full_name.localeCompare(b.full_name, 'hr'))
    : [...L.lists[table]].sort((a, b) => String(a[cfg.sort]).localeCompare(String(b[cfg.sort]), 'hr'))
  const columns = users
    ? [['Ime i prezime', (r) => r.full_name], ['Korisničko ime', (r) => r.username], ['Uloga', (r) => (r.role === 'ured' ? 'Ured' : 'Vozač')]]
    : cfg.columns
  const saved = () => {
    setOpen(null)
    L.reload()
  }

  return (
    <>
      <h1>Popisi</h1>
      <Seg value={table} onChange={setTable} options={[...Object.entries(TABLES).map(([k, c]) => [k, c.label]), ['users', 'Korisnici']]} />
      <div className="card">
        <div className="row between">
          <h3>{users ? 'Korisnici' : cfg.label}</h3>
          <button type="button" className="btn primary small" onClick={() => setOpen({})}><Icon name="plus" size={18} /> Dodaj</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>{columns.map(([h, , cls]) => <th key={h} className={cls}>{h}</th>)}<th>Stanje</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={columns.length + 1} className="muted">Popis je prazan. Dodajte prvu stavku.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className={`clickable ${r.active ? '' : 'inactive'}`} tabIndex={0}
                  onClick={() => setOpen({ item: r })} onKeyDown={(e) => e.key === 'Enter' && setOpen({ item: r })}>
                  {columns.map(([h, get, cls]) => <td key={h} className={cls}>{get(r, L)}</td>)}
                  <td>{r.active ? '' : <span className="chip">Neaktivno</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && (users
        ? <UserDialog key={open.item?.id ?? 'new'} user={open.item} onClose={() => setOpen(null)} onSaved={saved} />
        : <ItemDialog key={open.item?.id ?? 'new'} table={table} item={open.item} onClose={() => setOpen(null)} onSaved={saved} />)}
    </>
  )
}
