import { useState } from 'react'
import { Field, Seg } from '../../components/ui'
import { addDays, localDate, monthStart } from '../../lib/dates'

const PRESETS = {
  danas: () => [localDate(), localDate()],
  tjedan: () => [addDays(localDate(), -6), localDate()],
  mjesec: () => [monthStart(), localDate()],
}

export function useRange(initial = 'mjesec') {
  const [preset, setPreset] = useState(initial)
  const [range, setRange] = useState(PRESETS[initial])
  return {
    from: range[0], to: range[1], preset,
    pick: (p) => (setPreset(p), setRange(PRESETS[p]())),
    set: (from, to) => (setPreset(null), setRange([from, to])),
  }
}

export function RangeBar({ range, children }) {
  const today = localDate()
  return (
    <div className="toolbar">
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <Seg value={range.preset} onChange={range.pick} options={[['danas', 'Danas'], ['tjedan', '7 dana'], ['mjesec', 'Ovaj mjesec']]} />
      </div>
      <Field label="Od">
        <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && range.set(e.target.value, range.to)} />
      </Field>
      <Field label="Do">
        <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && range.set(range.from, e.target.value)} />
      </Field>
      {children}
    </div>
  )
}
