import { describe, expect, it } from 'vitest'
import { addDays, fmtDate, hoursBetween, localDate, monthStart } from './dates'
import { parseNum, qtyLabel } from './num'
import { classify, createOutbox, memoryStore } from './outbox'
import { allocateFuel, fuelByVehicle, fuelIntervals, rollup, totals } from './report'

describe('datumi', () => {
  it('lokalni datum ne klizi na jučer nakon ponoći', () => {
    expect(localDate(new Date(2026, 10, 13, 0, 30))).toBe('2026-11-13')
    expect(localDate(new Date(2026, 0, 1, 1, 59))).toBe('2026-01-01')
  })
  it('zbrajanje dana prelazi mjesec i godinu', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(monthStart('2026-11-13')).toBe('2026-11-01')
    expect(fmtDate('2026-11-03')).toBe('3. 11. 2026.')
  })
  it('smjena preko ponoći daje pozitivne sate', () => {
    expect(hoursBetween('06:30', '15:00')).toBe(8.5)
    expect(hoursBetween('22:00', '06:00')).toBe(8)
    expect(hoursBetween('', '06:00')).toBe(null)
  })
})

describe('brojevi', () => {
  it('prihvaća decimalni zarez i odbija tekst', () => {
    expect(parseNum('12,5')).toBe(12.5)
    expect(parseNum(' 18.25 ')).toBe(18.25)
    expect(parseNum('')).toBe(null)
    expect(parseNum('abc')).toBeNaN()
    expect(parseNum('12,5,3')).toBeNaN()
    expect(parseNum('-4')).toBeNaN()
  })
  it('količina se ispisuje po jedinicama', () => {
    expect(qtyLabel(12, 0)).toBe('12 m³')
    expect(qtyLabel(11.5, 20.7)).toBe('11,5 m³ · 20,7 t')
  })
})

describe('odgovor servera', () => {
  it('uspjeh i duplikat znače da je spremljeno', () => {
    expect(classify({ error: null, status: 201 })).toBe('done')
    expect(classify({ error: { code: '23505', message: 'duplicate key' }, status: 409 })).toBe('done')
  })
  it('mrežne greške se ponavljaju, uključujući "Network Error"', () => {
    expect(classify({ error: { message: 'TypeError: Failed to fetch' }, status: 0 })).toBe('retry')
    expect(classify({ error: new Error('Network Error') })).toBe('retry')
    expect(classify({ error: { message: 'Load failed' } })).toBe('retry')
    expect(classify({ error: { message: 'JWT expired', code: 'PGRST301' }, status: 401 })).toBe('retry')
    expect(classify({ error: { message: 'bad gateway' }, status: 502 })).toBe('retry')
    expect(classify({ error: { code: '42501', message: 'rls' }, status: 403 }, false)).toBe('retry')
  })
  it('odbijen unos je trajna greška s razlogom', () => {
    expect(classify({ error: { code: '42501', message: 'new row violates row-level security' }, status: 403 }).failed)
      .toMatch(/zaključano/)
    expect(classify({ error: { code: '23514', message: 'check' }, status: 400 }).failed).toMatch(/nije ispravna/)
    expect(classify({ error: new TypeError("Cannot read properties of undefined (reading 'x')") }).failed)
      .toMatch(/Cannot read/)
  })
})

describe('red čekanja', () => {
  const item = (id, driver = 'd1') => ({ id, kind: 'ride', row: { id, driver_id: driver } })

  it('šalje redom i briše tek nakon potvrde', async () => {
    const sent = []
    const box = createOutbox({ store: memoryStore(), send: async (i) => (sent.push(i.id), { error: null }) })
    await box.add({ ...item('a'), createdAt: 1 })
    await box.add({ ...item('b'), createdAt: 2 })
    await box.flush()
    expect(sent).toEqual(['a', 'b'])
    expect(await box.list()).toEqual([])
  })

  it('unos dodan tijekom slanja se ne gubi', async () => {
    let box
    const sent = []
    box = createOutbox({
      store: memoryStore(),
      send: async (i) => {
        sent.push(i.id)
        if (i.id === 'a') await box.add({ ...item('late'), createdAt: 5 })
        return { error: null }
      },
    })
    await box.add({ ...item('a'), createdAt: 1 })
    await box.flush()
    expect(sent).toEqual(['a', 'late'])
    expect(await box.list()).toEqual([])
  })

  it('bez mreže sve ostaje u redu, a kad se vrati ode', async () => {
    let online = false
    const box = createOutbox({
      store: memoryStore(),
      isOnline: () => online,
      send: async () => (online ? { error: null } : { error: { message: 'Failed to fetch' }, status: 0 }),
    })
    await box.add(item('a'))
    await box.flush()
    expect((await box.list()).length).toBe(1)
    online = true
    await box.flush()
    expect(await box.list()).toEqual([])
  })

  it('pad mreže usred slanja zaustavlja red bez gubitka', async () => {
    let calls = 0
    const box = createOutbox({
      store: memoryStore(),
      send: async () => (++calls === 1 ? { error: null } : { error: { message: 'Failed to fetch' }, status: 0 }),
    })
    await box.add({ ...item('a'), createdAt: 1 })
    await box.add({ ...item('b'), createdAt: 2 })
    await box.add({ ...item('c'), createdAt: 3 })
    await box.flush()
    expect((await box.list()).map((i) => i.id)).toEqual(['b', 'c'])
    expect(calls).toBe(2)
  })

  it('odbijen unos se označi i ne blokira ostale', async () => {
    const box = createOutbox({
      store: memoryStore(),
      send: async (i) => (i.id === 'bad' ? { error: { code: '42501', message: 'rls' }, status: 403 } : { error: null }),
    })
    await box.add({ ...item('bad'), createdAt: 1 })
    await box.add({ ...item('good'), createdAt: 2 })
    await box.flush()
    const left = await box.list()
    expect(left.map((i) => i.id)).toEqual(['bad'])
    expect(left[0].error).toMatch(/zaključano/)
    await box.flush()
    expect((await box.list())[0].attempts).toBe(1) // odbijeni se ne šalju ponovno sami
  })

  it('ponovno slanje nakon izgubljenog odgovora ne stvara duplikat', async () => {
    const server = new Set()
    let dropFirstReply = true
    const box = createOutbox({
      store: memoryStore(),
      send: async (i) => {
        if (server.has(i.id)) return { error: { code: '23505', message: 'duplicate' }, status: 409 }
        server.add(i.id)
        if (dropFirstReply) {
          dropFirstReply = false
          return { error: { message: 'Failed to fetch' }, status: 0 }
        }
        return { error: null }
      },
    })
    await box.add(item('a'))
    await box.flush()
    expect((await box.list()).length).toBe(1)
    await box.flush()
    expect(await box.list()).toEqual([])
    expect(server.size).toBe(1)
  })

  it('unosi drugog vozača čekaju njegovu prijavu', async () => {
    const sent = []
    const box = createOutbox({ store: memoryStore(), owner: () => 'd1', send: async (i) => (sent.push(i.id), { error: null }) })
    await box.add({ ...item('mine', 'd1'), createdAt: 1 })
    await box.add({ ...item('other', 'd2'), createdAt: 2 })
    await box.flush()
    expect(sent).toEqual(['mine'])
    expect((await box.list()).map((i) => i.id)).toEqual(['other'])
  })
})

describe('zbrojevi vožnji', () => {
  const daily = [
    { work_date: '2026-11-02', site_id: 's1', material_id: 'm1', vehicle_id: 'v1', trips: 6, empty_trips: 1, m3: 72, t: 0, m3_trips: 6, t_trips: 0 },
    { work_date: '2026-11-02', site_id: 's2', material_id: 'm2', vehicle_id: 'v1', trips: 2, empty_trips: 0, m3: 0, t: 40, m3_trips: 0, t_trips: 2 },
    { work_date: '2026-11-03', site_id: 's1', material_id: 'm1', vehicle_id: 'v2', trips: 4, empty_trips: 0, m3: '48.00', t: '81.60', m3_trips: 4, t_trips: 4 },
  ]
  it('zbraja po gradilištu, m³ i tone odvojeno', () => {
    const bySite = rollup(daily, 'site_id')
    expect(bySite.find((g) => g.key === 's1')).toMatchObject({ trips: 10, emptyTrips: 1, m3: 120, t: 81.6 })
    expect(bySite.find((g) => g.key === 's2')).toMatchObject({ trips: 2, m3: 0, t: 40 })
    expect(totals(daily)).toMatchObject({ trips: 12, emptyTrips: 1, m3: 120, t: 121.6 })
    expect(totals([])).toMatchObject({ trips: 0, m3: 0 })
  })
})

describe('gorivo metodom punog tanka', () => {
  const f = (vehicle_id, day, liters, meter, full_tank = true, price_per_l = 1.5) => ({
    vehicle_id, work_date: `2026-11-${day}`, fueled_at: `2026-11-${day}T08:00:00Z`, liters, meter, full_tank, price_per_l,
  })

  it('računa između dva puna tanka i pribraja djelomična točenja', () => {
    const list = [f('v1', '01', 200, 100000), f('v1', '05', 80, 100400, false), f('v1', '08', 180, 100800)]
    expect(fuelIntervals(list)).toEqual([
      { vehicle_id: 'v1', from: 100000, to: 100800, distance: 800, liters: 260, rate: 32.5, date: '2026-11-08' },
    ])
  })

  it('jedno točenje ne daje potrošnju, a puni tank bez brojila prekida niz', () => {
    expect(fuelIntervals([f('v1', '01', 200, 100000)])).toEqual([])
    const list = [f('v1', '01', 200, 100000), f('v1', '04', 150, null), f('v1', '08', 160, 101000), f('v1', '12', 170, 101500)]
    const out = fuelIntervals(list)
    expect(out.length).toBe(1)
    expect(out[0]).toMatchObject({ from: 101000, to: 101500, liters: 170, rate: 34 })
  })

  it('zbraja litre i trošak razdoblja, a cijenu koja nedostaje uzima iz prosjeka vozila', () => {
    const list = [f('v1', '01', 200, 100000), f('v1', '08', 100, 100400, true, null), f('v2', '03', 50, 500, true, 2)]
    const out = fuelByVehicle(list, '2026-11-02', '2026-11-30')
    const v1 = out.find((v) => v.vehicle_id === 'v1')
    expect(v1).toMatchObject({ liters: 100, cost: 150, fills: 1, distance: 400, rate: 25, priced: true })
    expect(out.find((v) => v.vehicle_id === 'v2')).toMatchObject({ liters: 50, cost: 100, rate: null })
  })

  it('označava neuobičajeno visoku potrošnju zadnjeg intervala', () => {
    const list = [f('v1', '01', 200, 0), f('v1', '03', 300, 1000), f('v1', '05', 310, 2000), f('v1', '09', 420, 3000)]
    expect(fuelByVehicle(list, '2026-11-06', '2026-11-30')[0].unusual).toBe(true)
    const calm = [f('v1', '01', 200, 0), f('v1', '03', 300, 1000), f('v1', '05', 310, 2000), f('v1', '09', 320, 3000)]
    expect(fuelByVehicle(calm, '2026-11-06', '2026-11-30')[0].unusual).toBe(false)
  })
})

describe('trošak goriva po gradilištu', () => {
  const fuel = [{ vehicle_id: 'v1', liters: 300, cost: 450 }]
  const ride = (work_date, site_id, trips, empty_trips = 0) => ({ vehicle_id: 'v1', work_date, site_id, trips, empty_trips })
  const km = (work_date, start_km, end_km) => ({ vehicle_id: 'v1', work_date, start_km, end_km })
  const cost = (r, site) => Math.round(r.bySite.find((s) => s.site_id === site)?.cost ?? 0)

  it('dijeli prema km po danu, a dan prema turama', () => {
    const r = allocateFuel({
      fuel,
      daily: [ride('d1', 'A', 4), ride('d2', 'A', 1), ride('d2', 'B', 3)],
      dayLogs: [km('d1', 0, 100), km('d2', 100, 300)],
      machineLogs: [],
    })
    // d1 = 1/3 troška (sve A), d2 = 2/3 (A 1/4, B 3/4)
    expect(cost(r, 'A')).toBe(225)
    expect(cost(r, 'B')).toBe(225)
    expect(Math.round(r.unallocated.cost)).toBe(0)
  })

  it('bez upisanih km dijeli prema broju tura', () => {
    const r = allocateFuel({ fuel, daily: [ride('d1', 'A', 6), ride('d2', 'B', 2, 1)], dayLogs: [km('d1', 0, 100)], machineLogs: [] })
    expect(cost(r, 'A')).toBe(300)
    expect(cost(r, 'B')).toBe(150)
  })

  it('dan s km bez tura i vozilo bez unosa ostaju neraspoređeni', () => {
    const r = allocateFuel({
      fuel: [...fuel, { vehicle_id: 'v9', liters: 40, cost: 60 }],
      daily: [ride('d1', 'A', 4)],
      dayLogs: [km('d1', 0, 100), km('d2', 100, 200)],
      machineLogs: [],
    })
    expect(cost(r, 'A')).toBe(225)
    expect(Math.round(r.unallocated.cost)).toBe(285)
  })

  it('strojeve dijeli prema satima po gradilištu', () => {
    const r = allocateFuel({
      fuel: [{ vehicle_id: 'bager', liters: 100, cost: 150 }],
      daily: [], dayLogs: [],
      machineLogs: [{ vehicle_id: 'bager', site_id: 'A', hours: 6 }, { vehicle_id: 'bager', site_id: 'B', hours: 2 }],
    })
    expect(cost(r, 'A')).toBe(113)
    expect(cost(r, 'B')).toBe(38)
  })

  it('zbroj raspoređenog i neraspoređenog jednak je stvarnom trošku', () => {
    const r = allocateFuel({
      fuel,
      daily: [ride('d1', 'A', 3), ride('d1', 'B', 2), ride('d3', 'C', 1)],
      dayLogs: [km('d1', 0, 80), km('d2', 80, 120), km('d3', 120, 200)],
      machineLogs: [],
    })
    const sum = r.bySite.reduce((s, x) => s + x.cost, 0) + r.unallocated.cost
    expect(sum).toBeCloseTo(450, 6)
  })
})
