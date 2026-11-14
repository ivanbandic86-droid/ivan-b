import { useEffect, useState } from 'react'
import { Banner, Icon, Seg, useLoad } from '../../components/ui'
import { addDays, fmtDate, fmtDay } from '../../lib/dates'
import { db } from '../../lib/db'
import { useLists } from '../../lib/lists'
import { fmt, fmtMoney, qtyLabel, tripsLabel } from '../../lib/num'
import { loadReport, unitCost } from '../../lib/reportdata'
import { RangeBar, useRange } from './range'

function Tile({ label, value, sub }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

// Ture po danu: jedan niz, jedna boja. Vrijednost je ispisana samo na najvišem stupcu,
// ostale se vide prelaskom mišem ili fokusom, a sve su i u tablici "Po danu".
function DailyColumns({ report }) {
  const byDay = new Map(report.by('work_date').map((g) => [g.key, g]))
  const days = []
  for (let d = report.from; d <= report.to; d = addDays(d, 1)) days.push(d)
  const max = Math.max(1, ...days.map((d) => byDay.get(d)?.trips ?? 0))
  const peak = days.find((d) => (byDay.get(d)?.trips ?? 0) === max)
  const step = Math.ceil(days.length / 8)
  return (
    <div className="card">
      <h3>Ture po danu</h3>
      <div className="columns" role="img" aria-label="Broj tura po danu">
        {days.map((d) => {
          const g = byDay.get(d)
          const trips = g?.trips ?? 0
          return (
            <button key={d} type="button" className="col" aria-label={`${fmtDate(d)}: ${tripsLabel(trips)}`}>
              {d === peak && trips > 0 && <span className="cap">{trips}</span>}
              <span className="bar" style={{ height: `${(trips / max) * 86}%` }} />
              <span className="tip">
                <strong>{tripsLabel(trips)}</strong>{g && qtyLabel(g.m3, g.t) && ` · ${qtyLabel(g.m3, g.t)}`}<br />{fmtDate(d)}
              </span>
            </button>
          )
        })}
      </div>
      <div className="axis" aria-hidden="true">
        {days.map((d, i) => <span key={d}>{i % step === 0 ? fmtDay(d) : ''}</span>)}
      </div>
    </div>
  )
}

const DIMS = [['site_id', 'Gradilište'], ['material_id', 'Materijal'], ['driver_id', 'Vozač'], ['vehicle_id', 'Vozilo'], ['work_date', 'Dan']]

function Breakdown({ report }) {
  const L = useLists()
  const [dim, setDim] = useState('site_id')
  const name = {
    site_id: L.siteName, material_id: (id) => (id ? L.materialName(id) : 'Bez tereta'),
    driver_id: L.userName, vehicle_id: L.vehicleName, work_date: fmtDate,
  }[dim]
  const groups = report.by(dim).sort((a, b) => (dim === 'work_date' ? String(a.key).localeCompare(b.key) : b.trips + b.emptyTrips - a.trips - a.emptyTrips))
  const max = Math.max(1, ...groups.map((g) => g.trips + g.emptyTrips))
  const site = dim === 'site_id'
  const costs = new Map(report.allocation.bySite.map((s) => [s.site_id, s]))
  // Gradilišta koja imaju samo sate strojeva (bez vožnji) također nose trošak goriva.
  const onlyMachines = site ? report.allocation.bySite.filter((s) => !groups.some((g) => g.key === s.site_id)) : []
  const priced = report.cost > 0

  return (
    <div className="card">
      <div className="row between wrap">
        <h3>Pregled po</h3>
        <div style={{ flex: '1 1 260px', maxWidth: 560, minWidth: 0 }}><Seg value={dim} onChange={setDim} options={DIMS} /></div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{DIMS.find(([d]) => d === dim)[1]}</th><th aria-hidden="true"></th>
              <th className="r">Ture</th><th className="r">m³</th><th className="r">t</th>
              {site && <><th className="r">Gorivo</th>{priced && <><th className="r">Trošak goriva</th><th className="r">€/m³</th><th className="r">€/t</th></>}</>}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && onlyMachines.length === 0 && <tr><td colSpan="9" className="muted">Nema vožnji u odabranom razdoblju.</td></tr>}
            {groups.map((g) => {
              const c = costs.get(g.key)
              const per = unitCost(g, c?.cost)
              return (
                <tr key={g.key ?? 'none'}>
                  <td>{name(g.key)}</td>
                  <td className="barcell"><span className="rankbar" style={{ width: `${((g.trips + g.emptyTrips) / max) * 100}%` }} /></td>
                  <td className="r">{g.trips}{g.emptyTrips > 0 && <span className="muted"> +{g.emptyTrips} pr.</span>}</td>
                  <td className="r">{g.m3 ? fmt(g.m3) : '–'}</td>
                  <td className="r">{g.t ? fmt(g.t) : '–'}</td>
                  {site && <>
                    <td className="r">{c ? `${fmt(c.liters, 0)} L` : '–'}</td>
                    {priced && <><td className="r">{c ? fmtMoney(c.cost) : '–'}</td>
                      <td className="r">{per.m3 != null ? fmt(per.m3) : '–'}</td><td className="r">{per.t != null ? fmt(per.t) : '–'}</td></>}
                  </>}
                </tr>
              )
            })}
            {onlyMachines.map((s) => (
              <tr key={s.site_id}>
                <td>{L.siteName(s.site_id)} <span className="muted small">(samo strojevi)</span></td><td></td>
                <td className="r">–</td><td className="r">–</td><td className="r">–</td>
                <td className="r">{fmt(s.liters, 0)} L</td>{priced && <><td className="r">{fmtMoney(s.cost)}</td><td className="r">–</td><td className="r">–</td></>}
              </tr>
            ))}
            {site && report.allocation.unallocated.liters > 0.5 && (
              <tr>
                <td className="muted">Neraspoređeno</td><td></td><td className="r">–</td><td className="r">–</td><td className="r">–</td>
                <td className="r">{fmt(report.allocation.unallocated.liters, 0)} L</td>
                {priced && <><td className="r">{fmtMoney(report.allocation.unallocated.cost)}</td><td className="r">–</td><td className="r">–</td></>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {site && (
        <p className="small muted">
          Gorivo vozila dijeli se na dane prema prijeđenim kilometrima, a dan na gradilišta prema broju tura; gorivo strojeva prema
          satima rada. „Neraspoređeno” je gorivo vozila bez vožnji ili dana bez tura. Kratica „pr.” znači vožnje bez tereta.
        </p>
      )}
    </div>
  )
}

function FuelTable({ report }) {
  const L = useLists()
  const rows = [...report.fuel].sort((a, b) => b.liters - a.liters)
  return (
    <div className="card">
      <h3>Gorivo po vozilu</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Vozilo</th><th className="r">Točenja</th><th className="r">Litara</th><th className="r">Trošak</th><th className="r">Prijeđeno</th><th className="r">Potrošnja</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="muted">Nema točenja u odabranom razdoblju.</td></tr>}
            {rows.map((v) => {
              const machine = L.vehicle(v.vehicle_id)?.category === 'stroj'
              return (
                <tr key={v.vehicle_id}>
                  <td>{L.vehicleName(v.vehicle_id)}</td>
                  <td className="r">{v.fills}</td>
                  <td className="r">{fmt(v.liters, 0)}</td>
                  <td className="r">{v.priced ? fmtMoney(v.cost) : '–'}</td>
                  <td className="r">{v.distance ? `${fmt(v.distance, 0)} ${machine ? 'h' : 'km'}` : '–'}</td>
                  <td className="r">{v.rate == null ? '–' : machine ? `${fmt(v.rate / 100, 1)} L/h` : `${fmt(v.rate, 1)} L/100 km`}</td>
                  <td>{v.unusual && <span className="chip danger"><Icon name="alert" size={14} /> Neuobičajeno</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Potrošnja se računa samo između dva točenja „do vrha” uz upisano stanje brojila. Oznaka „Neuobičajeno” znači da je zadnji
        interval barem 25 % iznad prosjeka prethodnih za isto vozilo.
      </p>
    </div>
  )
}

export default function Dashboard() {
  const range = useRange('mjesec')
  const { data, error, loading, reload } = useLoad(() => loadReport(range.from, range.to), [range.from, range.to])

  // Uživo: novi unos vozača osvježi pregled bez ručnog učitavanja.
  useEffect(() => {
    let timer
    const off = db.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(reload, 800)
    })
    return () => (clearTimeout(timer), off())
  }, [reload])

  const t = data?.total
  return (
    <>
      <div className="row between">
        <h1>Pregled</h1>
        <span className="chip ok">Uživo</span>
      </div>
      <RangeBar range={range} />
      {error && <Banner kind="danger" icon="alert">{error}</Banner>}
      {!data ? <p className="center">{loading ? 'Učitavanje…' : ''}</p> : (
        <>
          <div className="tiles">
            <Tile label="Ture s teretom" value={fmt(t.trips, 0)}
              sub={t.emptyTrips > 0 ? `bez tereta: ${t.emptyTrips} (${fmt((t.emptyTrips / (t.trips + t.emptyTrips)) * 100, 0)} %)` : 'bez praznih vožnji'} />
            <Tile label="Prevezeno m³" value={fmt(t.m3, 0)} sub={`${t.m3Trips} tura s upisanim m³`} />
            <Tile label="Prevezeno t" value={fmt(t.t, 0)} sub={`${t.tTrips} tura s upisanim tonama`} />
            <Tile label="Prijeđeno km" value={fmt(data.km, 0)} sub="prema dnevnim unosima" />
            <Tile label="Gorivo" value={`${fmt(data.liters, 0)} L`} sub={data.cost ? fmtMoney(data.cost) : 'cijena nije upisana'} />
            <Tile label="Sati strojeva" value={`${fmt(data.machineHours, 1)} h`} />
          </div>
          {data.from !== data.to && <DailyColumns report={data} />}
          <Breakdown report={data} />
          <FuelTable report={data} />
        </>
      )}
    </>
  )
}
