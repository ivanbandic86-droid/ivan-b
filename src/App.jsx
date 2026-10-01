import { Navigate, Route, Routes, NavLink } from 'react-router-dom'
import { configured } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/useAuth'
import Login from './pages/Login'
import DriverEntry from './pages/DriverEntry'
import Deliveries from './pages/Deliveries'
import Lists from './pages/Lists'
import Reports from './pages/Reports'

function Shell() {
  const { session, profile, signOut } = useAuth()
  if (session === undefined) return <p className="center">Učitavanje…</p>
  if (!session) return <Login />
  if (!profile) return <p className="center">Učitavanje profila…</p>
  if (!profile.active) return <p className="center">Račun je deaktiviran.</p>

  const office = profile.role === 'ured'
  return (
    <>
      <header>
        <strong>{profile.full_name}</strong>
        <nav>
          {office ? (
            <>
              <NavLink to="/isporuke">Isporuke</NavLink>
              <NavLink to="/popisi">Popisi</NavLink>
              <NavLink to="/izvjestaji">Izvještaji</NavLink>
            </>
          ) : (
            <NavLink to="/unos">Unos</NavLink>
          )}
          <button className="link" onClick={signOut}>Odjava</button>
        </nav>
      </header>
      <main>
        <Routes>
          {office ? (
            <>
              <Route path="/isporuke" element={<Deliveries />} />
              <Route path="/popisi" element={<Lists />} />
              <Route path="/izvjestaji" element={<Reports />} />
              <Route path="*" element={<Navigate to="/isporuke" replace />} />
            </>
          ) : (
            <>
              <Route path="/unos" element={<DriverEntry />} />
              <Route path="*" element={<Navigate to="/unos" replace />} />
            </>
          )}
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  if (!configured) {
    return (
      <p className="center">
        Nedostaju postavke baze. Kopirajte <code>.env.example</code> u <code>.env</code> i upišite
        Supabase URL i ključ.
      </p>
    )
  }
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
