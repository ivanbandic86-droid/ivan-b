import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Icon } from '../../components/ui'
import Dashboard from './Dashboard'
import Entries from './Entries'
import Lists from './Lists'
import Lock from './Lock'
import Orders from './Orders'
import Reports from './Reports'

const NAV = [
  ['/', 'chart', 'Pregled'], ['/unosi', 'list', 'Unosi'], ['/nalozi', 'order', 'Nalozi'],
  ['/popisi', 'truck', 'Popisi'], ['/izvjestaji', 'file', 'Izvještaji'], ['/zakljucavanje', 'lock', 'Zaključavanje'],
]

export default function Office() {
  return (
    <>
      <nav className="officenav">
        {NAV.map(([to, icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Icon name={icon} size={18} /> {label}
          </NavLink>
        ))}
      </nav>
      <main className="page wide">
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
