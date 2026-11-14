import { useState } from 'react'
import { FuelFields, fuelFromForm, fuelToForm, useForm, validateFuel } from '../../components/forms'
import { Icon } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { localDate } from '../../lib/dates'
import { useMyDay } from '../../lib/myday'
import DayEntries from './DayEntries'
import { useSubmit } from './Today'
import { useVehicle } from './vehicle'

const STATION = 'kiperlog.station'

export default function Fuel() {
  const { me } = useAuth()
  const { vehicleId } = useVehicle()
  const day = useMyDay(localDate())
  const save = useSubmit()
  const blank = () => fuelToForm({ vehicle_id: vehicleId, station: localStorage.getItem(STATION) ?? '' })
  const { form, set, errors, check, reset } = useForm(blank(), validateFuel)
  const [busy, setBusy] = useState(false)

  const submitFuel = async (e) => {
    e.preventDefault()
    if (!check()) return
    setBusy(true)
    const id = crypto.randomUUID()
    const now = new Date()
    const row = { id, driver_id: me.id, fueled_at: now.toISOString(), work_date: localDate(now), ...fuelFromForm(form) }
    if (row.station) localStorage.setItem(STATION, row.station)
    await save({ id, kind: 'fuel', row }, 'Točenje')
    reset({ ...blank(), vehicle_id: form.vehicle_id })
    setBusy(false)
  }

  return (
    <>
      <h1>Gorivo</h1>
      <form className="card" onSubmit={submitFuel} noValidate>
        <FuelFields form={form} set={set} errors={errors} />
        <button type="submit" className="btn primary huge block" disabled={busy}><Icon name="check" /> Spremi točenje</button>
      </form>
      <DayEntries day={{ ...day, rides: [], machines: [] }} onlyExtras />
    </>
  )
}
