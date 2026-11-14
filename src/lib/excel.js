// Excel izvještaj: listovi s detaljima i sažeci. m³ i tone su uvijek u odvojenim stupcima.
import { fmtTime, hoursBetween } from './dates'
import { db } from './db'
import { loadReport, unitCost } from './reportdata'

const round = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d)

function sheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name)
  ws.columns = columns.map(([header, width = 14]) => ({ header, width }))
  rows.forEach((r) => ws.addRow(r))
  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return ws
}

export async function downloadReport(from, to, L) {
  const range = { gte: { work_date: from }, lte: { work_date: to } }
  const [report, rides] = await Promise.all([
    loadReport(from, to),
    db.select('rides', { ...range, order: [['ride_at']] }),
  ])
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()

  sheet(wb, 'Vožnje',
    [['Datum', 12], ['Vrijeme', 9], ['Vozač', 22], ['Vozilo', 14], ['Naručitelj', 22], ['Gradilište', 24], ['Materijal', 22],
      ['m³', 10], ['t', 10], ['Utovar', 22], ['Istovar', 22], ['Br. otpremnice', 15], ['Primatelj', 18], ['Napomena', 28]],
    rides.map((r) => [
      r.work_date, fmtTime(r.ride_at), L.userName(r.driver_id), L.vehicleName(r.vehicle_id),
      r.site_id ? L.clientName(L.lists.sites.find((s) => s.id === r.site_id)?.client_id) : r.custom_client ?? '', L.siteOf(r),
      L.materialOf(r), r.quantity_m3 != null ? Number(r.quantity_m3) : null,
      r.quantity_t != null ? Number(r.quantity_t) : null, L.locationName(r.load_location_id), L.locationName(r.unload_location_id),
      r.delivery_note, r.recipient, r.note,
    ]))

  const summary = (name, dim, label, getName) => {
    const groups = report.by(dim).sort((a, b) => String(getName(a.key)).localeCompare(String(getName(b.key)), 'hr'))
    sheet(wb, name, [[label, 28], ['Ture s teretom', 15], ['Vožnje bez tereta', 17], ['m³', 12], ['t', 12]],
      groups.map((g) => [getName(g.key), g.trips, g.emptyTrips, round(g.m3), round(g.t)]))
  }

  const costs = new Map(report.allocation.bySite.map((s) => [s.site_id, s]))
  const siteGroups = report.by('site_id')
  const siteIds = [...new Set([...siteGroups.map((g) => g.key), ...costs.keys()])]
  const siteRows = siteIds
    .map((id) => {
      const g = siteGroups.find((x) => x.key === id) ?? { trips: 0, emptyTrips: 0, m3: 0, t: 0, m3Trips: 0, tTrips: 0 }
      const c = costs.get(id)
      const per = unitCost(g, c?.cost)
      return [L.siteName(id), g.trips, g.emptyTrips, round(g.m3), round(g.t), round(c?.liters ?? 0, 0), round(c?.cost ?? 0), round(per.m3), round(per.t)]
    })
    .sort((a, b) => a[0].localeCompare(b[0], 'hr'))
  if (report.allocation.unallocated.liters > 0.5) {
    siteRows.push(['Neraspoređeno', null, null, null, null, round(report.allocation.unallocated.liters, 0), round(report.allocation.unallocated.cost), null, null])
  }
  sheet(wb, 'Po gradilištu',
    [['Gradilište', 28], ['Ture s teretom', 15], ['Vožnje bez tereta', 17], ['m³', 12], ['t', 12], ['Gorivo (L)', 12], ['Trošak goriva (€)', 17], ['€/m³', 10], ['€/t', 10]],
    siteRows)
  summary('Po materijalu', 'material_id', 'Materijal', (id) => (id ? L.materialName(id) : 'Bez tereta ili ostalo (čeka obradu)'))
  summary('Po vozaču', 'driver_id', 'Vozač', L.userName)
  summary('Po vozilu', 'vehicle_id', 'Vozilo', L.vehicleName)
  summary('Po danu', 'work_date', 'Datum', (d) => d)

  sheet(wb, 'Gorivo',
    [['Datum', 12], ['Vrijeme', 9], ['Vozač', 22], ['Vozilo', 14], ['Litara', 10], ['Brojilo', 12], ['Do vrha', 9], ['€/L', 9], ['Iznos (€)', 12], ['Mjesto', 24]],
    report.fuelRows.map((f) => [
      f.work_date, fmtTime(f.fueled_at), L.userName(f.driver_id), L.vehicleName(f.vehicle_id), Number(f.liters),
      f.meter != null ? Number(f.meter) : null, f.full_tank ? 'Da' : 'Ne', f.price_per_l != null ? Number(f.price_per_l) : null,
      f.price_per_l != null ? round(f.liters * f.price_per_l) : null, f.station,
    ]))
  sheet(wb, 'Potrošnja',
    [['Vozilo', 14], ['Točenja', 10], ['Litara', 10], ['Trošak (€)', 12], ['Prijeđeno između punih tankova', 28], ['Jedinica', 10], ['Potrošnja', 12], ['Jedinica potrošnje', 18], ['Neuobičajeno', 14]],
    report.fuel.map((v) => {
      const machine = L.vehicle(v.vehicle_id)?.category === 'stroj'
      return [L.vehicleName(v.vehicle_id), v.fills, round(v.liters, 0), v.priced ? round(v.cost) : null, v.distance || null, machine ? 'h' : 'km',
        v.rate == null ? null : round(machine ? v.rate / 100 : v.rate, 1), machine ? 'L/h' : 'L/100 km', v.unusual ? 'Da' : '']
    }))
  sheet(wb, 'Strojevi',
    [['Datum', 12], ['Strojar', 22], ['Stroj', 14], ['Gradilište', 24], ['Sati', 9], ['Opis rada', 30]],
    report.machineLogs.map((m) => [m.work_date, L.userName(m.driver_id), L.vehicleName(m.vehicle_id), L.siteOf(m), Number(m.hours), m.activity]))
  sheet(wb, 'Radni dani',
    [['Datum', 12], ['Vozač', 22], ['Vozilo', 14], ['Početni km', 12], ['Završni km', 12], ['Prijeđeno km', 13], ['Početak', 9], ['Kraj', 9], ['Sati', 8]],
    report.dayLogs.map((d) => [
      d.work_date, L.userName(d.driver_id), L.vehicleName(d.vehicle_id), d.start_km != null ? Number(d.start_km) : null,
      d.end_km != null ? Number(d.end_km) : null, d.start_km != null && d.end_km != null ? d.end_km - d.start_km : null,
      d.work_start?.slice(0, 5), d.work_end?.slice(0, 5), round(hoursBetween(d.work_start, d.work_end), 2),
    ]))

  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `kiperlog_${from}_${to}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return rides.length
}
