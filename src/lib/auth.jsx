import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { db } from './db'
import { outbox, setOwner } from './sync'

const CACHE = 'kiperlog.me'
const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE))
  } catch {
    return null
  }
}

// Korisničko ime bez "@" pripada računu koji je otvorio ured.
export const toEmail = (identifier) => {
  const id = identifier.trim().toLowerCase()
  return id.includes('@') ? id : `${id}@kiperlog.local`
}

export function AuthProvider({ children }) {
  // undefined = još se provjerava, null = nije prijavljen
  const [me, setMe] = useState(undefined)

  const load = useCallback(async () => {
    const cached = readCache()
    const { userId, transient } = await db.auth.getSession()
    if (!userId) {
      // Bez signala se sesija ne može obnoviti. Zadnji prijavljeni vozač nastavlja
      // raditi, a unosi čekaju u redu dok se veza ne vrati.
      if (transient && cached) return setMe(cached)
      localStorage.removeItem(CACHE)
      return setMe(null)
    }
    try {
      const [profile] = await db.select('profiles', { eq: { id: userId } })
      if (!profile) throw new Error('Profil ne postoji.')
      localStorage.setItem(CACHE, JSON.stringify(profile))
      setMe(profile)
    } catch {
      // Profil se ne može dohvatiti (nema signala): koristi zadnji poznati.
      setMe(cached?.id === userId ? cached : null)
    }
  }, [])

  useEffect(() => {
    load()
    const off = db.auth.onChange((event) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(CACHE)
        setMe(null)
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        load().then(() => outbox.flush())
      }
    })
    window.addEventListener('online', load)
    return () => {
      off()
      window.removeEventListener('online', load)
    }
  }, [load])

  setOwner(me?.id ?? null)

  const signIn = (identifier, secret) => db.auth.signIn(toEmail(identifier), secret)
  const signOut = async () => {
    localStorage.removeItem(CACHE)
    await db.auth.signOut()
    setMe(null)
  }

  return <AuthCtx.Provider value={{ me, signIn, signOut, reload: load }}>{children}</AuthCtx.Provider>
}
