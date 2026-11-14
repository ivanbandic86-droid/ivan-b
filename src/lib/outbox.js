// Red čekanja za unose napravljene bez signala.
//
// Svaki unos se sprema pod vlastitim ključem, pa novi unos nikad ne prepisuje
// red koji se upravo šalje. Unos se briše tek kad ga server potvrdi. Unosi koje
// server trajno odbije ostaju vidljivi vozaču s razlogom, umjesto da se šalju u
// beskonačnost ili tiho nestanu.

const REASONS = {
  42501: 'Unos nije dopušten: razdoblje je zaključano ili račun nema pravo.',
  23503: 'Stavka s popisa (vozilo, gradilište ili materijal) više ne postoji.',
  23514: 'Vrijednost nije ispravna (količina, kilometri ili sati).',
  23502: 'Nedostaje obavezan podatak.',
}

// Odlučuje što s odgovorom servera: 'done' (spremljeno), 'retry' (pokušaj kasnije)
// ili { failed: razlog } (server je unos trajno odbio).
export function classify(result, online = true) {
  const error = result?.error
  if (!error) return 'done'
  const code = String(error.code ?? '')
  // Isti id već postoji: prethodno slanje je uspjelo, samo odgovor nije stigao.
  if (code === '23505') return 'done'
  if (!online) return 'retry'
  const status = Number(result.status ?? error.status ?? error.statusCode ?? 0)
  const message = String(error.message ?? error)
  if (!status && /fetch|network|load failed|timeout|abort/i.test(message)) return 'retry'
  if (status === 401 || status === 408 || status === 429 || status >= 500) return 'retry'
  return { failed: REASONS[code] ?? message }
}

export function createOutbox({ store, send, isOnline = () => true, owner = () => null, onChange = () => {} }) {
  let running = null
  let dirty = false

  const list = async () => (await store.all()).sort((a, b) => a.createdAt - b.createdAt)

  async function add(item) {
    await store.put({ attempts: 0, error: null, createdAt: Date.now(), ...item })
    dirty = true
    onChange()
  }

  async function remove(id) {
    await store.del(id)
    onChange()
  }

  async function retry(id) {
    const item = (await store.all()).find((i) => i.id === id)
    if (!item) return
    await store.put({ ...item, error: null })
    onChange()
    return flush()
  }

  async function pass() {
    for (const item of await list()) {
      if (item.error) continue
      // Unosi drugog korisnika na istom mobitelu čekaju njegovu prijavu.
      if (owner() && item.row.driver_id !== owner()) continue
      let outcome
      try {
        outcome = classify(await send(item), isOnline())
      } catch (e) {
        outcome = classify({ error: e }, isOnline())
      }
      if (outcome === 'done') {
        await store.del(item.id)
        onChange()
      } else if (outcome === 'retry') {
        return false
      } else {
        await store.put({ ...item, attempts: item.attempts + 1, error: outcome.failed })
        onChange()
      }
    }
    return true
  }

  // Istovremeni pozivi dijele isto slanje. Ako je tijekom slanja dodan novi unos,
  // prolaz se ponavlja.
  function flush() {
    if (running) return running
    const run = async () => {
      if (!isOnline()) return
      do {
        dirty = false
        if (!(await pass())) return
      } while (dirty)
    }
    // finally se izvršava tek nakon dodjele, pa `running` ne ostaje zauvijek postavljen.
    running = run().finally(() => {
      running = null
    })
    return running
  }

  return { add, remove, retry, list, flush }
}

export function memoryStore() {
  const map = new Map()
  return {
    all: async () => [...map.values()],
    put: async (item) => void map.set(item.id, item),
    del: async (id) => void map.delete(id),
  }
}
