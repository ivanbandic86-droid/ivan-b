import { createDemoDb } from './db.demo'
import { createSupabaseDb } from './db.supabase'

// Iz adrese se uzima samo početni dio (https://projekt.supabase.co). Supabase na nekim
// mjestima prikazuje adresu s dodatkom /rest/v1/, a s njim prijava ne radi. Adresa bez
// https:// također se prihvaća.
export function projectUrl(value) {
  let text = String(value ?? '').trim()
  if (!text) return ''
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`
  try {
    const { origin, hostname } = new URL(text)
    return hostname.includes('.') ? origin : ''
  } catch {
    return ''
  }
}

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
const url = projectUrl(rawUrl)

// Demo način samo kad nijedna varijabla nije postavljena. Ako je postavljena samo jedna ili
// neispravna, to je greška u postavkama i prikazuje se poruka, a ne lažni demo.
export const configProblem =
  !rawUrl && !rawKey ? null
  : !rawUrl ? 'Nedostaje varijabla VITE_SUPABASE_URL.'
  : !rawKey ? 'Nedostaje varijabla VITE_SUPABASE_ANON_KEY.'
  : !url ? 'Varijabla VITE_SUPABASE_URL nije ispravna adresa (treba izgledati kao https://projekt.supabase.co).'
  : /^(service_role|sb_secret_)/i.test(rawKey) ? 'Upisan je tajni ključ. Treba upisati javni ključ (anon ili sb_publishable_…).'
  : null

export const db = !configProblem && url ? createSupabaseDb(url, rawKey) : createDemoDb()
