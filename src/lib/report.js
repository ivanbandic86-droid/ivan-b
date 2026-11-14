// Izračuni za izvještaje. Čiste funkcije bez pristupa bazi, pokrivene testovima.

const num = (v) => Number(v) || 0

// Zbraja retke iz ride_daily po zadanoj dimenziji (site_id, material_id, driver_id,
// vehicle_id ili work_date). m³ i tone se vode odvojeno i nikad se ne zbrajaju zajedno.
export function rollup(daily, dim) {
  const map = new Map()
  for (const r of daily) {
    const key = r[dim] ?? null
    const g = map.get(key) ?? { key, trips: 0, emptyTrips: 0, m3: 0, t: 0, m3Trips: 0, tTrips: 0 }
    g.trips += num(r.trips)
    g.emptyTrips += num(r.empty_trips)
    g.m3 += num(r.m3)
    g.t += num(r.t)
    g.m3Trips += num(r.m3_trips)
    g.tTrips += num(r.t_trips)
    map.set(key, g)
  }
  return [...map.values()]
}

export function totals(daily) {
  return rollup(daily.map((r) => ({ ...r, all: 'all' })), 'all')[0] ??
    { trips: 0, emptyTrips: 0, m3: 0, t: 0, m3Trips: 0, tTrips: 0 }
}

// Metoda punog tanka: potrošnja se računa samo između dva točenja "do vrha".
// Litre svih točenja nakon prethodnog punog tanka, uključujući ovo, potrošene su
// na putu između ta dva stanja brojila. Djelomična točenja se pribrajaju.
// Brojilo je u km (vozila) ili moto-satima (strojevi).
export function fuelIntervals(entries) {
  const byVehicle = new Map()
  for (const e of entries) {
    if (!byVehicle.has(e.vehicle_id)) byVehicle.set(e.vehicle_id, [])
    byVehicle.get(e.vehicle_id).push(e)
  }
  const out = []
  for (const [vehicle_id, list] of byVehicle) {
    list.sort((a, b) => String(a.fueled_at).localeCompare(String(b.fueled_at)))
    let lastFull = null
    let liters = 0
    for (const e of list) {
      liters += num(e.liters)
      if (!e.full_tank) continue
      const meter = e.meter === null || e.meter === undefined ? null : Number(e.meter)
      if (lastFull !== null && meter !== null && meter > lastFull) {
        const distance = meter - lastFull
        out.push({
          vehicle_id, from: lastFull, to: meter, distance, liters,
          rate: (liters / distance) * 100, date: e.work_date,
        })
      }
      // Puni tank bez brojila ili s manjim brojilom prekida niz: sljedeći interval
      // počinje od idućeg ispravnog punog tanka.
      lastFull = meter !== null && (lastFull === null || meter > lastFull) ? meter : null
      liters = 0
    }
  }
  return out
}

// Potrošnja i trošak po vozilu za razdoblje. `entries` smije sadržavati i starija
// točenja (da se nađe prethodni puni tank); zbrojevi se računaju samo za razdoblje.
export function fuelByVehicle(entries, from, to) {
  const inRange = (d) => d >= from && d <= to
  const prices = entries.filter((e) => e.price_per_l !== null && e.price_per_l !== undefined)
  const avg = (list) => {
    const l = list.reduce((s, e) => s + num(e.liters), 0)
    return l ? list.reduce((s, e) => s + num(e.liters) * num(e.price_per_l), 0) / l : null
  }
  const fleetPrice = avg(prices)
  const intervals = fuelIntervals(entries)
  const map = new Map()
  const get = (id) => {
    if (!map.has(id)) {
      map.set(id, { vehicle_id: id, liters: 0, cost: 0, priced: true, fills: 0, distance: 0, intervalLiters: 0, rate: null, lastRate: null, unusual: false })
    }
    return map.get(id)
  }
  for (const e of entries) {
    if (!inRange(e.work_date)) continue
    const v = get(e.vehicle_id)
    const price = e.price_per_l ?? avg(prices.filter((p) => p.vehicle_id === e.vehicle_id)) ?? fleetPrice
    v.liters += num(e.liters)
    v.fills += 1
    if (price === null) v.priced = false
    else v.cost += num(e.liters) * price
  }
  for (const v of map.values()) {
    const all = intervals.filter((i) => i.vehicle_id === v.vehicle_id)
    const mine = all.filter((i) => inRange(i.date))
    v.distance = mine.reduce((s, i) => s + i.distance, 0)
    v.intervalLiters = mine.reduce((s, i) => s + i.liters, 0)
    v.rate = v.distance ? (v.intervalLiters / v.distance) * 100 : null
    v.lastRate = mine.length ? mine[mine.length - 1].rate : null
    // Neuobičajeno: zadnji interval je barem 25 % iznad prosjeka prethodnih (najmanje dva).
    const earlier = all.slice(0, all.indexOf(mine[mine.length - 1]))
    if (mine.length && earlier.length >= 2) {
      const base = earlier.reduce((s, i) => s + i.liters, 0) / earlier.reduce((s, i) => s + i.distance, 0) * 100
      v.unusual = v.lastRate > base * 1.25
    }
  }
  return [...map.values()]
}

// Raspodjela stvarnog troška goriva po gradilištima.
//
// Vozila: trošak vozila se dijeli na dane prema prijeđenim km (ako svi dani s
// turama imaju upisane km, inače prema broju tura), a dan na gradilišta prema
// broju tura. Strojevi: prema satima rada po gradilištu. Što se ne može vezati
// uz gradilište (dan bez tura, vozilo bez unosa) ostaje "neraspoređeno".
export function allocateFuel({ fuel, daily, dayLogs, machineLogs }) {
  const bySite = new Map()
  let unallocated = { liters: 0, cost: 0 }
  const give = (site, liters, cost) => {
    const s = bySite.get(site) ?? { site_id: site, liters: 0, cost: 0 }
    s.liters += liters
    s.cost += cost
    bySite.set(site, s)
  }

  for (const v of fuel) {
    if (!v.liters) continue
    const hours = machineLogs.filter((m) => m.vehicle_id === v.vehicle_id)
    const rides = daily.filter((r) => r.vehicle_id === v.vehicle_id)
    const shares = new Map() // site_id -> udio (zbroj = 1 ako je sve raspoređeno)
    let assigned = 0

    if (hours.length) {
      const total = hours.reduce((s, m) => s + num(m.hours), 0)
      for (const m of hours) shares.set(m.site_id, (shares.get(m.site_id) ?? 0) + num(m.hours) / total)
      assigned = 1
    } else if (rides.length) {
      const tripsByDay = new Map()
      for (const r of rides) {
        const day = tripsByDay.get(r.work_date) ?? new Map()
        day.set(r.site_id, (day.get(r.site_id) ?? 0) + num(r.trips) + num(r.empty_trips))
        tripsByDay.set(r.work_date, day)
      }
      const kmByDay = new Map()
      for (const d of dayLogs) {
        if (d.vehicle_id !== v.vehicle_id || d.start_km === null || d.end_km === null) continue
        kmByDay.set(d.work_date, (kmByDay.get(d.work_date) ?? 0) + Math.max(0, num(d.end_km) - num(d.start_km)))
      }
      const useKm = [...tripsByDay.keys()].every((day) => kmByDay.get(day) > 0)
      const weight = (day) => (useKm ? kmByDay.get(day) : [...tripsByDay.get(day).values()].reduce((s, n) => s + n, 0))
      const days = useKm ? [...kmByDay.keys()] : [...tripsByDay.keys()]
      const total = days.reduce((s, day) => s + weight(day), 0)
      for (const day of days) {
        const sites = tripsByDay.get(day)
        if (!sites) continue // km bez tura taj dan: ostaje neraspoređeno
        const dayShare = weight(day) / total
        const dayTrips = [...sites.values()].reduce((s, n) => s + n, 0)
        for (const [site, n] of sites) shares.set(site, (shares.get(site) ?? 0) + dayShare * (n / dayTrips))
        assigned += dayShare
      }
    }

    for (const [site, share] of shares) give(site, v.liters * share, v.cost * share)
    unallocated.liters += v.liters * (1 - assigned)
    unallocated.cost += v.cost * (1 - assigned)
  }
  return { bySite: [...bySite.values()], unallocated }
}
