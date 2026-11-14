import { createDemoDb } from './db.demo'
import { createSupabaseDb } from './db.supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Bez postavki baze aplikacija radi u demo načinu s primjerima podataka.
export const db = url && key ? createSupabaseDb(url, key) : createDemoDb()
