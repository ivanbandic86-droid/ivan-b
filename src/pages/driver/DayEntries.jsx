import { useState } from 'react'
import {
  FuelFields, MachineFields, RideFields, fuelFromForm, fuelToForm, machineFromForm, machineToForm,
  rideFromForm, rideToForm, useForm, validateFuel, validateMachine, validateRide,
} from '../../components/forms'
import { Banner, Dialog, Icon, useAction, useConfirm } from '../../components/ui'
import { fmtTime } from '../../lib/dates'
import { db } from '../../lib/db'
import { useLists } from '../../lib/lists'
import { fmt, qtyLabel, tripsLabel } from '../../lib/num'
import { outbox } from '../../lib/sync'

const KINDS = {
  ride: { table: 'rides', title: 'Vožnja', Fields: RideFields, toForm: rideToForm, fromForm: rideFromForm, validate: validateRide },
  fuel: { table: 'fuel_entries', title: 'Točenje goriva', Fields: FuelFields, toForm: fuelToForm, fromForm: fuelFromForm, validate: validateFuel },
  machine: { table: 'machine_logs', title: 'Sati stroja', Fields: MachineFields, toForm: machineToForm, fromForm: machineFromForm, validate: validateMachine },
}

function Status({ row }) {
  if (row._error) return <span className="chip danger"><Icon name="alert" size={14} /> Odbijeno</span>
  if (row._outbox) return <span className="chip warn"><Icon name="clock" size={14} /> Čeka slanje</span>
  return null
}

// Ispravak ili brisanje jednog unosa. Unos koji još čeka slanje može se samo povući.
function EntryDialog({ kind, row, onClose, onChanged }) {
  const cfg = KINDS[kind]
  const { form, set, errors, check } = useForm(cfg.toForm(row), cfg.validate)
  const [run, busy] = useAction()
  const confirm = useConfirm()

  const save = async () => {
    if (!check()) return
    if (await run(() => db.update(cfg.table, row.id, cfg.fromForm(form)), 'Ispravak je spremljen.')) onChanged()
  }
  const remove = async () => {
    if (!(await confirm('Obrisati ovaj unos? Brisanje ostaje zapisano u tragu izmjena.'))) return
    if (await run(() => db.remove(cfg.table, row.id), 'Unos je obrisan.')) onChanged()
  }

  if (row._outbox) {
    return (
      <Dialog open title={cfg.title} onClose={onClose}
        footer={<>
          <button type="button" className="btn danger grow" onClick={async () => { await outbox.remove(row._outbox); onClose() }}>
            <Icon name="trash" /> Povuci unos
          </button>
          {row._error && (
            <button type="button" className="btn primary grow" onClick={async () => { await outbox.retry(row._outbox); onClose() }}>
              <Icon name="refresh" /> Pošalji ponovno
            </button>
          )}
        </>}>
        {row._error ? (
          <Banner kind="danger" icon="alert"><strong>Server je odbio unos.</strong><br />{row._error}</Banner>
        ) : (
          <Banner kind="warn" icon="clock">Unos je spremljen na mobitelu i poslat će se sam čim bude signala.</Banner>
        )}
      </Dialog>
    )
  }

  return (
    <Dialog open title={`Ispravi: ${cfg.title.toLowerCase()}`} onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn danger" onClick={remove} disabled={busy} aria-label="Obriši"><Icon name="trash" /></button>
        <button type="submit" className="btn primary grow" disabled={busy}>Spremi ispravak</button>
      </>}>
      <cfg.Fields form={form} set={set} errors={errors} withVehicle />
    </Dialog>
  )
}

// Popis vozačevih unosa za jedan dan.
export default function DayEntries({ day, onlyExtras }) {
  const L = useLists()
  const [open, setOpen] = useState(null)
  const { rides, fuel, machines } = day
  const loaded = rides.filter((r) => !r.is_empty)
  const m3 = loaded.reduce((s, r) => s + (Number(r.quantity_m3) || 0), 0)
  const t = loaded.reduce((s, r) => s + (Number(r.quantity_t) || 0), 0)
  const close = () => setOpen(null)

  return (
    <>
      {!onlyExtras && <div className="card">
        <div className="row between">
          <h3>Vožnje</h3>
          <span className="small muted num">
            {tripsLabel(loaded.length)}{qtyLabel(m3, t) && ` · ${qtyLabel(m3, t)}`}
          </span>
        </div>
        {rides.length === 0 ? <p className="muted small">Još nema vožnji.</p> : (
          <div className="list">
            {[...rides].reverse().map((r) => (
              <button key={r.id} type="button" className="item" onClick={() => setOpen({ kind: 'ride', row: r })}>
                <span className="time">{fmtTime(r.ride_at)}</span>
                <span className="grow">
                  <span className="title">{L.materialOf(r)}</span>
                  <span className="small muted"> · {L.siteOf(r)}</span>
                  <br />
                  <span className="small muted">
                    {[qtyLabel(r.quantity_m3, r.quantity_t), L.vehicleName(r.vehicle_id), r.delivery_note && `otpr. ${r.delivery_note}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Status row={r} />
              </button>
            ))}
          </div>
        )}
      </div>}

      {(fuel.length > 0 || machines.length > 0) && (
        <div className="card">
          {fuel.length > 0 && <h3>Gorivo</h3>}
          <div className="list">
            {fuel.map((f) => (
              <button key={f.id} type="button" className="item" onClick={() => setOpen({ kind: 'fuel', row: f })}>
                <span className="time">{fmtTime(f.fueled_at)}</span>
                <span className="grow">
                  <span className="title">{fmt(f.liters)} L</span>
                  <span className="small muted"> · {L.vehicleName(f.vehicle_id)}{f.full_tank ? ' · do vrha' : ''}</span>
                </span>
                <Status row={f} />
              </button>
            ))}
          </div>
          {machines.length > 0 && <h3>Sati strojeva</h3>}
          <div className="list">
            {machines.map((m) => (
              <button key={m.id} type="button" className="item" onClick={() => setOpen({ kind: 'machine', row: m })}>
                <span className="time">{fmt(m.hours, 1)} h</span>
                <span className="grow">
                  <span className="title">{L.vehicleName(m.vehicle_id)}</span>
                  <span className="small muted"> · {L.siteOf(m)}{m.activity ? ` · ${m.activity}` : ''}</span>
                </span>
                <Status row={m} />
              </button>
            ))}
          </div>
        </div>
      )}

      {open && <EntryDialog key={open.row.id} {...open} onClose={close} onChanged={() => { close(); day.reload() }} />}
    </>
  )
}
