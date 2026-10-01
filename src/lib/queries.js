import { supabase } from './supabase'

export const DELIVERY_SELECT =
  '*, driver:profiles(full_name), vehicle:vehicles(plate,kind), material:materials(name,unit), client:clients(name), site:sites(name)'

export async function fetchDeliveries(from, to) {
  let q = supabase
    .from('deliveries')
    .select(DELIVERY_SELECT)
    .order('delivery_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (from) q = q.gte('delivery_date', from)
  if (to) q = q.lte('delivery_date', to)
  const { data, error } = await q
  if (error) throw error
  return data
}

export const unitLabel = (u) => (u === 'm3' ? 'm³' : 't')
