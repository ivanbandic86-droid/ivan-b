import { useState } from 'react'
import { Banner, Dialog, Icon, Seg, Select, Text, useAction, useLoad } from '../../components/ui'
import { db } from '../../lib/db'
import { useLists } from '../../lib/lists'
import { fmtDate } from '../../lib/dates'

const norm = (t) => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const NEW = '__new'

// Stavke koje su vozači upisali pod "Ostalo", grupirane po upisanom tekstu: ured ih jednim
// klikom dodijeli stavci s popisa ili doda u popis i dodijeli svim unosima odjednom.
function group(rows, table, keyOf) {
  const map = new Map()
  for (const r of rows) {
    const key = keyOf(r)
    const g = map.get(key) ?? { key, table, rows: [], names: new Set(), first: r }
    g.rows.push({ table, row: r })
    g.names.add(r.driver_id)
    map.set(key, g)
  }
  return [...map.values()]
}

function SiteDialog({ g, onClose, onDone }) {
  const L = useLists()
  const [run, busy] = useAction()
  const sample = g.first
  const clientMatch = L.lists.clients.find((c) => norm(c.name) === norm(sample.custom_client))
  const [mode, setMode] = useState('postojece')
  const [siteId, setSiteId] = useState(L.lists.sites.find((s) => norm(s.name) === norm(sample.custom_site))?.id ?? null)
  const [name, setName] = useState(String(sample.custom_site ?? '').trim())
  const [clientId, setClientId] = useState(clientMatch?.id ?? (sample.custom_client ? NEW : null))

  const save = async () => {
    const ok = await run(async () => {
      let target = siteId
      if (mode === 'novo') {
        if (!name.trim()) throw new Error('Upišite naziv gradilišta.')
        let client = clientId && clientId !== NEW ? clientId : null
        if (clientId === NEW) client = (await db.create('clients', { name: String(sample.custom_client).trim(), internal: false })).id
        target = (await db.create('sites', { name: name.trim(), client_id: client })).id
      }
      if (!target) throw new Error('Odaberite gradilište.')
      let locked = 0
      for (const { table, row } of g.rows) {
        try {
          await db.update(table, row.id, { site_id: target, custom_site: null, custom_client: null })
        } catch {
          locked += 1
        }
      }
      if (locked) throw new Error(`${locked} unosa nije promijenjeno jer su u zaključanom razdoblju.`)
      await L.reload()
    }, 'Gradilište je dodijeljeno.')
    if (ok) onDone()
  }

  return (
    <Dialog open title="Obradi gradilište" onClose={onClose} onSubmit={save}
      footer={<button type="submit" className="btn primary block" disabled={busy}>Dodijeli {g.rows.length} {g.rows.length === 1 ? 'unosu' : 'unosa'}</button>}>
      <Banner icon="list">
        Vozač je upisao: <strong>{sample.custom_site}</strong>{sample.custom_client && <> · naručitelj: <strong>{sample.custom_client}</strong></>}
      </Banner>
      <Seg value={mode} onChange={setMode} options={[['postojece', 'Postojeće gradilište'], ['novo', 'Dodaj novo']]} />
      {mode === 'postojece' ? (
        <Select label="Gradilište" value={siteId} onChange={setSiteId} options={L.options.sites(siteId)} />
      ) : (
        <>
          <Text label="Naziv novog gradilišta" value={name} onChange={setName} />
          <Select label="Naručitelj" value={clientId} onChange={setClientId} placeholder="Bez naručitelja"
            options={[...L.options.clients(clientId), ...(sample.custom_client && !clientMatch ? [[NEW, `Novi naručitelj: ${String(sample.custom_client).trim()}`]] : [])]} />
        </>
      )}
    </Dialog>
  )
}

function MaterialDialog({ g, onClose, onDone }) {
  const L = useLists()
  const [run, busy] = useAction()
  const sample = g.first
  const [mode, setMode] = useState('postojece')
  const [materialId, setMaterialId] = useState(L.lists.materials.find((m) => norm(m.name) === norm(sample.custom_material))?.id ?? null)
  const [name, setName] = useState(String(sample.custom_material ?? '').trim())
  const [unit, setUnit] = useState('m3')

  const save = async () => {
    const ok = await run(async () => {
      let target = materialId
      if (mode === 'novo') {
        if (!name.trim()) throw new Error('Upišite naziv materijala.')
        target = (await db.create('materials', { name: name.trim(), unit })).id
      }
      if (!target) throw new Error('Odaberite materijal.')
      let locked = 0
      for (const { table, row } of g.rows) {
        try {
          await db.update(table, row.id, { material_id: target, custom_material: null })
        } catch {
          locked += 1
        }
      }
      if (locked) throw new Error(`${locked} unosa nije promijenjeno jer su u zaključanom razdoblju.`)
      await L.reload()
    }, 'Materijal je dodijeljen.')
    if (ok) onDone()
  }

  return (
    <Dialog open title="Obradi materijal" onClose={onClose} onSubmit={save}
      footer={<button type="submit" className="btn primary block" disabled={busy}>Dodijeli {g.rows.length} {g.rows.length === 1 ? 'unosu' : 'unosa'}</button>}>
      <Banner icon="list">Vozač je upisao: <strong>{sample.custom_material}</strong></Banner>
      <Seg value={mode} onChange={setMode} options={[['postojece', 'Postojeći materijal'], ['novo', 'Dodaj novi']]} />
      {mode === 'postojece' ? (
        <Select label="Materijal" value={materialId} onChange={setMaterialId} options={L.options.materials(materialId)} />
      ) : (
        <>
          <Text label="Naziv novog materijala" value={name} onChange={setName} />
          <Select label="Glavna jedinica" value={unit} onChange={(v) => setUnit(v ?? 'm3')} options={[['m3', 'm³'], ['t', 't (tone)']]} placeholder="m³" />
        </>
      )}
    </Dialog>
  )
}

export default function Review() {
  const L = useLists()
  const [open, setOpen] = useState(null)
  const { data, error, loading, reload } = useLoad(async () => {
    const [rides, machines] = await Promise.all([
      db.select('rides', { eq: { needs_review: true }, order: [['work_date', false]] }),
      db.select('machine_logs', { eq: { needs_review: true }, order: [['work_date', false]] }),
    ])
    const sites = [
      ...group(rides.filter((r) => !r.site_id), 'rides', (r) => `${norm(r.custom_site)}|${norm(r.custom_client)}`),
      ...group(machines, 'machine_logs', (r) => `${norm(r.custom_site)}|${norm(r.custom_client)}`),
    ]
    // Isti upis iz vožnji i sati stroja spaja se u jednu skupinu.
    const merged = new Map()
    for (const g of sites) {
      const m = merged.get(g.key)
      if (m) { m.rows.push(...g.rows); g.names.forEach((n) => m.names.add(n)) } else merged.set(g.key, g)
    }
    const materials = group(rides.filter((r) => !r.material_id && !r.is_empty), 'rides', (r) => norm(r.custom_material))
    return { sites: [...merged.values()], materials }
  }, [])

  const done = () => { setOpen(null); reload() }
  const who = (g) => [...g.names].map((id) => L.userName(id)).join(', ')
  const dates = (g) => {
    const days = g.rows.map((x) => x.row.work_date).sort()
    return days[0] === days[days.length - 1] ? fmtDate(days[0]) : `${fmtDate(days[0])} – ${fmtDate(days[days.length - 1])}`
  }
  const empty = data && !data.sites.length && !data.materials.length

  return (
    <>
      <h1>Za obradu</h1>
      <p className="muted small">
        Ovdje su gradilišta, naručitelji i materijali koje su vozači upisali sami jer ih nisu našli u izborniku. Dodijelite ih
        stavci s popisa ili ih dodajte u popis. Promjena vrijedi za sve unose s istim upisom.
      </p>
      {error && <Banner kind="danger" icon="alert">{error}</Banner>}
      {loading && !data && <p className="center">Učitavanje…</p>}
      {empty && <Banner kind="ok" icon="check">Nema ničega za obradu.</Banner>}

      {data?.sites.length > 0 && (
        <div className="card">
          <h3>Gradilišta i naručitelji</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Upisano gradilište</th><th>Upisani naručitelj</th><th className="r">Unosa</th><th>Vozač</th><th>Kada</th><th></th></tr></thead>
              <tbody>
                {data.sites.map((g) => (
                  <tr key={g.key}>
                    <td>{g.first.custom_site}</td><td>{g.first.custom_client ?? '–'}</td><td className="r">{g.rows.length}</td>
                    <td className="wrap">{who(g)}</td><td>{dates(g)}</td>
                    <td><button type="button" className="btn small primary" onClick={() => setOpen({ kind: 'site', g })}>Obradi</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data?.materials.length > 0 && (
        <div className="card">
          <h3>Materijali</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Upisani materijal</th><th className="r">Unosa</th><th>Vozač</th><th>Kada</th><th></th></tr></thead>
              <tbody>
                {data.materials.map((g) => (
                  <tr key={g.key}>
                    <td>{g.first.custom_material}</td><td className="r">{g.rows.length}</td>
                    <td className="wrap">{who(g)}</td><td>{dates(g)}</td>
                    <td><button type="button" className="btn small primary" onClick={() => setOpen({ kind: 'material', g })}>Obradi</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="small muted"><Icon name="lock" size={14} /> Unosi u zaključanom razdoblju ne mogu se promijeniti dok ga ne otključate.</p>

      {open?.kind === 'site' && <SiteDialog key={open.g.key} g={open.g} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'material' && <MaterialDialog key={open.g.key} g={open.g} onClose={() => setOpen(null)} onDone={done} />}
    </>
  )
}
