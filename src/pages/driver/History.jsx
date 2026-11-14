import { useState } from 'react'
import { Banner, Field } from '../../components/ui'
import { addDays, localDate } from '../../lib/dates'
import { useMyDay } from '../../lib/myday'
import DayEntries from './DayEntries'

export default function History() {
  const today = localDate()
  const [date, setDate] = useState(today)
  const day = useMyDay(date)
  return (
    <>
      <h1>Moji unosi</h1>
      <Field label="Datum">
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
      </Field>
      {date < addDays(today, -1) && (
        <Banner icon="lock">Starije unose može ispraviti samo ured. Javite uredu ako nešto nije točno.</Banner>
      )}
      <DayEntries key={date} day={day} />
    </>
  )
}
