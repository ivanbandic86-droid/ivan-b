// Demo način: ista sučelja kao db.supabase.js, ali podaci žive samo u pregledniku.
// Služi da se aplikacija može isprobati prije nego što se spoji baza.
import { addDays, localDate } from './dates'

const KEY = 'kiperlog.demo'
const SESSION = 'kiperlog.demo.user'
const ENTRY_TABLES = ['rides', 'day_logs', 'machine_logs', 'fuel_entries']

const uuid = () => crypto.randomUUID()
const offline = () => ({ error: { message: 'Failed to fetch' }, status: 0 })

function seed() {
  const today = localDate()
  const P = { ured: uuid(), marko: uuid(), ante: uuid(), josip: uuid() }
  const V = { k1: uuid(), k2: uuid(), mix: uuid(), bager: uuid(), valjak: uuid() }
  const M = { tampon: uuid(), agregat: uuid(), beton: uuid(), asfalt: uuid(), iskop: uuid() }
  const C = { hc: uuid(), zuc: uuid(), interno: uuid() }
  const S = { d8: uuid(), zc: uuid(), baza: uuid() }
  const L = { klis: uuid(), betonara: uuid(), asfaltna: uuid(), deponij: uuid() }

  const s = {
    profiles: [
      { id: P.ured, username: 'ured', full_name: 'Ivana Ured', role: 'ured', active: true },
      { id: P.marko, username: 'marko', full_name: 'Marko Marić', role: 'vozac', active: true },
      { id: P.ante, username: 'ante', full_name: 'Ante Antić', role: 'vozac', active: true },
      { id: P.josip, username: 'josip', full_name: 'Josip Jurić', role: 'vozac', active: true },
    ],
    vehicles: [
      { id: V.k1, code: 'ST-1234-AB', name: 'MAN TGS 8x4', category: 'vozilo', kind: 'kiper', capacity_m3: 12, capacity_t: 20, default_driver_id: P.marko, active: true },
      { id: V.k2, code: 'ST-5678-CD', name: 'Mercedes Arocs', category: 'vozilo', kind: 'kiper', capacity_m3: 14, capacity_t: 24, default_driver_id: P.ante, active: true },
      { id: V.mix, code: 'ST-9012-EF', name: 'Iveco mješalica', category: 'vozilo', kind: 'mješalica', capacity_m3: 8, capacity_t: null, default_driver_id: null, active: true },
      { id: V.bager, code: 'BAGER-1', name: 'CAT 320', category: 'stroj', kind: 'bager', capacity_m3: null, capacity_t: null, default_driver_id: P.josip, active: true },
      { id: V.valjak, code: 'VALJAK-1', name: 'Bomag BW 213', category: 'stroj', kind: 'valjak', capacity_m3: null, capacity_t: null, default_driver_id: null, active: true },
    ],
    materials: [
      { id: M.tampon, name: 'Tampon 0-31,5', unit: 'm3', active: true },
      { id: M.agregat, name: 'Kameni agregat 0-4', unit: 't', active: true },
      { id: M.beton, name: 'Beton C25/30', unit: 'm3', active: true },
      { id: M.asfalt, name: 'Asfalt AC 11', unit: 't', active: true },
      { id: M.iskop, name: 'Iskop', unit: 'm3', active: true },
    ],
    clients: [
      { id: C.hc, name: 'Hrvatske ceste', internal: false, active: true },
      { id: C.zuc, name: 'ŽUC Split', internal: false, active: true },
      { id: C.interno, name: 'Interno', internal: true, active: true },
    ],
    sites: [
      { id: S.d8, name: 'D8 Kaštela', client_id: C.hc, active: true },
      { id: S.zc, name: 'ŽC 6253 Dugopolje', client_id: C.zuc, active: true },
      { id: S.baza, name: 'Baza Dugopolje', client_id: C.interno, active: true },
    ],
    locations: [
      { id: L.klis, name: 'Kamenolom Klis', kind: 'kamenolom', active: true },
      { id: L.betonara, name: 'Betonara Solin', kind: 'betonara', active: true },
      { id: L.asfaltna, name: 'Asfaltna baza Dugopolje', kind: 'asfaltna_baza', active: true },
      { id: L.deponij, name: 'Deponij Karepovac', kind: 'deponij', active: true },
    ],
    app_settings: [{ id: true, locked_until: addDays(today, -10) }],
    work_orders: [],
    rides: [],
    day_logs: [],
    machine_logs: [],
    fuel_entries: [],
    audit_log: [],
  }

  const at = (day, h, m) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).toISOString()
  const stamp = (day) => ({ created_at: at(day, 16, 0), updated_at: at(day, 16, 0) })
  let km = { [V.k1]: 152300, [V.k2]: 98400 }
  let note = 4100

  for (let back = 13; back >= 0; back--) {
    const day = addDays(today, -back)
    const weekday = new Date(`${day}T12:00:00`).getDay()
    if (weekday === 0) continue
    const plan = [
      { driver: P.marko, vehicle: V.k1, site: S.d8, material: M.tampon, load: L.klis, trips: back === 0 ? 3 : 6 + (back % 3), m3: 12 },
      { driver: P.ante, vehicle: V.k2, site: back % 2 ? S.zc : S.d8, material: back % 2 ? M.asfalt : M.agregat, load: back % 2 ? L.asfaltna : L.klis, trips: back === 0 ? 2 : 5 + (back % 2), t: 23.5 },
    ]
    for (const p of plan) {
      for (let i = 0; i < p.trips; i++) {
        s.rides.push({
          id: uuid(), driver_id: p.driver, vehicle_id: p.vehicle, site_id: p.site, material_id: p.material,
          load_location_id: p.load, unload_location_id: null, work_order_id: null,
          ride_at: at(day, 7 + i, (i * 17) % 60), work_date: day, is_empty: false,
          quantity_m3: p.m3 ?? null, quantity_t: p.t ?? null, delivery_note: String(note++),
          recipient: null, note: null, photo_path: null, ...stamp(day),
        })
      }
      const dist = p.trips * (p.vehicle === V.k1 ? 31 : 38) + 12
      s.day_logs.push({
        id: uuid(), driver_id: p.driver, vehicle_id: p.vehicle, work_date: day,
        start_km: km[p.vehicle], end_km: back === 0 ? null : km[p.vehicle] + dist,
        work_start: '06:30', work_end: back === 0 ? null : '15:00', note: null, ...stamp(day),
      })
      if (back !== 0) km[p.vehicle] += dist
      if (back % 3 === 1) {
        s.fuel_entries.push({
          id: uuid(), driver_id: p.driver, vehicle_id: p.vehicle, fueled_at: at(day, 15, 20), work_date: day,
          liters: p.vehicle === V.k1 ? 205 + back * 3 : 248 + back * 2, price_per_l: 1.42, meter: km[p.vehicle],
          full_tank: true, station: 'INA Dugopolje', note: null, ...stamp(day),
        })
      }
    }
    if (back % 2 === 0) {
      s.machine_logs.push({
        id: uuid(), driver_id: P.josip, vehicle_id: V.bager, site_id: back % 4 === 0 ? S.d8 : S.zc, work_order_id: null,
        work_date: day, hours: 7.5, activity: 'Iskop rova', note: null, ...stamp(day),
      })
    }
    if (back === 6) {
      s.fuel_entries.push({
        id: uuid(), driver_id: P.josip, vehicle_id: V.bager, fueled_at: at(day, 14, 0), work_date: day,
        liters: 160, price_per_l: 1.38, meter: null, full_tank: true, station: 'Cisterna na gradilištu', note: null, ...stamp(day),
      })
    }
  }

  s.work_orders.push(
    { id: uuid(), work_date: today, driver_id: P.marko, vehicle_id: V.k1, site_id: S.d8, material_id: M.tampon, load_location_id: L.klis, unload_location_id: null, planned_trips: 8, note: 'Tampon za nasip, stacionaža 2+300', status: 'otvoren', created_by: P.ured, created_at: at(today, 6, 0) },
    { id: uuid(), work_date: today, driver_id: P.marko, vehicle_id: V.k1, site_id: S.zc, material_id: M.iskop, load_location_id: null, unload_location_id: L.deponij, planned_trips: 2, note: null, status: 'otvoren', created_by: P.ured, created_at: at(today, 6, 5) },
    { id: uuid(), work_date: today, driver_id: P.josip, vehicle_id: V.bager, site_id: S.d8, material_id: null, load_location_id: null, unload_location_id: null, planned_trips: null, note: 'Iskop za propust', status: 'otvoren', created_by: P.ured, created_at: at(today, 6, 10) },
  )
  const order = s.work_orders[0]
  for (const r of s.rides) if (r.work_date === today && r.driver_id === P.marko) r.work_order_id = order.id
  return s
}

export function createDemoDb() {
  let state
  try {
    state = JSON.parse(localStorage.getItem(KEY))
  } catch {
    state = null
  }
  if (!state) state = seed()
  const photos = new Map()
  const listeners = new Set()
  const authListeners = new Set()

  const persist = () => {
    localStorage.setItem(KEY, JSON.stringify(state))
    listeners.forEach((cb) => cb())
  }
  const me = () => localStorage.getItem(SESSION)
  const locked = (row) => {
    const until = state.app_settings[0].locked_until
    return Boolean(until && row.work_date && row.work_date <= until)
  }
  const denied = () => ({ error: { code: '42501', message: 'row-level security' }, status: 403 })
  const LOCKED = 'Unos se više ne može mijenjati: zaključan je ili je prošao rok za ispravak.'

  // Koristi li se zapis negdje drugdje (kao strani ključ u bazi)?
  const LINKS = ['driver_id', 'vehicle_id', 'site_id', 'material_id', 'load_location_id', 'unload_location_id', 'client_id', 'created_by']
  const used = (id, own) =>
    !ENTRY_TABLES.includes(own) && own !== 'work_orders' &&
    ['rides', 'day_logs', 'machine_logs', 'fuel_entries', 'work_orders', 'sites'].some((t) => state[t].some((r) => LINKS.some((k) => r[k] === id)))

  function select(table, { eq = {}, gte = {}, lte = {}, order = [] } = {}) {
    let rows = state[table].filter(
      (r) =>
        Object.entries(eq).every(([k, v]) => r[k] === v) &&
        Object.entries(gte).every(([k, v]) => r[k] >= v) &&
        Object.entries(lte).every(([k, v]) => r[k] <= v),
    )
    for (const [col, asc = true] of [...order].reverse()) {
      rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1))
    }
    return rows.map((r) => ({ ...r }))
  }

  function insert(table, row) {
    if (!navigator.onLine) return offline()
    if (row.id && state[table].some((r) => r.id === row.id)) return { error: { code: '23505', message: 'duplicate' }, status: 409 }
    if (ENTRY_TABLES.includes(table) && locked(row)) return denied()
    const now = new Date().toISOString()
    state[table].push({ id: uuid(), created_at: now, updated_at: now, ...row })
    persist()
    return { error: null, status: 201 }
  }

  function audit(table, action, old, next) {
    if (!ENTRY_TABLES.includes(table)) return
    state.audit_log.push({
      id: state.audit_log.length + 1, table_name: table, row_id: old.id, action, actor: me(),
      at: new Date().toISOString(), old_row: old, new_row: next ?? null,
    })
  }

  return {
    demo: true,
    auth: {
      getSession: async () => ({ userId: me() }),
      // U demu se prijavljuje korisničkim imenom bez provjere PIN-a.
      async signIn(email) {
        const user = state.profiles.find((p) => p.username === email.split('@')[0])
        if (!user) return 'Pogrešno korisničko ime ili PIN.'
        localStorage.setItem(SESSION, user.id)
        authListeners.forEach((cb) => cb('SIGNED_IN'))
        return null
      },
      async signOut() {
        localStorage.removeItem(SESSION)
        authListeners.forEach((cb) => cb('SIGNED_OUT'))
      },
      onChange(cb) {
        authListeners.add(cb)
        return () => authListeners.delete(cb)
      },
    },
    select: async (table, opts) => select(table, opts),
    async rpcAll(name, { p_from, p_to }) {
      if (name !== 'ride_daily') throw new Error(`Nepoznata funkcija ${name}`)
      const map = new Map()
      for (const r of state.rides) {
        if (r.work_date < p_from || r.work_date > p_to) continue
        const key = [r.work_date, r.site_id, r.material_id, r.driver_id, r.vehicle_id].join('|')
        const g = map.get(key) ?? {
          work_date: r.work_date, site_id: r.site_id, material_id: r.material_id, driver_id: r.driver_id,
          vehicle_id: r.vehicle_id, trips: 0, empty_trips: 0, m3: 0, t: 0, m3_trips: 0, t_trips: 0,
        }
        if (r.is_empty) g.empty_trips += 1
        else g.trips += 1
        g.m3 += Number(r.quantity_m3) || 0
        g.t += Number(r.quantity_t) || 0
        if (r.quantity_m3 !== null) g.m3_trips += 1
        if (r.quantity_t !== null) g.t_trips += 1
        map.set(key, g)
      }
      return [...map.values()]
    },
    async rpc(name, args) {
      if (name === 'create_user') {
        const username = args.p_username.trim().toLowerCase()
        if (state.profiles.some((p) => p.username === username)) throw new Error('Korisničko ime je zauzeto.')
        const id = uuid()
        state.profiles.push({ id, username, full_name: args.p_full_name.trim(), role: args.p_role, active: true })
        persist()
        return id
      }
      if (name === 'set_user_secret') return null
      if (name === 'delete_user') {
        if (used(args.p_user, 'profiles')) throw new Error('Korisnik ima unose ili naloge pa se ne može obrisati. Deaktivirajte ga.')
        state.profiles = state.profiles.filter((p) => p.id !== args.p_user)
        for (const v of state.vehicles) if (v.default_driver_id === args.p_user) v.default_driver_id = null
        persist()
        return null
      }
      throw new Error(`Nepoznata funkcija ${name}`)
    },
    insert: async (table, row) => insert(table, row),
    async upsert(table, row, onConflict) {
      if (!navigator.onLine) return offline()
      const cols = onConflict.split(',')
      const existing = state[table].find((r) => cols.every((c) => r[c] === row[c]))
      if (!existing) return insert(table, row)
      if (locked(existing)) return denied()
      Object.assign(existing, row, { updated_at: new Date().toISOString() })
      persist()
      return { error: null, status: 200 }
    },
    async create(table, row) {
      const res = insert(table, row)
      if (res.error) throw new Error(res.error.code === '23505' ? 'Takav zapis već postoji.' : 'Spremanje nije uspjelo.')
      return { ...state[table][state[table].length - 1] }
    },
    async update(table, id, patch) {
      const row = state[table].find((r) => r.id === id)
      if (!row || (ENTRY_TABLES.includes(table) && (locked(row) || locked({ ...row, ...patch })))) throw new Error(LOCKED)
      const old = { ...row }
      Object.assign(row, patch, ENTRY_TABLES.includes(table) ? { updated_at: new Date().toISOString() } : {})
      audit(table, 'update', old, { ...row })
      persist()
      return { ...row }
    },
    async remove(table, id) {
      const row = state[table].find((r) => r.id === id)
      if (!row || (ENTRY_TABLES.includes(table) && locked(row))) throw new Error(LOCKED)
      if (used(id, table)) throw new Error('Stavka se koristi u unosima ili nalozima pa se ne može obrisati. Umjesto toga je deaktivirajte.')
      state[table] = state[table].filter((r) => r.id !== id)
      audit(table, 'delete', row)
      persist()
      return { id }
    },
    async upload(path, blob) {
      if (!navigator.onLine) return offline()
      photos.set(path, URL.createObjectURL(blob))
      return { error: null }
    },
    async signedUrl(path) {
      if (!photos.has(path)) throw new Error('U demu se fotografije čuvaju samo dok je aplikacija otvorena.')
      return photos.get(path)
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    reset() {
      localStorage.removeItem(KEY)
      localStorage.removeItem(SESSION)
    },
  }
}
