// Pristup Supabaseu. Sve što aplikacija radi s bazom prolazi kroz ovih nekoliko funkcija.
import { createClient } from '@supabase/supabase-js'

const PAGE = 1000
const MESSAGES = {
  42501: 'Nemate pravo na ovu radnju ili je razdoblje zaključano.',
  23505: 'Takav zapis već postoji.',
  23503: 'Zapis se koristi u unosima pa se ne može obrisati.',
  23514: 'Vrijednost nije ispravna.',
}

function toError(error) {
  const message = String(error?.message ?? error)
  // Poruke iz vlastitih funkcija u bazi (raise exception) već su na hrvatskom.
  const own = ['P0001', '22023'].includes(error?.code)
  const text = own
    ? message
    : MESSAGES[error?.code] ?? (/fetch|network|load failed/i.test(message) ? 'Nema veze s poslužiteljem. Pokušajte ponovno.' : message)
  return Object.assign(new Error(text), { code: error?.code })
}

export function createSupabaseDb(url, key) {
  const supabase = createClient(url, key)
  let channels = 0

  function build(table, { columns = '*', eq = {}, gte = {}, lte = {}, order = [] }) {
    let q = supabase.from(table).select(columns)
    for (const [k, v] of Object.entries(eq)) q = q.eq(k, v)
    for (const [k, v] of Object.entries(gte)) q = q.gte(k, v)
    for (const [k, v] of Object.entries(lte)) q = q.lte(k, v)
    for (const [col, ascending = true] of order) q = q.order(col, { ascending })
    return q.order('id') // stabilan redoslijed za dohvat u stranicama
  }

  // Dohvaća sve retke, stranicu po stranicu, pa se popisi i izvještaji ne režu na 1000.
  async function paged(makeQuery) {
    const rows = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await makeQuery().range(from, from + PAGE - 1)
      if (error) throw toError(error)
      rows.push(...data)
      if (data.length < PAGE) return rows
    }
  }

  const changed = async (query, missing) => {
    const { data, error } = await query
    if (error) throw toError(error)
    if (!data.length) throw new Error(missing)
    return data[0]
  }
  const LOCKED = 'Unos se više ne može mijenjati: zaključan je ili je prošao rok za ispravak.'

  return {
    demo: false,
    auth: {
      async getSession() {
        const { data, error } = await supabase.auth.getSession()
        if (data?.session) return { userId: data.session.user.id }
        return { userId: null, transient: !navigator.onLine || error?.name === 'AuthRetryableFetchError' }
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (!error) return null
        if (/invalid login credentials/i.test(error.message)) return 'Pogrešno korisničko ime ili PIN.'
        if (error.name === 'AuthRetryableFetchError' || /fetch|network/i.test(error.message)) {
          return 'Nema veze s poslužiteljem. Za prvu prijavu treba signal.'
        }
        return error.message
      },
      async signOut() {
        const { error } = await supabase.auth.signOut()
        // Bez signala Supabase ne obriše lokalnu sesiju, pa je brišemo sami.
        if (error) {
          Object.keys(localStorage)
            .filter((k) => /^sb-.*-auth-token$/.test(k))
            .forEach((k) => localStorage.removeItem(k))
        }
      },
      onChange(cb) {
        // setTimeout: iz ovog se poziva ne smiju izravno zvati druge auth funkcije.
        const { data } = supabase.auth.onAuthStateChange((event) => setTimeout(() => cb(event), 0))
        return () => data.subscription.unsubscribe()
      },
    },
    select: (table, opts = {}) => paged(() => build(table, opts)),
    rpcAll: (name, args) => paged(() => supabase.rpc(name, args)),
    async rpc(name, args) {
      const { data, error } = await supabase.rpc(name, args)
      if (error) throw toError(error)
      return data
    },
    // insert i upsert ne bacaju grešku: red čekanja sam odlučuje što s odgovorom.
    async insert(table, row) {
      const { error, status } = await supabase.from(table).insert(row)
      return { error, status }
    },
    async upsert(table, row, onConflict) {
      const { error, status } = await supabase.from(table).upsert(row, { onConflict })
      return { error, status }
    },
    create: (table, row) => changed(supabase.from(table).insert(row).select(), 'Spremanje nije uspjelo.'),
    update: (table, id, patch) => changed(supabase.from(table).update(patch).eq('id', id).select(), LOCKED),
    remove: (table, id) => changed(supabase.from(table).delete().eq('id', id).select('id'), LOCKED),
    async upload(path, blob) {
      const { error } = await supabase.storage.from('otpremnice').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
      // Datoteka već postoji: prethodno slanje je uspjelo.
      if (!error || String(error.statusCode) === '409' || /already exists/i.test(error.message)) return { error: null }
      return { error, status: Number(error.statusCode) || 0 }
    },
    async signedUrl(path) {
      const { data, error } = await supabase.storage.from('otpremnice').createSignedUrl(path, 300)
      if (error) throw toError(error)
      return data.signedUrl
    },
    subscribe(cb) {
      const channel = supabase
        .channel(`kiperlog-${++channels}`)
        .on('postgres_changes', { event: '*', schema: 'public' }, () => cb())
        .subscribe()
      return () => supabase.removeChannel(channel)
    },
  }
}
