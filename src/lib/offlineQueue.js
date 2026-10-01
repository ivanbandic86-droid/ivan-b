import { get, set } from 'idb-keyval'
import { supabase } from './supabase'

const QUEUE_KEY = 'pending-deliveries'
const LISTS_KEY = 'cached-lists'

export const getQueue = async () => (await get(QUEUE_KEY)) ?? []

export async function enqueue(delivery) {
  const q = await getQueue()
  await set(QUEUE_KEY, [...q, delivery])
}

// Salje cekajuce unose. Unos ostaje u redu dok ga server ne potvrdi.
// Isti id znaci da ponovno slanje ne stvara duplikat (23505 = vec spremljeno).
export async function flushQueue() {
  const q = await getQueue()
  const remaining = []
  for (const item of q) {
    const { error } = await supabase.from('deliveries').insert(item)
    if (error && error.code !== '23505') remaining.push(item)
  }
  await set(QUEUE_KEY, remaining)
  return { sent: q.length - remaining.length, left: remaining.length }
}

export const cacheLists = (lists) => set(LISTS_KEY, lists)
export const getCachedLists = () => get(LISTS_KEY)
