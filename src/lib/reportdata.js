import { addDays } from './dates'
import { db } from './db'
import { allocateFuel, fuelByVehicle, rollup, totals } from './report'

// Sve što trebaju pregled i Excel izvještaj za zadano razdoblje.
export async function loadReport(from, to) {
  const range = { gte: { work_date: from }, lte: { work_date: to } }
  const [daily, fuelRows, dayLogs, machineLogs] = await Promise.all([
    db.rpcAll('ride_daily', { p_from: from, p_to: to }),
    // Točenja 90 dana unatrag, da se nađe prethodni puni tank za prvi interval razdoblja.
    db.select('fuel_entries', { gte: { work_date: addDays(from, -90) }, lte: { work_date: to }, order: [['fueled_at']] }),
    db.select('day_logs', { ...range, order: [['work_date']] }),
    db.select('machine_logs', { ...range, order: [['work_date']] }),
  ])
  const fuel = fuelByVehicle(fuelRows, from, to)
  const allocation = allocateFuel({ fuel, daily, dayLogs, machineLogs })
  const km = dayLogs.reduce((s, d) => s + (d.start_km != null && d.end_km != null ? Math.max(0, d.end_km - d.start_km) : 0), 0)
  return {
    from, to, daily, dayLogs, machineLogs, fuel, allocation, km,
    fuelRows: fuelRows.filter((f) => f.work_date >= from),
    total: totals(daily),
    machineHours: machineLogs.reduce((s, m) => s + Number(m.hours), 0),
    liters: fuel.reduce((s, v) => s + v.liters, 0),
    cost: fuel.reduce((s, v) => s + v.cost, 0),
    by: (dim) => rollup(daily, dim),
  }
}

// Trošak goriva po jedinici ima smisla samo ako sve ture gradilišta imaju tu jedinicu.
export function unitCost(group, cost) {
  if (!cost) return { m3: null, t: null }
  return {
    m3: group.m3 > 0 && group.m3Trips === group.trips ? cost / group.m3 : null,
    t: group.t > 0 && group.tTrips === group.trips ? cost / group.t : null,
  }
}
