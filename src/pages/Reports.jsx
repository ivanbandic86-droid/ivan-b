import { useState } from 'react'
import { fetchDeliveries, unitLabel } from '../lib/queries'

const monthStart = () => new Date().toISOString().slice(0, 8) + '01'
const today = () => new Date().toISOString().slice(0, 10)

// m³ i t se ne smiju zbrajati zajedno, pa je jedinica dio ključa grupiranja
function summarize(rows, keyCols) {
  const map = new Map()
  for (const r of rows) {
    const keys = keyCols.map((c) => c.get(r) ?? '')
    const unit = unitLabel(r.material?.unit)
    const id = [...keys, unit].join('|')
    const g = map.get(id) ?? { keys, unit, count: 0, total: 0 }
    g.count += 1
    g.total += Number(r.quantity)
    map.set(id, g)
  }
  return [...map.values()].sort((a, b) => a.keys.join().localeCompare(b.keys.join(), 'hr'))
}

function addSummarySheet(wb, name, rows, keyCols) {
  const ws = wb.addWorksheet(name)
  ws.columns = [
    ...keyCols.map((c) => ({ header: c.header, width: 28 })),
    { header: 'Jedinica', width: 10 },
    { header: 'Br. isporuka', width: 14 },
    { header: 'Ukupna količina', width: 18 },
  ]
  for (const g of summarize(rows, keyCols)) ws.addRow([...g.keys, g.unit, g.count, g.total])
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

async function buildWorkbook(rows, from, to) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()

  const detail = wb.addWorksheet('Detalj')
  detail.columns = [
    { header: 'Datum', key: 'date', width: 12 },
    { header: 'Vozač', key: 'driver', width: 22 },
    { header: 'Vozilo', key: 'vehicle', width: 14 },
    { header: 'Materijal', key: 'material', width: 22 },
    { header: 'Količina', key: 'qty', width: 11 },
    { header: 'Jedinica', key: 'unit', width: 10 },
    { header: 'Naručitelj', key: 'client', width: 24 },
    { header: 'Gradilište', key: 'site', width: 24 },
    { header: 'Lokacija', key: 'location', width: 24 },
    { header: 'Br. otpremnice', key: 'note', width: 16 },
    { header: 'Utovar', key: 'loaded', width: 9 },
    { header: 'Istovar', key: 'unloaded', width: 9 },
  ]
  for (const r of [...rows].reverse()) {
    detail.addRow({
      date: r.delivery_date,
      driver: r.driver?.full_name,
      vehicle: r.vehicle?.plate,
      material: r.material?.name,
      qty: Number(r.quantity),
      unit: unitLabel(r.material?.unit),
      client: r.client?.name,
      site: r.site?.name,
      location: r.location,
      note: r.delivery_note,
      loaded: r.loaded_at?.slice(0, 5),
      unloaded: r.unloaded_at?.slice(0, 5),
    })
  }
  detail.getRow(1).font = { bold: true }
  detail.views = [{ state: 'frozen', ySplit: 1 }]
  detail.autoFilter = { from: 'A1', to: 'L1' }

  const col = (header, get) => ({ header, get })
  addSummarySheet(wb, 'Po materijalu', rows, [col('Materijal', (r) => r.material?.name)])
  addSummarySheet(wb, 'Po gradilištu', rows, [
    col('Naručitelj', (r) => r.client?.name),
    col('Gradilište', (r) => r.site?.name),
    col('Materijal', (r) => r.material?.name),
  ])
  addSummarySheet(wb, 'Po vozaču', rows, [
    col('Vozač', (r) => r.driver?.full_name),
    col('Materijal', (r) => r.material?.name),
  ])
  addSummarySheet(wb, 'Po vozilu', rows, [
    col('Vozilo', (r) => r.vehicle?.plate),
    col('Materijal', (r) => r.material?.name),
  ])
  addSummarySheet(wb, 'Po danu', rows, [
    col('Datum', (r) => r.delivery_date),
    col('Materijal', (r) => r.material?.name),
  ])

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `isporuke_${from}_${to}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function download() {
    setBusy(true)
    setMessage('')
    try {
      const rows = await fetchDeliveries(from, to)
      if (rows.length === 0) setMessage('Nema isporuka u odabranom razdoblju.')
      else await buildWorkbook(rows, from, to)
    } catch {
      setMessage('Izvoz nije uspio.')
    }
    setBusy(false)
  }

  return (
    <section className="card">
      <h1>Excel izvještaj</h1>
      <p className="hint">
        Datoteka sadrži list „Detalj” sa svim isporukama te sažetke po materijalu, gradilištu,
        vozaču, vozilu i danu.
      </p>
      <label>Od <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label>Do <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button className="primary" onClick={download} disabled={busy}>
        {busy ? 'Priprema…' : 'Preuzmi Excel'}
      </button>
      {message && <p className="warn">{message}</p>}
    </section>
  )
}
