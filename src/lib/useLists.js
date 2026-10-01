import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { cacheLists, getCachedLists } from './offlineQueue'

// Učitava popise; bez interneta koristi zadnju spremljenu kopiju.
export function useLists() {
  const [lists, setLists] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const [v, m, c, s] = await Promise.all([
          supabase.from('vehicles').select('*').eq('active', true).order('plate'),
          supabase.from('materials').select('*').eq('active', true).order('name'),
          supabase.from('clients').select('*').eq('active', true).order('name'),
          supabase.from('sites').select('*').eq('active', true).order('name'),
        ])
        if ([v, m, c, s].some((r) => r.error)) throw new Error('load')
        const fresh = { vehicles: v.data, materials: m.data, clients: c.data, sites: s.data }
        await cacheLists(fresh)
        if (alive) setLists(fresh)
      } catch {
        const cached = await getCachedLists()
        if (alive) setLists(cached ?? { vehicles: [], materials: [], clients: [], sites: [] })
      }
    }
    load()
    return () => { alive = false }
  }, [])

  return lists
}
