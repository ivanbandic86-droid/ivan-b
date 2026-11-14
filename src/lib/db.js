import { createDemoDb } from './db.demo'
import { createSupabaseDb } from './db.supabase'

// Iz adrese se uzima samo početni dio (https://projekt.supabase.co). Supabase na nekim
// mjestima prikazuje adresu s dodatkom /rest/v1/, a s njim prijava ne radi.
function projectUrl(value) {
  try {
    return new URL(String(value ?? '').trim()).origin
  } catch {
    return ''
  }
}

const url = projectUrl(import.meta.env.VITE_SUPABASE_URL)
const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

// Bez postavki baze aplikacija radi u demo načinu s primjerima podataka.
export const db = url && key ? createSupabaseDb(url, key) : createDemoDb()
