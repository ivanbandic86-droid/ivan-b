import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/useAuth'
import { useLists } from '../lib/useLists'
import { enqueue, flushQueue, getQueue } from '../lib/offlineQueue'

const today = () => new Date().toISOString().slice(0, 10)
const empty = () => ({
  vehicle_id: '', material_id: '', client_id: '', site_id: '',
  delivery_date: today(), quantity: '', location: '',
  delivery_note: '', loaded_at: '', unloaded_at: '',
})

export default function DriverEntry() {
  const { session } = useAuth()
  const lists = useLists()
  const [form, setForm] = useState(empty)
  const [pending, setPending] = useState(0)
  const [message, setMessage] = useState('')

  const sync = useCallback(async () => {
    if (!navigator.onLine) return
    await flushQueue()
    setPending((await getQueue()).length)
  }, [])

  useEffect(() => {
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [sync])

  if (!lists) return <p className="center">Učitavanje…</p>

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const material = lists.materials.find((m) => m.id === form.material_id)
  const sites = lists.sites.filter((s) => !form.client_id || s.client_id === form.client_id)

  async function submit(e) {
    e.preventDefault()
    const record = {
      id: crypto.randomUUID(),
      driver_id: session.user.id,
      ...form,
      quantity: Number(String(form.quantity).replace(',', '.')),
      delivery_note: form.delivery_note || null,
      loaded_at: form.loaded_at || null,
      unloaded_at: form.unloaded_at || null,
    }
    await enqueue(record)
    // Vozilo, naručitelj, gradilište i lokacija se često ponavljaju pa ostaju upisani
    setForm({
      ...empty(),
      vehicle_id: form.vehicle_id,
      client_id: form.client_id,
      site_id: form.site_id,
      location: form.location,
    })
    setMessage(navigator.onLine ? 'Spremljeno.' : 'Spremljeno na mobitel, poslat će se kad bude interneta.')
    await sync()
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>Nova isporuka</h1>
      {pending > 0 && <p className="warn">Čeka slanje: {pending}</p>}
      {message && <p className="ok">{message}</p>}

      <label>Vozilo
        <select value={form.vehicle_id} onChange={set('vehicle_id')} required>
          <option value="">Odaberi…</option>
          {lists.vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} ({v.kind})</option>)}
        </select>
      </label>
      <label>Datum
        <input type="date" value={form.delivery_date} onChange={set('delivery_date')} required />
      </label>
      <label>Materijal
        <select value={form.material_id} onChange={set('material_id')} required>
          <option value="">Odaberi…</option>
          {lists.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <label>Količina {material && `(${material.unit === 'm3' ? 'm³' : 't'})`}
        <input inputMode="decimal" value={form.quantity} onChange={set('quantity')} required />
      </label>
      <label>Naručitelj
        <select
          value={form.client_id}
          onChange={(e) => setForm({ ...form, client_id: e.target.value, site_id: '' })}
          required
        >
          <option value="">Odaberi…</option>
          {lists.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Gradilište
        <select value={form.site_id} onChange={set('site_id')} required>
          <option value="">Odaberi…</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Lokacija
        <input value={form.location} onChange={set('location')} required />
      </label>

      <details>
        <summary>Dodatno (neobavezno)</summary>
        <label>Broj otpremnice
          <input value={form.delivery_note} onChange={set('delivery_note')} />
        </label>
        <label>Vrijeme utovara
          <input type="time" value={form.loaded_at} onChange={set('loaded_at')} />
        </label>
        <label>Vrijeme istovara
          <input type="time" value={form.unloaded_at} onChange={set('unloaded_at')} />
        </label>
      </details>

      <button className="primary">Spremi isporuku</button>
    </form>
  )
}
