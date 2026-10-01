import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const CONFIG = {
  vehicles: {
    title: 'Vozila',
    fields: [
      { key: 'plate', label: 'Registracija' },
      { key: 'kind', label: 'Vrsta', options: [['mjesalica', 'Mješalica'], ['kiper', 'Kiper']] },
    ],
  },
  materials: {
    title: 'Materijali',
    fields: [
      { key: 'name', label: 'Naziv' },
      { key: 'unit', label: 'Jedinica', options: [['m3', 'm³'], ['t', 't']] },
    ],
  },
  clients: { title: 'Naručitelji', fields: [{ key: 'name', label: 'Naziv' }] },
  sites: {
    title: 'Gradilišta',
    fields: [
      { key: 'name', label: 'Naziv' },
      { key: 'client_id', label: 'Naručitelj', ref: 'clients' },
    ],
  },
  profiles: {
    title: 'Korisnici',
    fields: [
      { key: 'full_name', label: 'Ime i prezime', editable: true },
      { key: 'role', label: 'Uloga', options: [['vozac', 'Vozač'], ['ured', 'Ured']] },
    ],
    noAdd: true,
  },
}

function Section({ table, refs }) {
  const cfg = CONFIG[table]
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState({})
  const [error, setError] = useState('')

  const load = () =>
    supabase.from(table).select('*').order(cfg.fields[0].key).then(({ data }) => setRows(data ?? []))
  useEffect(() => { load() }, [])

  const optionsFor = (f) =>
    f.options ?? (f.ref ? (refs[f.ref] ?? []).map((r) => [r.id, r.name]) : null)

  async function add(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from(table).insert(draft)
    if (error) return setError('Spremanje nije uspjelo (možda već postoji).')
    setDraft({})
    load()
  }
  const toggle = async (r) => {
    await supabase.from(table).update({ active: !r.active }).eq('id', r.id)
    load()
  }
  const update = async (r, key, value) => {
    await supabase.from(table).update({ [key]: value }).eq('id', r.id)
    load()
  }

  return (
    <section className="card">
      <h2>{cfg.title}</h2>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'inactive'}>
              {cfg.fields.map((f) => {
                const opts = optionsFor(f)
                return (
                  <td key={f.key}>
                    {opts ? (
                      <select value={r[f.key] ?? ''} onChange={(e) => update(r, f.key, e.target.value || null)}>
                        <option value=""></option>
                        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : f.editable ? (
                      <input
                        defaultValue={r[f.key]}
                        onBlur={(e) => e.target.value !== r[f.key] && update(r, f.key, e.target.value)}
                      />
                    ) : (
                      r[f.key]
                    )}
                  </td>
                )
              })}
              <td>
                <button className="link" onClick={() => toggle(r)}>
                  {r.active ? 'Deaktiviraj' : 'Aktiviraj'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!cfg.noAdd && (
        <form className="inline" onSubmit={add}>
          {cfg.fields.map((f) => {
            const opts = optionsFor(f)
            return opts ? (
              <select
                key={f.key}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value || null })}
                required={!f.ref}
              >
                <option value="">{f.label}…</option>
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <input
                key={f.key}
                placeholder={f.label}
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                required
              />
            )
          })}
          <button className="primary">Dodaj</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

export default function Lists() {
  const [clients, setClients] = useState([])
  useEffect(() => {
    supabase.from('clients').select('id,name').order('name').then(({ data }) => setClients(data ?? []))
  }, [])
  return (
    <>
      <p className="hint">
        Novi korisnici (vozači i ured) dodaju se u Supabaseu: Authentication → Add user. Zatim im
        ovdje možete promijeniti ime i ulogu.
      </p>
      {Object.keys(CONFIG).map((t) => <Section key={t} table={t} refs={{ clients }} />)}
    </>
  )
}
