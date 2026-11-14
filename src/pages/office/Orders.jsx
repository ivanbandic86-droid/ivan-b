import { useState } from 'react'
import { Banner, Dialog, Field, Icon, Num, Select, Text, useAction, useConfirm, useLoad } from '../../components/ui'
import { addDays, fmtDate, localDate } from '../../lib/dates'
import { db } from '../../lib/db'
import { useLists } from '../../lib/lists'
import { fmt, parseNum } from '../../lib/num'

const STATUS = [['otvoren', 'Otvoren'], ['zavrsen', 'Završen'], ['otkazan', 'Otkazan']]
const COPY = ['driver_id', 'vehicle_id', 'site_id', 'material_id', 'load_location_id', 'unload_location_id', 'planned_trips', 'note']

function OrderDialog({ order, date, onClose, onChanged }) {
  const L = useLists()
  const confirm = useConfirm()
  const [run, busy] = useAction()
  const [f, setF] = useState({
    driver_id: null, vehicle_id: null, site_id: null, material_id: null, load_location_id: null, unload_location_id: null,
    note: '', status: 'otvoren', ...order, planned_trips: order?.planned_trips ?? '',
  })
  const [error, setError] = useState('')
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const machine = L.vehicle(f.vehicle_id)?.category === 'stroj'

  // Odabir vozila predlaže vozača kojem je vozilo dodijeljeno.
  const pickVehicle = (id) => set({ vehicle_id: id, driver_id: f.driver_id ?? L.vehicle(id)?.default_driver_id ?? null })

  const save = async () => {
    const trips = parseNum(f.planned_trips)
    if (!f.driver_id || !f.site_id) return setError('Odaberite vozača i gradilište.')
    if (Number.isNaN(trips) || (trips !== null && (trips <= 0 || !Number.isInteger(trips)))) return setError('Planirani broj tura mora biti cijeli broj veći od 0.')
    setError('')
    const row = {
      work_date: date, driver_id: f.driver_id, vehicle_id: f.vehicle_id, site_id: f.site_id,
      material_id: machine ? null : f.material_id, load_location_id: machine ? null : f.load_location_id,
      unload_location_id: machine ? null : f.unload_location_id, planned_trips: machine ? null : trips,
      note: f.note?.trim() || null, status: f.status,
    }
    const ok = await run(() => (order ? db.update('work_orders', order.id, row) : db.create('work_orders', row)), 'Nalog je spremljen.')
    if (ok) onChanged()
  }
  const remove = async () => {
    if (!(await confirm('Obrisati nalog? Vožnje upisane po njemu ostaju.'))) return
    if (await run(() => db.remove('work_orders', order.id), 'Nalog je obrisan.')) onChanged()
  }

  return (
    <Dialog open title={order ? 'Radni nalog' : 'Novi radni nalog'} onClose={onClose} onSubmit={save}
      footer={<>
        {order && <button type="button" className="btn danger" onClick={remove} disabled={busy} aria-label="Obriši"><Icon name="trash" /></button>}
        <button type="submit" className="btn primary grow" disabled={busy}>Spremi nalog</button>
      </>}>
      <p className="small muted">Za {fmtDate(date)}</p>
      <Select label="Vozilo ili stroj" value={f.vehicle_id} onChange={pickVehicle} options={L.options.vehicles(f.vehicle_id)} placeholder="Vozač bira sam" />
      <Select label="Vozač ili strojar" value={f.driver_id} onChange={(v) => set({ driver_id: v })}
        options={L.lists.users.filter((u) => u.active || u.id === f.driver_id).map((u) => [u.id, u.full_name])} />
      <Select label="Gradilište" value={f.site_id} onChange={(v) => set({ site_id: v })} options={L.options.sites(f.site_id)} />
      {!machine && (
        <>
          <Select label="Materijal" value={f.material_id} onChange={(v) => set({ material_id: v })} options={L.options.materials(f.material_id)} placeholder="Nije zadan" />
          <div className="grid2">
            <Select label="Utovar" value={f.load_location_id} onChange={(v) => set({ load_location_id: v })} options={L.options.locations(f.load_location_id)} placeholder="Nije zadan" />
            <Select label="Istovar" value={f.unload_location_id} onChange={(v) => set({ unload_location_id: v })} options={L.options.locations(f.unload_location_id)} placeholder="Na gradilištu" />
          </div>
          <Num label="Planirani broj tura" hint="neobavezno" value={f.planned_trips} onChange={(v) => set({ planned_trips: v })} inputMode="numeric" />
        </>
      )}
      <Text label={machine ? 'Opis rada' : 'Napomena vozaču'} value={f.note} onChange={(v) => set({ note: v })} multiline />
      {order && <Select label="Status" value={f.status} onChange={(v) => set({ status: v ?? 'otvoren' })} options={STATUS} placeholder="Otvoren" />}
      {error && <Banner kind="danger" icon="alert">{error}</Banner>}
    </Dialog>
  )
}

export default function Orders() {
  const L = useLists()
  const [date, setDate] = useState(localDate())
  const [open, setOpen] = useState(null)
  const [run, busy] = useAction()
  const day = { eq: { work_date: date } }
  const { data, error, reload } = useLoad(async () => {
    const [orders, rides, hours] = await Promise.all([
      db.select('work_orders', { ...day, order: [['created_at']] }),
      db.select('rides', day),
      db.select('machine_logs', day),
    ])
    return { date, orders, rides, hours }
  }, [date])
  const orders = data?.date === date ? data.orders : []

  const done = (o) => {
    if (L.vehicle(o.vehicle_id)?.category === 'stroj') {
      const h = data.hours.filter((m) => m.work_order_id === o.id).reduce((s, m) => s + Number(m.hours), 0)
      return h ? `${fmt(h, 1)} h` : '–'
    }
    const n = data.rides.filter((r) => r.work_order_id === o.id).length
    return o.planned_trips ? `${n} / ${o.planned_trips}` : String(n)
  }

  const copyPrevious = () => run(async () => {
    const previous = await db.select('work_orders', { eq: { work_date: addDays(date, -1) }, order: [['created_at']] })
    const usable = previous.filter((o) => o.status !== 'otkazan')
    if (!usable.length) throw new Error('Za prethodni dan nema naloga.')
    for (const o of usable) {
      await db.create('work_orders', { work_date: date, status: 'otvoren', ...Object.fromEntries(COPY.map((k) => [k, o[k]])) })
    }
    await reload()
  }, 'Nalozi su kopirani.')

  return (
    <>
      <h1>Radni nalozi</h1>
      <div className="toolbar">
        <Field label="Datum"><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></Field>
        <button type="button" className="btn" onClick={copyPrevious} disabled={busy}><Icon name="refresh" /> Kopiraj jučerašnje</button>
        <button type="button" className="btn primary" onClick={() => setOpen({})}><Icon name="plus" /> Novi nalog</button>
      </div>
      {error && <Banner kind="danger" icon="alert">{error}</Banner>}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Vozač</th><th>Vozilo</th><th>Gradilište</th><th>Materijal</th><th>Relacija</th><th className="r">Izvršeno</th><th>Status</th></tr></thead>
            <tbody>
              {data && orders.length === 0 && <tr><td colSpan="7" className="muted">Za ovaj dan još nema naloga. Vozači tada upisuju vožnje sami.</td></tr>}
              {orders.map((o) => (
                <tr key={o.id} className={`clickable ${o.status === 'otkazan' ? 'inactive' : ''}`} tabIndex={0}
                  onClick={() => setOpen({ order: o })} onKeyDown={(e) => e.key === 'Enter' && setOpen({ order: o })}>
                  <td>{L.userName(o.driver_id)}</td>
                  <td>{o.vehicle_id ? L.vehicleName(o.vehicle_id) : '–'}</td>
                  <td>{L.siteName(o.site_id)}</td>
                  <td className="wrap">{o.material_id ? L.materialName(o.material_id) : o.note ?? '–'}</td>
                  <td>{[L.locationName(o.load_location_id), L.locationName(o.unload_location_id)].filter(Boolean).join(' → ')}</td>
                  <td className="r">{done(o)}</td>
                  <td><span className={`chip ${o.status === 'zavrsen' ? 'ok' : ''}`}>{STATUS.find(([s]) => s === o.status)[1]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <OrderDialog key={open.order?.id ?? 'new'} order={open.order} date={date} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); reload() }} />}
    </>
  )
}
