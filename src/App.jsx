import { lazy, Suspense } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Banner, ConfirmProvider, Icon, ToastProvider, useConfirm } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import { configProblem, db } from './lib/db'
import { ListsProvider } from './lib/lists'
import { outbox, useOnline, useOutbox } from './lib/sync'
import Login from './pages/Login'
import Fuel from './pages/driver/Fuel'
import History from './pages/driver/History'
import Machine from './pages/driver/Machine'
import Today from './pages/driver/Today'
import { VehicleProvider } from './pages/driver/vehicle'

// Uredski dio se učitava tek kad zatreba, da vozačev dio ostane malen i brz.
const Office = lazy(() => import('./pages/office/Office'))

function TopBar() {
  const { me, signOut } = useAuth()
  const online = useOnline()
  const confirm = useConfirm()
  const { items } = useOutbox()
  const leave = async () => {
    const waiting = items.length
      ? `Na mobitelu ${items.length === 1 ? 'je 1 unos koji još nije poslan' : `je ${items.length} unosa koji još nisu poslani`}. Ostaju spremljeni i poslat će se kad se ponovno prijavite. Odjaviti se?`
      : 'Odjaviti se?'
    if (await confirm(waiting, 'Odjava')) signOut()
  }
  return (
    <header className="topbar">
      <span className="brand"><span className="brand-mark">K</span> <span className="brand-name">KiperLog</span></span>
      <span className="who grow">{me.full_name}</span>
      {db.demo && <span className="chip accent">Demo</span>}
      {!online && <span className="chip warn"><Icon name="offline" size={14} /> Bez signala</span>}
      <button type="button" className="ghost" onClick={leave} aria-label="Odjava"><Icon name="logout" /></button>
    </header>
  )
}

// Stanje slanja: što čeka signal i što je server odbio.
function SyncStatus() {
  const { pending, failed } = useOutbox()
  const online = useOnline()
  if (!pending.length && !failed.length) return null
  return (
    <>
      {pending.length > 0 && (
        <Banner kind="warn" icon="clock">
          <strong>Čeka slanje: {pending.length}.</strong>{' '}
          {online ? 'Šalje se…' : 'Unosi su na mobitelu i poslat će se sami kad bude signala.'}
          {online && <> <button type="button" className="btn small" onClick={() => outbox.flush()}>Pošalji sada</button></>}
        </Banner>
      )}
      {failed.length > 0 && (
        <Banner kind="danger" icon="alert">
          <strong>Server je odbio {failed.length === 1 ? 'jedan unos' : `${failed.length} unosa`}.</strong> Otvorite unos s oznakom
          „Odbijeno” da vidite razlog.
        </Banner>
      )}
    </>
  )
}

function Driver() {
  const tab = ({ isActive }) => (isActive ? 'active' : undefined)
  return (
    <VehicleProvider>
      <TopBar />
      <main className="page">
        <SyncStatus />
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/gorivo" element={<Fuel />} />
          <Route path="/stroj" element={<Machine />} />
          <Route path="/unosi" element={<History />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar">
        <NavLink to="/" end className={tab}><Icon name="home" /> Danas</NavLink>
        <NavLink to="/gorivo" className={tab}><Icon name="fuel" /> Gorivo</NavLink>
        <NavLink to="/stroj" className={tab}><Icon name="machine" /> Stroj</NavLink>
        <NavLink to="/unosi" className={tab}><Icon name="list" /> Moji unosi</NavLink>
      </nav>
    </VehicleProvider>
  )
}

function Shell() {
  const { me, signOut } = useAuth()
  if (me === undefined) return <p className="center">Učitavanje…</p>
  if (!me) return <Login />
  if (!me.active) {
    return (
      <div className="login">
        <Banner kind="warn" icon="lock">Račun još nije aktiviran ili je deaktiviran. Javite se uredu.</Banner>
        <button type="button" className="btn" onClick={signOut}>Odjava</button>
      </div>
    )
  }
  return (
    <ListsProvider>
      {me.role === 'ured' ? (
        <Suspense fallback={<p className="center">Učitavanje…</p>}>
          <TopBar />
          <Office />
        </Suspense>
      ) : (
        <Driver />
      )}
    </ListsProvider>
  )
}

export default function App() {
  if (configProblem) {
    return (
      <div className="login">
        <Banner kind="danger" icon="alert">
          <strong>Aplikacija nije dobro postavljena.</strong><br />{configProblem}
          <br />Ispravite varijable u postavkama objave (Vercel → Settings → Environment Variables) i napravite Redeploy.
        </Banner>
      </div>
    )
  }
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
