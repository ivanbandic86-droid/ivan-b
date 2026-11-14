import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { db } from './db'

const CACHE = 'kiperlog.lists'
const TABLES = ['vehicles', 'materials', 'clients', 'sites', 'locations']
const EMPTY = { vehicles: [], materials: [], clients: [], sites: [], locations: [], users: [] }
const ListsCtx = createContext(null)
export const useLists = () => useContext(ListsCtx)

const readCache = () => {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(CACHE)) }
  } catch {
    return EMPTY
  }
}

export const KIND_LABEL = {
  kamenolom: 'Kamenolom', betonara: 'Betonara', asfaltna_baza: 'Asfaltna baza',
  deponij: 'Deponij', skladiste: 'Skladište', ostalo: 'Ostalo',
}

// Popisi (vozila, materijali, gradilišta…) se čuvaju na mobitelu, pa obrasci rade i bez signala.
export function ListsProvider({ children }) {
  const { me } = useAuth()
  const [lists, setLists] = useState(readCache)
  const [ready, setReady] = useState(false)

  const reload = useCallback(async () => {
    try {
      const names = me.role === 'ured' ? [...TABLES, 'profiles'] : TABLES
      const data = await Promise.all(names.map((t) => db.select(t)))
      const fresh = { ...EMPTY }
      names.forEach((t, i) => (fresh[t === 'profiles' ? 'users' : t] = data[i]))
      localStorage.setItem(CACHE, JSON.stringify(fresh))
      setLists(fresh)
    } catch {
      // bez signala ostaje zadnja spremljena kopija
    } finally {
      setReady(true)
    }
  }, [me.role])

  useEffect(() => { reload() }, [reload])

  const value = useMemo(() => {
    const index = (rows) => new Map(rows.map((r) => [r.id, r]))
    const by = Object.fromEntries(Object.entries(lists).map(([k, rows]) => [k, index(rows)]))
    const sorted = (rows, key) => [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key]), 'hr'))
    const active = (rows, key, keep) => sorted(rows.filter((r) => r.active || r.id === keep), key)
    return {
      lists, ready, reload,
      vehicle: (id) => by.vehicles.get(id),
      vehicleName: (id) => by.vehicles.get(id)?.code ?? '–',
      siteName: (id) => by.sites.get(id)?.name ?? '–',
      materialName: (id) => by.materials.get(id)?.name ?? '–',
      material: (id) => by.materials.get(id),
      locationName: (id) => by.locations.get(id)?.name ?? '',
      clientName: (id) => by.clients.get(id)?.name ?? '',
      userName: (id) => by.users.get(id)?.full_name ?? (id === me.id ? me.full_name : '–'),
      // Opcije za padajuće izbornike: samo aktivne stavke, uz trenutno odabranu.
      options: {
        vehicles: (keep, category) =>
          active(lists.vehicles.filter((v) => !category || v.category === category), 'code', keep)
            .map((v) => [v.id, v.name ? `${v.code} · ${v.name}` : v.code]),
        materials: (keep) => active(lists.materials, 'name', keep).map((m) => [m.id, m.name]),
        sites: (keep) => active(lists.sites, 'name', keep).map((s) => [s.id, s.name]),
        locations: (keep) => active(lists.locations, 'name', keep).map((l) => [l.id, l.name]),
        clients: (keep) => active(lists.clients, 'name', keep).map((c) => [c.id, c.name]),
        drivers: (keep) => active(lists.users, 'full_name', keep).map((u) => [u.id, u.full_name]),
      },
    }
  }, [lists, ready, reload, me])

  return <ListsCtx.Provider value={value}>{children}</ListsCtx.Provider>
}
