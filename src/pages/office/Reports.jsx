import { Icon, useAction } from '../../components/ui'
import { downloadReport } from '../../lib/excel'
import { useLists } from '../../lib/lists'
import { RangeBar, useRange } from './range'

export default function Reports() {
  const L = useLists()
  const range = useRange('mjesec')
  const [run, busy] = useAction()
  return (
    <>
      <h1>Izvještaji</h1>
      <div className="card">
        <h3>Excel izvještaj</h3>
        <p className="small muted">
          Datoteka sadrži sve vožnje, sažetke po gradilištu, materijalu, vozaču, vozilu i danu, sva točenja, potrošnju po vozilu,
          sate strojeva i radne dane. Količine u m³ i tonama uvijek su u odvojenim stupcima. Uz gradilišta su i trošak goriva i
          trošak po jedinici.
        </p>
        <RangeBar range={range} />
        <button type="button" className="btn primary block" disabled={busy}
          onClick={() => run(() => downloadReport(range.from, range.to, L), 'Izvještaj je preuzet.')}>
          <Icon name="file" /> {busy ? 'Priprema…' : 'Preuzmi Excel'}
        </button>
      </div>
    </>
  )
}
