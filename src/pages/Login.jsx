import { useState } from 'react'
import { Banner, Field, Seg } from '../components/ui'
import { useAuth } from '../lib/auth'
import { db } from '../lib/db'

const ROLE = 'kiperlog.loginRole'
const USER = 'kiperlog.loginUser'

export default function Login() {
  const { signIn } = useAuth()
  const [role, setRole] = useState(() => localStorage.getItem(ROLE) ?? 'vozac')
  const [user, setUser] = useState(() => localStorage.getItem(USER) ?? '')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const driver = role === 'vozac'

  const enter = async (identifier, pass) => {
    setError('')
    setBusy(true)
    const problem = await signIn(identifier, pass)
    setBusy(false)
    if (problem) return setError(problem)
    localStorage.setItem(ROLE, role)
    localStorage.setItem(USER, identifier.trim())
  }

  return (
    <div className="login">
      <div className="brand" style={{ fontSize: '1.6rem' }}>
        <span className="brand-mark" style={{ width: 44, height: 44, fontSize: '1.5rem' }}>K</span> KiperLog
      </div>
      <p className="muted">Evidencija vožnji, goriva i rada strojeva.</p>

      {db.demo && (
        <Banner kind="warn" icon="alert">
          <strong>Demo način.</strong> Baza nije spojena, podaci su primjeri i ostaju samo u ovom pregledniku.
          <div className="row wrap" style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={() => enter('marko', 'demo')}>Uđi kao vozač</button>
            <button type="button" className="btn small" onClick={() => enter('josip', 'demo')}>Uđi kao strojar</button>
            <button type="button" className="btn small" onClick={() => enter('ured', 'demo')}>Uđi kao ured</button>
          </div>
        </Banner>
      )}

      <form className="card" onSubmit={(e) => (e.preventDefault(), enter(user, secret))}>
        <Seg value={role} onChange={(r) => (setRole(r), setSecret(''))} options={[['vozac', 'Vozač'], ['ured', 'Ured']]} />
        <Field label={driver ? 'Korisničko ime' : 'Korisničko ime ili e-mail'}>
          <input value={user} onChange={(e) => setUser(e.target.value)} required autoCapitalize="none" autoCorrect="off"
            autoComplete="username" spellCheck="false" />
        </Field>
        <Field label={driver ? 'PIN' : 'Lozinka'}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required
            inputMode={driver ? 'numeric' : undefined} autoComplete="current-password" />
        </Field>
        {error && <Banner kind="danger" icon="alert">{error}</Banner>}
        <button className="btn primary huge block" disabled={busy}>{busy ? 'Prijava…' : 'Prijava'}</button>
      </form>
      <p className="small muted">Račun i PIN dobivate od ureda. Ako ste zaboravili PIN, ured vam može postaviti novi.</p>
    </div>
  )
}
