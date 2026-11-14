import { useState } from 'react'
import {
  DayFields, RideFields, dayFromForm, dayToForm, rideFromForm, rideToForm, useForm, validateDay, validateRide,
} from '../../components/forms'
import { Banner, Dialog, Icon, Select, useToast } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { fmtDate, hoursBetween, localDate, localTime } from '../../lib/dates'
import { useLists } from '../../lib/lists'
import { useMyDay } from '../../lib/myday'
import { fmt, qtyLabel, tripsLabel } from '../../lib/num'
import { submit } from '../../lib/sync'
import DayEntries from './DayEntries'
import { useVehicle } from './vehicle'

// Poruka nakon spremanja govori što se stvarno dogodilo s unosom.
export function useSubmit() {
  const toast = useToast()
  return async (item, label) => {
    const result = await submit(item)
    if (result === 'sent') toast(`${label}: spremljeno.`)
    else if (result === 'queued') toast(`${label}: spremljeno na mobitel. Poslat će se kad bude signala.`, 'warn')
    else toast(`Server je odbio unos: ${result.failed}`, 'danger')
    return result
  }
}

function RideDialog({ initial, orderId, quick, onClose }) {
  const { me } = useAuth()
  const save = useSubmit()
  const { form, set, errors, check } = useForm(initial, validateRide)
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)

  const submitRide = async () => {
    if (!check()) return
    setBusy(true)
    const id = crypto.randomUUID()
    const now = new Date()
    const row = {
      id, driver_id: me.id, work_order_id: orderId ?? null,
      ride_at: now.toISOString(), work_date: localDate(now),
      ...rideFromForm(form),
      photo_path: photo ? `${me.id}/${id}.jpg` : null,
    }
    await save({ id, kind: 'ride', row, photo }, 'Vožnja')
    setBusy(false)
    onClose()
  }

  return (
    <Dialog open title={orderId ? 'Tura po nalogu' : quick ? 'Ponovi vožnju' : 'Nova vožnja'} onClose={onClose} onSubmit={submitRide}
      footer={<button type="submit" className="btn primary huge block" disabled={busy}><Icon name="check" /> Spremi vožnju</button>}>
      <RideFields form={form} set={set} errors={errors} photo={photo} setPhoto={setPhoto} withVehicle quick={quick} />
    </Dialog>
  )
}

function DayDialog({ log, vehicleId, onClose }) {
  const { me } = useAuth()
  const save = useSubmit()
  const date = localDate()
  // Novi dan počinje sada; započetom danu se nudi sadašnje vrijeme kao kraj.
  const start = dayToForm(log)
  if (!log) start.work_start = localTime()
  else if (!log.work_end) start.work_end = localTime()
  const { form, set, errors, check } = useForm(start, validateDay)

  const submitDay = async () => {
    if (!check()) return
    const row = { driver_id: me.id, vehicle_id: vehicleId, work_date: date, ...dayFromForm(form) }
    await save({ id: `day:${vehicleId}:${date}`, kind: 'day', row }, 'Radni dan')
    onClose()
  }

  return (
    <Dialog open title="Radni dan" onClose={onClose} onSubmit={submitDay}
      footer={<button type="submit" className="btn primary huge block"><Icon name="check" /> Spremi</button>}>
      <DayFields form={form} set={set} errors={errors} />
    </Dialog>
  )
}

function DayCard({ log, vehicleId }) {
  const [open, setOpen] = useState(false)
  const km = log?.start_km != null && log?.end_km != null ? log.end_km - log.start_km : null
  const hours = hoursBetween(log?.work_start, log?.work_end)
  const finished = log && (log.end_km != null || log.work_end)
  return (
    <div className="card">
      <div className="row between">
        <h3>Radni dan</h3>
        {log?._outbox && <span className="chip warn"><Icon name="clock" size={14} /> Čeka slanje</span>}
      </div>
      {log ? (
        <div className="row wrap small">
          <span><strong>{log.work_start?.slice(0, 5) ?? '–'}</strong>{log.work_end ? ` – ${log.work_end.slice(0, 5)}` : ''}{hours != null && ` (${fmt(hours, 1)} h)`}</span>
          <span className="muted">·</span>
          <span>{log.start_km != null ? `${fmt(log.start_km, 0)} km` : 'km nisu upisani'}{log.end_km != null && ` → ${fmt(log.end_km, 0)} km`}{km != null && ` (${fmt(km, 0)} km)`}</span>
        </div>
      ) : <p className="small muted">Upišite početne kilometre kad krenete.</p>}
      <button type="button" className={`btn block ${finished ? '' : 'dark'}`} onClick={() => setOpen(true)} disabled={!vehicleId}>
        {!log ? 'Počni dan' : finished ? 'Ispravi' : 'Završi dan'}
      </button>
      {open && <DayDialog log={log} vehicleId={vehicleId} onClose={() => setOpen(false)} />}
    </div>
  )
}

export default function Today() {
  const { me } = useAuth()
  const L = useLists()
  const date = localDate()
  const day = useMyDay(date)
  const { vehicleId, setVehicleId } = useVehicle()
  const [ride, setRide] = useState(null)
  const vehicle = L.vehicle(vehicleId)
  const log = day.days.find((d) => d.vehicle_id === vehicleId)
  const last = [...day.rides].reverse().find((r) => !r.is_empty)

  // Količina za novu turu: zadnja upisana za isti materijal, inače nosivost vozila.
  const quantity = (materialId) => {
    const prev = [...day.rides].reverse().find((r) => r.material_id === materialId && !r.is_empty)
    if (prev) return { m3: prev.quantity_m3 ?? '', t: prev.quantity_t ?? '' }
    const unit = L.material(materialId)?.unit
    return unit === 't' ? { m3: '', t: vehicle?.capacity_t ?? '' } : { m3: vehicle?.capacity_m3 ?? '', t: '' }
  }
  const fromOrder = (o) => setRide({
    orderId: o.id,
    quick: Boolean(o.material_id),
    initial: {
      ...rideToForm({
        vehicle_id: o.vehicle_id ?? vehicleId, site_id: o.site_id, material_id: o.material_id,
        load_location_id: o.load_location_id, unload_location_id: o.unload_location_id,
      }),
      ...quantity(o.material_id),
    },
  })
  const repeat = () => setRide({ quick: true, initial: rideToForm({ ...last, delivery_note: '', note: '', vehicle_id: vehicleId ?? last.vehicle_id }) })
  const blank = () => setRide({ initial: rideToForm({ vehicle_id: vehicleId }) })

  const truckOrders = day.orders.filter((o) => L.vehicle(o.vehicle_id)?.category !== 'stroj')
  const onMachine = day.orders.length > truckOrders.length ||
    L.lists.vehicles.some((v) => v.category === 'stroj' && v.default_driver_id === me.id)

  return (
    <>
      <div className="row between">
        <h1>Danas</h1>
        <span className="muted small">{fmtDate(date)}</span>
      </div>

      <Select label="Vozilo" value={vehicleId} onChange={setVehicleId} options={L.options.vehicles(vehicleId, 'vozilo')} placeholder="Odaberi vozilo…" />
      {!vehicleId && (onMachine
        ? <Banner icon="machine">Radite na stroju? Sate upisujete u kartici Stroj. Za vožnju kamionom odaberite vozilo.</Banner>
        : <Banner kind="warn" icon="alert">Odaberite vozilo kojim danas vozite.</Banner>)}

      {truckOrders.map((o) => {
        const done = day.rides.filter((r) => r.work_order_id === o.id).length
        const route = [L.locationName(o.load_location_id), L.locationName(o.unload_location_id) || L.siteName(o.site_id)].filter(Boolean).join(' → ')
        return (
          <div key={o.id} className="card order">
            <div className="row between">
              <h3>Radni nalog</h3>
              <span className="chip num">{o.planned_trips ? `${done} / ${o.planned_trips}` : tripsLabel(done)}</span>
            </div>
            <div>
              <div className="title" style={{ fontWeight: 800, fontSize: '1.1rem' }}>{o.material_id ? L.materialName(o.material_id) : 'Prijevoz'}</div>
              <div className="muted">{L.siteName(o.site_id)}{route && ` · ${route}`}</div>
              {o.note && <div className="small muted">{o.note}</div>}
            </div>
            {o.planned_trips && <div className="progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (done / o.planned_trips) * 100)}%` }} /></div>}
            <button type="button" className="btn primary huge block" onClick={() => fromOrder(o)}><Icon name="plus" /> Tura</button>
          </div>
        )
      })}

      <div className="card">
        <h3>Vožnja bez naloga</h3>
        {last && (
          <button type="button" className="btn dark block" onClick={repeat} style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
            <Icon name="refresh" />
            <span className="grow">Ponovi zadnju<br /><span className="small" style={{ fontWeight: 500, opacity: 0.8 }}>
              {L.materialOf(last)} · {L.siteOf(last)} · {qtyLabel(last.quantity_m3, last.quantity_t)}
            </span></span>
          </button>
        )}
        <button type="button" className={`btn block ${truckOrders.length || last ? '' : 'primary huge'}`} onClick={blank}><Icon name="plus" /> Nova vožnja</button>
      </div>

      <DayCard log={log} vehicleId={vehicleId} />
      <DayEntries day={day} />

      {ride && <RideDialog {...ride} onClose={() => setRide(null)} />}
    </>
  )
}
