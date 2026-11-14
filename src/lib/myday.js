import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth'
import { db } from './db'
import { useOutbox } from './sync'

const EMPTY = { rides: [], fuel: [], days: [], machines: [], orders: [] }
const cacheKey = (uid) => `kiperlog.day.${uid}`

function readCache(uid, date) {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(uid)))
    return c?.date === date ? c.data : EMPTY
  } catch {
    return EMPTY
  }
}

// Vozačev dan: ono što je na serveru (uz kopiju na mobitelu za rad bez signala)
// spojeno s unosima koji još čekaju slanje.
export function useMyDay(date) {
  const { me } = useAuth()
  const { items } = useOutbox()
  const [server, setServer] = useState(() => readCache(me.id, date))

  const reload = useCallback(async () => {
    try {
      const mine = { eq: { driver_id: me.id, work_date: date } }
      const [rides, fuel, days, machines, orders] = await Promise.all([
        db.select('rides', { ...mine, order: [['ride_at']] }),
        db.select('fuel_entries', { ...mine, order: [['fueled_at']] }),
        db.select('day_logs', mine),
        db.select('machine_logs', { ...mine, order: [['created_at']] }),
        db.select('work_orders', { ...mine, order: [['created_at']] }),
      ])
      const data = { rides, fuel, days, machines, orders }
      localStorage.setItem(cacheKey(me.id), JSON.stringify({ date, data }))
      setServer(data)
    } catch {
      setServer(readCache(me.id, date))
    }
  }, [me.id, date])

  // Ponovno učitaj kad se promijeni red čekanja (unos je upravo poslan).
  useEffect(() => { reload() }, [reload, items.length])

  return useMemo(() => {
    const queued = (kind) =>
      items
        .filter((i) => i.kind === kind && i.row.work_date === date)
        .map((i) => ({ ...i.row, _outbox: i.id, _error: i.error }))
    const merge = (rows, kind) => {
      const extra = queued(kind).filter((q) => !rows.some((r) => r.id === q.id))
      return [...rows, ...extra]
    }
    // Dnevni unos koji čeka slanje zamjenjuje onaj sa servera za isto vozilo.
    const pendingDays = queued('day')
    const days = [
      ...server.days.filter((d) => !pendingDays.some((p) => p.vehicle_id === d.vehicle_id)),
      ...pendingDays,
    ]
    return {
      rides: merge(server.rides, 'ride'),
      fuel: merge(server.fuel, 'fuel'),
      machines: merge(server.machines, 'machine'),
      days,
      orders: server.orders.filter((o) => o.status !== 'otkazan'),
      reload,
    }
  }, [server, items, date, reload])
}
