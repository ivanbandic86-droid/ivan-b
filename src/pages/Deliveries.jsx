import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchDeliveries, unitLabel } from '../lib/queries'

const monthStart = () => new Date().toISOString().slice(0, 8) + '01'
const today = () => new Date().toISOString().slice(0, 10)

export default function Deliveries() {
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  const load = () =>
    fetchDeliveries(from, to).then(setRows).catch(() => setError('Greška pri učitavanju.'))
  useEffect(() => { load() }, [from, to])

  // Uživo: nove isporuke se pojave bez osvježavanja
  useEffect(() => {
    const ch = supabase
      .channel('deliveries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [from, to])

  async function remove(id) {
    if (!confirm('Obrisati ovu isporuku?')) return
    await supabase.from('deliveries').delete().eq('id', id)
    load()
  }

  return (
    <>
      <div className="filters">
        <label>Od <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Do <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Datum</th><th>Vozač</th><th>Vozilo</th><th>Materijal</th><th>Količina</th>
              <th>Naručitelj</th><th>Gradilište</th><th>Lokacija</th><th>Otpremnica</th>
              <th>Utovar</th><th>Istovar</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.delivery_date}</td>
                <td>{r.driver?.full_name}</td>
                <td>{r.vehicle?.plate}</td>
                <td>{r.material?.name}</td>
                <td>{r.quantity} {unitLabel(r.material?.unit)}</td>
                <td>{r.client?.name}</td>
                <td>{r.site?.name}</td>
                <td>{r.location}</td>
                <td>{r.delivery_note}</td>
                <td>{r.loaded_at?.slice(0, 5)}</td>
                <td>{r.unloaded_at?.slice(0, 5)}</td>
                <td><button className="link" onClick={() => remove(r.id)}>Obriši</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="12">Nema isporuka u odabranom razdoblju.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
