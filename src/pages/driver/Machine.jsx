import { useState } from 'react'
import { MachineFields, machineFromForm, machineToForm, useForm, validateMachine } from '../../components/forms'
import { Icon } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { localDate } from '../../lib/dates'
import { useLists } from '../../lib/lists'
import { useMyDay } from '../../lib/myday'
import DayEntries from './DayEntries'
import { useSubmit } from './Today'

const MACHINE = 'kiperlog.machine'

export default function Machine() {
  const { me } = useAuth()
  const L = useLists()
  const day = useMyDay(localDate())
  const save = useSubmit()
  const orders = day.orders.filter((o) => L.vehicle(o.vehicle_id)?.category === 'stroj')
  const assigned = L.lists.vehicles.find((v) => v.default_driver_id === me.id && v.active && v.category === 'stroj')?.id
  const blank = () => machineToForm({ vehicle_id: localStorage.getItem(MACHINE) ?? assigned ?? null })
  const { form, set, errors, check, reset } = useForm(blank(), validateMachine)
  const [orderId, setOrderId] = useState(null)
  const [busy, setBusy] = useState(false)

  const applyOrder = (o) => {
    setOrderId(o.id)
    set({ vehicle_id: o.vehicle_id, site_id: o.site_id, activity: o.note ?? '' })
  }

  const submitHours = async (e) => {
    e.preventDefault()
    if (!check()) return
    setBusy(true)
    const id = crypto.randomUUID()
    const row = { id, driver_id: me.id, work_order_id: orderId, work_date: localDate(), ...machineFromForm(form) }
    localStorage.setItem(MACHINE, row.vehicle_id)
    await save({ id, kind: 'machine', row }, 'Sati stroja')
    setOrderId(null)
    reset({ ...blank(), vehicle_id: form.vehicle_id, site_id: form.site_id })
    setBusy(false)
  }

  return (
    <>
      <h1>Stroj</h1>
      {orders.map((o) => (
        <div key={o.id} className="card order">
          <h3>Radni nalog</h3>
          <div>
            <strong>{L.vehicleName(o.vehicle_id)}</strong> · {L.siteName(o.site_id)}
            {o.note && <div className="small muted">{o.note}</div>}
          </div>
          <button type="button" className="btn dark block" onClick={() => applyOrder(o)}>Upiši sate za ovaj nalog</button>
        </div>
      ))}
      <form className="card" onSubmit={submitHours} noValidate>
        <MachineFields form={form} set={set} errors={errors} />
        <button type="submit" className="btn primary huge block" disabled={busy}><Icon name="check" /> Spremi sate</button>
      </form>
      <DayEntries day={{ ...day, rides: [], fuel: [] }} onlyExtras />
    </>
  )
}
