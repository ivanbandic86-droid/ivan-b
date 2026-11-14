// Obrasci za unose. Isti obrasci služe vozaču za novi unos i uredu za ispravak.
import { useEffect, useState } from 'react'
import { compressImage } from '../lib/image'
import { useLists } from '../lib/lists'
import { parseNum } from '../lib/num'
import { Check, Field, Icon, Num, OTHER, Select, Text, useToast } from './ui'

const numError = (v, { required } = {}) => {
  const n = parseNum(v)
  if (n === null) return required ? 'Obavezno' : null
  if (Number.isNaN(n)) return 'Upišite broj'
  return null
}
const positive = (v, opts) => numError(v, opts) ?? (parseNum(v) !== null && parseNum(v) <= 0 ? 'Mora biti veće od 0' : null)

export const text = (v) => (v && String(v).trim() ? String(v).trim() : null)

// ---------------------------------------------------------------------------
// Vožnja

// Gradilište i materijal: s popisa, ili OTHER uz tekst koji vozač upiše.
const siteChoice = (r) => r.site_id ?? (r.custom_site ? OTHER : null)
const custom = (f, key) => (f[key] ? text(f[key]) : null)

export const rideToForm = (r = {}) => ({
  custom_site: r.custom_site ?? '', custom_client: r.custom_client ?? '', custom_material: r.custom_material ?? '',
  vehicle_id: r.vehicle_id ?? null, site_id: siteChoice(r), material_id: r.material_id ?? (r.custom_material ? OTHER : null),
  load_location_id: r.load_location_id ?? null, unload_location_id: r.unload_location_id ?? null,
  is_empty: r.is_empty ?? false, m3: r.quantity_m3 ?? '', t: r.quantity_t ?? '',
  delivery_note: r.delivery_note ?? '', recipient: r.recipient ?? '', note: r.note ?? '',
})

export function validateRide(f) {
  const e = {}
  if (!f.vehicle_id) e.vehicle_id = 'Odaberite vozilo'
  if (!f.site_id) e.site_id = 'Odaberite gradilište'
  else if (f.site_id === OTHER && !text(f.custom_site)) e.custom_site = 'Upišite gradilište'
  if (!f.is_empty) {
    if (!f.material_id) e.material_id = 'Odaberite materijal'
    else if (f.material_id === OTHER && !text(f.custom_material)) e.custom_material = 'Upišite materijal'
    e.m3 = positive(f.m3)
    e.t = positive(f.t)
    if (!e.m3 && !e.t && parseNum(f.m3) === null && parseNum(f.t) === null) e.m3 = 'Upišite količinu u m³ ili t'
  }
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v))
}

export const rideFromForm = (f) => ({
  vehicle_id: f.vehicle_id,
  site_id: f.site_id === OTHER ? null : f.site_id,
  custom_site: f.site_id === OTHER ? custom(f, 'custom_site') : null,
  custom_client: f.site_id === OTHER ? custom(f, 'custom_client') : null,
  material_id: f.is_empty || f.material_id === OTHER ? null : f.material_id,
  custom_material: !f.is_empty && f.material_id === OTHER ? custom(f, 'custom_material') : null,
  load_location_id: f.load_location_id, unload_location_id: f.unload_location_id,
  is_empty: f.is_empty,
  quantity_m3: f.is_empty ? null : parseNum(f.m3),
  quantity_t: f.is_empty ? null : parseNum(f.t),
  delivery_note: text(f.delivery_note), recipient: text(f.recipient), note: text(f.note),
})

// Gradilište s opcijom "Ostalo": vozač upiše gradilište i naručitelja, a ured ih poslije uredi.
function SiteFields({ form, set, errors }) {
  const L = useLists()
  return (
    <>
      <Select label="Gradilište" value={form.site_id} onChange={(v) => set({ site_id: v })} options={L.options.sites(form.site_id)} other />
      {errors.site_id && <span className="field-error small">{errors.site_id}</span>}
      {form.site_id === OTHER && (
        <>
          <Text label="Gradilište (upišite)" hint="ured će ga urediti" value={form.custom_site} onChange={(v) => set({ custom_site: v })} />
          {errors.custom_site && <span className="field-error small">{errors.custom_site}</span>}
          <Text label="Naručitelj (upišite)" hint="ako ga znate" value={form.custom_client} onChange={(v) => set({ custom_client: v })} />
        </>
      )}
    </>
  )
}

export function RideFields({ form, set, errors, photo, setPhoto, withVehicle, quick }) {
  const L = useLists()
  const toast = useToast()
  const unit = L.material(form.material_id)?.unit ?? 'm3'
  const qty = (key, label) => (
    <Num key={key} big label={label} value={form[key]} error={errors[key]} onChange={(v) => set({ [key]: v })} placeholder="0" />
  )
  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setPhoto(await compressImage(file))
    } catch (err) {
      toast(err.message, 'danger')
    }
  }

  const what = (
    <>
      {withVehicle && (
        <Select label="Vozilo" value={form.vehicle_id} onChange={(v) => set({ vehicle_id: v })}
          options={L.options.vehicles(form.vehicle_id, 'vozilo')} />
      )}
      {errors.vehicle_id && <span className="field-error small">{errors.vehicle_id}</span>}
      <SiteFields form={form} set={set} errors={errors} />
      <Check label="Vožnja bez tereta" checked={form.is_empty} onChange={(v) => set({ is_empty: v })} />
      {!form.is_empty && (
        <Select label="Materijal" value={form.material_id} onChange={(v) => set({ material_id: v })} options={L.options.materials(form.material_id)} other />
      )}
      {errors.material_id && <span className="field-error small">{errors.material_id}</span>}
      {!form.is_empty && form.material_id === OTHER && (
        <Text label="Materijal (upišite)" hint="ured će ga urediti" value={form.custom_material} onChange={(v) => set({ custom_material: v })} />
      )}
      {errors.custom_material && <span className="field-error small">{errors.custom_material}</span>}
    </>
  )
  // Glavna jedinica materijala je prva; druga se upisuje ako je poznata (npr. s vage).
  const quantity = !form.is_empty && (
    <div className="grid2">
      {unit === 't' ? [qty('t', 'Količina (t)'), qty('m3', 'm³ (ako je poznato)')] : [qty('m3', 'Količina (m³)'), qty('t', 'Tone (ako je poznato)')]}
    </div>
  )
  const route = (
    <div className="grid2">
      <Select label="Utovar" value={form.load_location_id} onChange={(v) => set({ load_location_id: v })}
        options={L.options.locations(form.load_location_id)} placeholder="Nije upisano" />
      <Select label="Istovar" value={form.unload_location_id} onChange={(v) => set({ unload_location_id: v })}
        options={L.options.locations(form.unload_location_id)} placeholder="Na gradilištu" />
    </div>
  )
  const paper = (
    <>
      <Text label="Broj otpremnice" value={form.delivery_note} onChange={(v) => set({ delivery_note: v })} autoComplete="off" />
      {setPhoto && (
        <Field label="Fotografija otpremnice">
          {photo ? (
            <div className="stack tight">
              <PhotoPreview blob={photo} />
              <button type="button" className="btn small" onClick={() => setPhoto(null)}><Icon name="trash" size={18} /> Ukloni fotografiju</button>
            </div>
          ) : (
            <span className="btn" style={{ position: 'relative' }}>
              <Icon name="camera" /> Slikaj otpremnicu
              <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} aria-label="Slikaj otpremnicu"
                style={{ position: 'absolute', inset: 0, opacity: 0, minHeight: 0 }} />
            </span>
          )}
        </Field>
      )}
    </>
  )
  const extra = (
    <details className="more">
      <summary>Primatelj i napomena</summary>
      <Text label="Primatelj" value={form.recipient} onChange={(v) => set({ recipient: v })} />
      <Text label="Napomena" value={form.note} onChange={(v) => set({ note: v })} multiline />
    </details>
  )

  // Tura po nalogu ili ponovljena tura: sve je već zadano, pa je količina na vrhu,
  // a ostalo se otvara samo ako treba nešto promijeniti.
  if (quick) {
    const wrong = errors.vehicle_id || errors.site_id || errors.material_id || errors.custom_site || errors.custom_material
    return (
      <>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{form.is_empty ? 'Bez tereta' : form.material_id === OTHER ? form.custom_material || 'Ostalo' : L.materialName(form.material_id)}</div>
          <div className="muted">
            {[form.site_id === OTHER ? form.custom_site || 'Ostalo' : L.siteName(form.site_id), L.locationName(form.load_location_id) && `utovar ${L.locationName(form.load_location_id)}`, L.vehicleName(form.vehicle_id)].filter(Boolean).join(' · ')}
          </div>
        </div>
        {quantity}
        {paper}
        <details className="more" open={wrong ? true : undefined}>
          <summary>Promijeni vozilo, gradilište ili materijal</summary>
          {what}
          {route}
        </details>
        {extra}
      </>
    )
  }
  return (
    <>
      {what}
      {quantity}
      {route}
      {paper}
      {extra}
    </>
  )
}

function PhotoPreview({ blob }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url && <img className="photo-thumb" src={url} alt="Otpremnica" />
}

// ---------------------------------------------------------------------------
// Gorivo

export const fuelToForm = (r = {}) => ({
  vehicle_id: r.vehicle_id ?? null, liters: r.liters ?? '', meter: r.meter ?? '',
  full_tank: r.full_tank ?? true, price: r.price_per_l ?? '', station: r.station ?? '',
})

export function validateFuel(f) {
  const e = {
    vehicle_id: f.vehicle_id ? null : 'Odaberite vozilo ili stroj',
    liters: positive(f.liters, { required: true }),
    meter: numError(f.meter),
    price: numError(f.price),
  }
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v))
}

export const fuelFromForm = (f) => ({
  vehicle_id: f.vehicle_id, liters: parseNum(f.liters), meter: parseNum(f.meter),
  full_tank: f.full_tank, price_per_l: parseNum(f.price), station: text(f.station),
})

export function FuelFields({ form, set, errors }) {
  const L = useLists()
  const machine = L.vehicle(form.vehicle_id)?.category === 'stroj'
  return (
    <>
      <Select label="Vozilo ili stroj" value={form.vehicle_id} onChange={(v) => set({ vehicle_id: v })} options={L.options.vehicles(form.vehicle_id)} />
      {errors.vehicle_id && <span className="field-error small">{errors.vehicle_id}</span>}
      <div className="grid2">
        <Num big label="Litara" value={form.liters} error={errors.liters} onChange={(v) => set({ liters: v })} placeholder="0" />
        <Num big label={machine ? 'Moto-sati' : 'Stanje km'} value={form.meter} error={errors.meter} onChange={(v) => set({ meter: v })} placeholder="brojilo" />
      </div>
      <Check label="Napunjen do vrha" checked={form.full_tank} onChange={(v) => set({ full_tank: v })} />
      {form.full_tank && parseNum(form.meter) === null && (
        <span className="small muted">Bez stanja brojila potrošnja se za ovo točenje ne može izračunati.</span>
      )}
      <div className="grid2">
        <Num label="Cijena po litri (€)" hint="ako znate" value={form.price} error={errors.price} onChange={(v) => set({ price: v })} />
        <Text label="Mjesto točenja" value={form.station} onChange={(v) => set({ station: v })} />
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Sati stroja

export const machineToForm = (r = {}) => ({
  vehicle_id: r.vehicle_id ?? null, site_id: siteChoice(r), hours: r.hours ?? '', activity: r.activity ?? '',
  custom_site: r.custom_site ?? '', custom_client: r.custom_client ?? '',
})

export function validateMachine(f) {
  const e = {
    vehicle_id: f.vehicle_id ? null : 'Odaberite stroj',
    site_id: f.site_id ? null : 'Odaberite gradilište',
    custom_site: f.site_id === OTHER && !text(f.custom_site) ? 'Upišite gradilište' : null,
    hours: positive(f.hours, { required: true }) ?? (parseNum(f.hours) > 24 ? 'Najviše 24 sata' : null),
  }
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v))
}

export const machineFromForm = (f) => ({
  vehicle_id: f.vehicle_id, site_id: f.site_id === OTHER ? null : f.site_id,
  custom_site: f.site_id === OTHER ? custom(f, 'custom_site') : null,
  custom_client: f.site_id === OTHER ? custom(f, 'custom_client') : null,
  hours: parseNum(f.hours), activity: text(f.activity),
})

export function MachineFields({ form, set, errors }) {
  const L = useLists()
  return (
    <>
      <Select label="Stroj" value={form.vehicle_id} onChange={(v) => set({ vehicle_id: v })} options={L.options.vehicles(form.vehicle_id, 'stroj')} />
      {errors.vehicle_id && <span className="field-error small">{errors.vehicle_id}</span>}
      <SiteFields form={form} set={set} errors={errors} />
      <Num big label="Sati rada" value={form.hours} error={errors.hours} onChange={(v) => set({ hours: v })} placeholder="0" />
      <Text label="Opis rada" hint="npr. iskop rova" value={form.activity} onChange={(v) => set({ activity: v })} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Radni dan (kilometri i sati)

export const dayToForm = (r = {}) => ({
  start_km: r.start_km ?? '', end_km: r.end_km ?? '',
  work_start: r.work_start?.slice(0, 5) ?? '', work_end: r.work_end?.slice(0, 5) ?? '',
})

export function validateDay(f) {
  const e = { start_km: numError(f.start_km), end_km: numError(f.end_km) }
  const a = parseNum(f.start_km)
  const b = parseNum(f.end_km)
  if (!e.end_km && a !== null && b !== null && b < a) e.end_km = 'Manje od početnih km'
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v))
}

export const dayFromForm = (f) => ({
  start_km: parseNum(f.start_km), end_km: parseNum(f.end_km),
  work_start: f.work_start || null, work_end: f.work_end || null,
})

export function DayFields({ form, set, errors }) {
  return (
    <>
      <div className="grid2">
        <Num big label="Početni km" value={form.start_km} error={errors.start_km} onChange={(v) => set({ start_km: v })} />
        <Num big label="Završni km" value={form.end_km} error={errors.end_km} onChange={(v) => set({ end_km: v })} />
      </div>
      <div className="grid2">
        <Field label="Početak rada"><input type="time" value={form.work_start} onChange={(e) => set({ work_start: e.target.value })} /></Field>
        <Field label="Kraj rada"><input type="time" value={form.work_end} onChange={(e) => set({ work_end: e.target.value })} /></Field>
      </div>
    </>
  )
}

// Stanje obrasca s greškama: const f = useForm(početno, validate)
export function useForm(initial, validate) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  // Greška polja nestaje čim se polje promijeni.
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))))
  }
  const check = () => {
    const e = validate(form)
    setErrors(e)
    return Object.keys(e).length === 0
  }
  return { form, set, errors, check, reset: (next) => (setForm(next), setErrors({})) }
}
