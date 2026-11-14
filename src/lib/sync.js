// Povezuje red čekanja s bazom i sa spremištem na mobitelu.
import { createStore, del, set, values } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { db } from './db'
import { createOutbox, memoryStore } from './outbox'

const TABLE = { ride: 'rides', fuel: 'fuel_entries', machine: 'machine_logs' }

function deviceStore() {
  // Bez IndexedDB-a (npr. privatni način nekih preglednika) unosi žive dok je aplikacija otvorena.
  if (typeof indexedDB === 'undefined') return memoryStore()
  const idb = createStore('kiperlog', 'outbox')
  return {
    all: () => values(idb),
    put: (item) => set(item.id, item, idb),
    del: (id) => del(id, idb),
  }
}

let owner = null
export const setOwner = (id) => {
  owner = id
}

async function send(item) {
  // Bez valjane prijave ništa se ne šalje; unos čeka da se sesija obnovi.
  const { userId } = await db.auth.getSession()
  if (!userId) return { error: { message: 'network: nema sesije' }, status: 401 }
  if (item.photo) {
    const up = await db.upload(item.row.photo_path, item.photo)
    if (up.error) return up
  }
  if (item.kind === 'day') return db.upsert('day_logs', item.row, 'driver_id,vehicle_id,work_date')
  return db.insert(TABLE[item.kind], item.row)
}

let snapshot = []
const listeners = new Set()
async function refresh() {
  snapshot = await outbox.list()
  listeners.forEach((cb) => cb())
}

export const outbox = createOutbox({
  store: deviceStore(),
  send,
  // Bez prijavljenog korisnika se ništa ne šalje: unosi čekaju svog vozača.
  isOnline: () => navigator.onLine && owner !== null,
  owner: () => owner,
  onChange: () => void refresh(),
})

// Sprema unos na mobitel i odmah ga pokušava poslati. Vraća stvarno stanje:
// 'sent' (server potvrdio), 'queued' (čeka signal) ili { failed: razlog }.
export async function submit(item) {
  await outbox.add(item)
  await outbox.flush()
  const left = (await outbox.list()).find((i) => i.id === item.id)
  if (!left) return 'sent'
  return left.error ? { failed: left.error } : 'queued'
}

export function startSync() {
  void refresh()
  const flush = () => void outbox.flush()
  window.addEventListener('online', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && flush())
  setInterval(() => snapshot.some((i) => !i.error) && flush(), 30_000)
  flush()
}

export function useOutbox() {
  const items = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => snapshot,
  )
  const mine = owner ? items.filter((i) => i.row.driver_id === owner) : items
  return {
    items: mine,
    pending: mine.filter((i) => !i.error),
    failed: mine.filter((i) => i.error),
  }
}

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb)
      window.addEventListener('offline', cb)
      return () => {
        window.removeEventListener('online', cb)
        window.removeEventListener('offline', cb)
      }
    },
    () => navigator.onLine,
  )
}
