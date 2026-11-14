import { createContext, useContext, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { useLists } from '../../lib/lists'

const VehicleCtx = createContext(null)
export const useVehicle = () => useContext(VehicleCtx)

// Vozilo kojim vozač danas vozi: zadnji odabir, inače vozilo koje mu je ured dodijelio.
export function VehicleProvider({ children }) {
  const { me } = useAuth()
  const L = useLists()
  const key = `kiperlog.vehicle.${me.id}`
  const [picked, setPicked] = useState(() => localStorage.getItem(key))
  const usable = (id) => L.lists.vehicles.some((v) => v.id === id && v.active && v.category === 'vozilo')
  const assigned = L.lists.vehicles.find((v) => v.default_driver_id === me.id && v.active && v.category === 'vozilo')?.id
  const vehicleId = usable(picked) ? picked : assigned ?? null
  const setVehicleId = (id) => {
    if (id) localStorage.setItem(key, id)
    else localStorage.removeItem(key)
    setPicked(id)
  }
  return <VehicleCtx.Provider value={{ vehicleId, setVehicleId }}>{children}</VehicleCtx.Provider>
}
