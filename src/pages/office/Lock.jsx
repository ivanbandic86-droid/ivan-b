import { useState } from 'react'
import { Banner, Field, Icon, useAction, useConfirm, useLoad } from '../../components/ui'
import { addDays, fmtDate, fmtDateTime, localDate, monthStart } from '../../lib/dates'
import { db } from '../../lib/db'
import { useLists } from '../../lib/lists'
import { fmt } from '../../lib/num'

const TABLE_LABEL = { rides: 'Vožnja', fuel_entries: 'Gorivo', day_logs: 'Radni dan', machine_logs: 'Sati stroja' }
const FIELD_LABEL = {
  quantity_m3: 'm³', quantity_t: 't', liters: 'litara', meter: 'brojilo', price_per_l: '€/L', full_tank: 'do vrha',
  start_km: 'početni km', end_km: 'završni km', work_start: 'početak', work_end: 'kraj', hours: 'sati',
  delivery_note: 'otpremnica', recipient: 'primatelj', note: 'napomena', activity: 'opis rada', station: 'mjesto',
  is_empty: 'bez tereta', work_date: 'datum',
}
const REF = { vehicle_id: ['vozilo', 'vehicleName'], site_id: ['gradilište', 'siteName'], material_id: ['materijal', 'materialName'],
  load_location_id: ['utovar', 'locationName'], unload_location_id: ['istovar', 'locationName'], driver_id: ['vozač', 'userName'] }

// Što se promijenilo, čitljivo: "m³: 12 → 13".
function describe(entry, L) {
  if (entry.action === 'delete') return 'Unos je obrisan.'
  const show = (key, v) => {
    if (v === null || v === undefined || v === '') return '–'
    if (REF[key]) return L[REF[key][1]](v) || '–'
    if (typeof v === 'boolean') return v ? 'da' : 'ne'
    if (key === 'work_date') return fmtDate(v)
    return typeof v === 'number' || /^\d+(\.\d+)?$/.test(v) ? fmt(v) : String(v)
  }
  return Object.keys(entry.new_row ?? {})
    .filter((k) => !['updated_at', 'created_at'].includes(k) && JSON.stringify(entry.old_row[k]) !== JSON.stringify(entry.new_row[k]))
    .map((k) => `${REF[k]?.[0] ?? FIELD_LABEL[k] ?? k}: ${show(k, entry.old_row[k])} → ${show(k, entry.new_row[k])}`)
    .join(', ') || 'Bez promjene vrijednosti.'
}

export default function Lock() {
  const L = useLists()
  const confirm = useConfirm()
  const [run, busy] = useAction()
  const lastMonthEnd = addDays(monthStart(), -1)
  const [date, setDate] = useState(lastMonthEnd)
  const { data, error, reload } = useLoad(async () => {
    const since = new Date(Date.now() - 60 * 86400000).toISOString()
    const [settings, audit] = await Promise.all([
      db.select('app_settings'),
      db.select('audit_log', { gte: { at: since }, order: [['at', false]] }),
    ])
    return { lockedUntil: settings[0]?.locked_until ?? null, audit: audit.slice(0, 300) }
  }, [])

  const setLock = async (value, question, done) => {
    if (!(await confirm(question, value ? 'Zaključaj' : 'Otključaj'))) return
    if (await run(() => db.update('app_settings', true, { locked_until: value }), done)) reload()
  }

  return (
    <>
      <h1>Zaključavanje</h1>
      {error && <Banner kind="danger" icon="alert">{error}</Banner>}
      <div className="card">
        <h3>Zaključano razdoblje</h3>
        {data && (data.lockedUntil
          ? <Banner kind="ok" icon="lock">Zaključani su svi unosi do <strong>{fmtDate(data.lockedUntil)}</strong> (uključivo). Ne mogu ih mijenjati ni vozači ni ured.</Banner>
          : <Banner icon="lock">Trenutno ništa nije zaključano.</Banner>)}
        <p className="small muted">
          Kad pregledate dan ili mjesec i predate podatke u obračun, zaključajte ga. Vozači i inače ispravljaju samo današnje i
          jučerašnje unose; zaključavanje sprečava i naknadne izmjene iz ureda.
        </p>
        <div className="toolbar">
          <Field label="Zaključaj sve do datuma">
            <input type="date" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <button type="button" className="btn primary" disabled={busy}
            onClick={() => setLock(date, `Zaključati sve unose do ${fmtDate(date)}?`, 'Razdoblje je zaključano.')}>
            <Icon name="lock" /> Zaključaj
          </button>
          {data?.lockedUntil && (
            <button type="button" className="btn" disabled={busy}
              onClick={() => setLock(null, 'Otključati sve? Unosi će se opet moći mijenjati.', 'Razdoblje je otključano.')}>
              Otključaj sve
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3>Trag izmjena</h3>
          <span className="small muted">zadnjih 60 dana</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Kada</th><th>Tko</th><th>Unos</th><th>Datum unosa</th><th>Promjena</th></tr></thead>
            <tbody>
              {data && data.audit.length === 0 && <tr><td colSpan="5" className="muted">Nema izmjena ni brisanja.</td></tr>}
              {data?.audit.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.at)}</td>
                  <td>{a.actor ? L.userName(a.actor) : 'sustav'}</td>
                  <td>{TABLE_LABEL[a.table_name] ?? a.table_name} · {L.userName(a.old_row.driver_id)}</td>
                  <td>{fmtDate(a.old_row.work_date)}</td>
                  <td className="wrap">{a.action === 'delete' ? <span className="chip danger">Obrisano</span> : describe(a, L)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
