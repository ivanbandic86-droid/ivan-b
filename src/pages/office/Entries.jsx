import { useState } from 'react'
import {
  DayFields, FuelFields, MachineFields, RideFields, dayFromForm, dayToForm, fuelFromForm, fuelToForm,
  machineFromForm, machineToForm, rideFromForm, rideToForm, useForm, validateDay, validateFuel, validateMachine, validateRide,
} from '../../components/forms'
import { Banner, Dialog, Icon, Seg, Select, useAction, useConfirm, useLoad, useToast } from '../../components/ui'
import { fmtDate, fmtTime, hoursBetween } from '../../lib/dates'
import { db } from '../../lib/db'
import { useLists } from '../../lib/lists'
import { fmt } from '../../lib/num'
import { RangeBar, useRange } from './range'

const KINDS = {
  rides: {
    label: 'Vožnje', title: 'Vožnja', order: [['ride_at', false]],
    Fields: RideFields, toForm: rideToForm, fromForm: rideFromForm, validate: validateRide,
    head: ['Datum', 'Vrijeme', 'Vozač', 'Vozilo', 'Gradilište', 'Materijal', ['m³', 'r'], ['t', 'r'], 'Relacija', 'Otpremnica', ''],
    cells: (r, L) => [
      fmtDate(r.work_date), fmtTime(r.ride_at), L.userName(r.driver_id), L.vehicleName(r.vehicle_id), L.siteName(r.site_id),
      r.is_empty ? 'Bez tereta' : L.materialName(r.material_id), [r.quantity_m3 != null ? fmt(r.quantity_m3) : '–', 'r'],
      [r.quantity_t != null ? fmt(r.quantity_t) : '–', 'r'],
      [L.locationName(r.load_location_id), L.locationName(r.unload_location_id)].filter(Boolean).join(' → '),
      r.delivery_note ?? '', r.photo_path ? <Icon name="camera" size={18} /> : '',
    ],
  },
  fuel_entries: {
    label: 'Gorivo', title: 'Točenje goriva', order: [['fueled_at', false]],
    Fields: FuelFields, toForm: fuelToForm, fromForm: fuelFromForm, validate: validateFuel,
    head: ['Datum', 'Vrijeme', 'Vozač', 'Vozilo', ['Litara', 'r'], ['Brojilo', 'r'], 'Do vrha', ['€/L', 'r'], 'Mjesto'],
    cells: (r, L) => [
      fmtDate(r.work_date), fmtTime(r.fueled_at), L.userName(r.driver_id), L.vehicleName(r.vehicle_id), [fmt(r.liters), 'r'],
      [r.meter != null ? fmt(r.meter, 0) : '–', 'r'], r.full_tank ? 'Da' : 'Ne', [r.price_per_l != null ? fmt(r.price_per_l, 3) : '–', 'r'], r.station ?? '',
    ],
  },
  machine_logs: {
    label: 'Strojevi', title: 'Sati stroja', order: [['work_date', false]],
    Fields: MachineFields, toForm: machineToForm, fromForm: machineFromForm, validate: validateMachine,
    head: ['Datum', 'Strojar', 'Stroj', 'Gradilište', ['Sati', 'r'], 'Opis rada'],
    cells: (r, L) => [fmtDate(r.work_date), L.userName(r.driver_id), L.vehicleName(r.vehicle_id), L.siteName(r.site_id), [fmt(r.hours, 1), 'r'], r.activity ?? ''],
  },
  day_logs: {
    label: 'Radni dani', title: 'Radni dan', order: [['work_date', false]],
    Fields: DayFields, toForm: dayToForm, fromForm: dayFromForm, validate: validateDay,
    head: ['Datum', 'Vozač', 'Vozilo', ['Početni km', 'r'], ['Završni km', 'r'], ['Prijeđeno', 'r'], 'Rad', ['Sati', 'r']],
    cells: (r, L) => {
      const hours = hoursBetween(r.work_start, r.work_end)
      return [
        fmtDate(r.work_date), L.userName(r.driver_id), L.vehicleName(r.vehicle_id),
        [r.start_km != null ? fmt(r.start_km, 0) : '–', 'r'], [r.end_km != null ? fmt(r.end_km, 0) : '–', 'r'],
        [r.start_km != null && r.end_km != null ? fmt(r.end_km - r.start_km, 0) : '–', 'r'],
        [r.work_start?.slice(0, 5), r.work_end?.slice(0, 5)].filter(Boolean).join(' – '), [hours != null ? fmt(hours, 1) : '–', 'r'],
      ]
    },
  },
}

function EditDialog({ kind, row, locked, onClose, onChanged }) {
  const cfg = KINDS[kind]
  const L = useLists()
  const toast = useToast()
  const confirm = useConfirm()
  const [run, busy] = useAction()
  const { form, set, errors, check } = useForm(cfg.toForm(row), cfg.validate)
  const [photo, setPhoto] = useState(null)

  const save = async () => {
    if (!check()) return
    if (await run(() => db.update(kind, row.id, cfg.fromForm(form)), 'Ispravak je spremljen.')) onChanged()
  }
  const remove = async () => {
    if (!(await confirm('Obrisati ovaj unos? Brisanje ostaje zapisano u tragu izmjena.'))) return
    if (await run(() => db.remove(kind, row.id), 'Unos je obrisan.')) onChanged()
  }
  const showPhoto = async () => {
    try {
      setPhoto(await db.signedUrl(row.photo_path))
    } catch (e) {
      toast(e.message, 'danger')
    }
  }

  return (
    <Dialog open title={cfg.title} onClose={onClose} onSubmit={locked ? undefined : save}
      footer={locked ? <button type="button" className="btn block" onClick={onClose}>Zatvori</button> : <>
        <button type="button" className="btn danger" onClick={remove} disabled={busy} aria-label="Obriši"><Icon name="trash" /></button>
        <button type="submit" className="btn primary grow" disabled={busy}>Spremi ispravak</button>
      </>}>
      <p className="small muted">{L.userName(row.driver_id)} · {fmtDate(row.work_date)}</p>
      {locked && <Banner kind="warn" icon="lock">Razdoblje je zaključano. Za ispravak ga prvo otključajte u dijelu Zaključavanje.</Banner>}
      {row.photo_path && (photo
        ? <a href={photo} target="_blank" rel="noreferrer"><img className="photo-thumb" src={photo} alt="Otpremnica" /></a>
        : <button type="button" className="btn" onClick={showPhoto}><Icon name="camera" /> Prikaži fotografiju otpremnice</button>)}
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
        <cfg.Fields form={form} set={set} errors={errors} withVehicle />
      </fieldset>
    </Dialog>
  )
}

export default function Entries() {
  const L = useLists()
  const range = useRange('tjedan')
  const [kind, setKind] = useState('rides')
  const [driver, setDriver] = useState(null)
  const [open, setOpen] = useState(null)
  const cfg = KINDS[kind]
  const { data, error, loading, reload } = useLoad(async () => {
    const [rows, settings] = await Promise.all([
      db.select(kind, { gte: { work_date: range.from }, lte: { work_date: range.to }, order: cfg.order }),
      db.select('app_settings'),
    ])
    return { kind, rows, lockedUntil: settings[0]?.locked_until ?? null }
  }, [kind, range.from, range.to])

  const current = data?.kind === kind ? data : null
  const rows = (current?.rows ?? []).filter((r) => !driver || r.driver_id === driver)
  const isLocked = (r) => Boolean(current?.lockedUntil && r.work_date <= current.lockedUntil)

  return (
    <>
      <h1>Unosi</h1>
      <Seg value={kind} onChange={setKind} options={Object.entries(KINDS).map(([k, c]) => [k, c.label])} />
      <RangeBar range={range}>
        <Select label="Vozač" value={driver} onChange={setDriver} options={L.options.drivers(driver)} placeholder="Svi" />
      </RangeBar>
      {error && <Banner kind="danger" icon="alert">{error}</Banner>}
      <div className="card">
        <div className="row between">
          <h3>{cfg.label}</h3>
          <span className="small muted">{loading ? 'Učitavanje…' : `${rows.length} unosa · kliknite redak za ispravak`}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{cfg.head.map((h, i) => <th key={i} className={Array.isArray(h) ? h[1] : undefined}>{Array.isArray(h) ? h[0] : h}</th>)}<th></th></tr>
            </thead>
            <tbody>
              {current && rows.length === 0 && <tr><td colSpan={cfg.head.length + 1} className="muted">Nema unosa u odabranom razdoblju.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="clickable" tabIndex={0} onClick={() => setOpen(r)} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
                  {cfg.cells(r, L).map((c, i) => <td key={i} className={Array.isArray(c) ? c[1] : undefined}>{Array.isArray(c) ? c[0] : c}</td>)}
                  <td>{isLocked(r) && <span className="chip"><Icon name="lock" size={14} /> Zaključano</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <EditDialog key={open.id} kind={kind} row={open} locked={isLocked(open)} onClose={() => setOpen(null)}
          onChanged={() => { setOpen(null); reload() }} />
      )}
    </>
  )
}
