import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import { Icon, useLoad } from '../../components/ui'
import { db } from '../../lib/db'
import Dashboard from './Dashboard'
import Entries from './Entries'
import Lists from './Lists'
import Lock from './Lock'
import Orders from './Orders'
import Reports from './Reports'
import Review from './Review'

const NAV = [
  ['/', 'chart', 'Pregled'], ['/obrada', 'alert', 'Za obradu'], ['/unosi', 'list', 'Unosi'], ['/nalozi', 'order', 'Nalozi'],
  ['/popisi', 'truck', 'Popisi'], ['/izvjestaji', 'file', 'Izvještaji'], ['/zakljucavanje', 'lock', 'Zaključavanje'],
]

// Broj unosa koje su vozači upisali pod "Ostalo" i koji čekaju ured.
function usePending() {
  const { data, reload } = useLoad(async () => {
    const [r, m] = await Promise.all([db.select('rides', { eq: { needs_review: true } }), db.select('machine_logs', { eq: { needs_review: true } })])
    return r.length + m.length
  }, [])
  useEffect(() => {
    let timer
    const off = db.subscribe(() => (clearTimeout(timer), (timer = setTimeout(reload, 1000))))
    return () => (clearTimeout(timer), off())
  }, [reload])
  return data ?? 0
}

export default function Office() {
  const pending = usePending()
  return (
    <>
      <nav className="officenav">
        {NAV.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Icon name={icon} size={18} /> {label}
            {to === '/obrada' && pending > 0 && <span className="chip accent">{pending}</span>}
          </NavLink>
        ))}
      </nav>
      <main className="page wide">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/obrada" element={<Review />} />
          <Route path="/unosi" element={<Entries />} />
          <Route path="/nalozi" element={<Orders />} />
          <Route path="/popisi" element={<Lists />} />
          <Route path="/izvjestaji" element={<Reports />} />
          <Route path="/zakljucavanje" element={<Lock />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}
