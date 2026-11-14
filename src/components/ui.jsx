import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  fuel: 'M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M14 9h3l3 3v6a1.5 1.5 0 01-3 0v-3h-3M7 7h4v4H7z',
  machine: 'M3 17h10V9H7l-4 4zM13 12h4l4 5H13M6 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 13l4 4L19 7',
  x: 'M6 6l12 12M18 6L6 18',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  offline: 'M2 2l20 20M8.5 16.4a5 5 0 017 0M5 12.9a10 10 0 015.2-2.7M19 12.9a10 10 0 00-2.4-1.7M2 8.8a15 15 0 014.2-2.6M22 8.8a15 15 0 00-9.4-3.8M12 20h.01',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zM12 17a4 4 0 100-8 4 4 0 000 8z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a4 4 0 100-8 4 4 0 000 8zM21 20v-1a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8',
  order: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12l2 2 4-4',
  refresh: 'M20 11a8 8 0 00-14.9-3M4 4v4h4M4 13a8 8 0 0014.9 3M20 20v-4h-4',
  truck: 'M2 6h11v10H2zM13 9h5l3 4v3h-8M6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
}

export function Icon({ name, size }) {
  return (
    <svg className="icon" style={size ? { width: size, height: size } : undefined} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <span className="hint"> · {hint}</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

export const OTHER = '__other'

export function Select({ label, hint, value, onChange, options, placeholder = 'Odaberi…', required, disabled, other }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} required={required} disabled={disabled}>
        <option value="">{placeholder}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
        {other && <option value={OTHER}>Ostalo (upišem sam)</option>}
      </select>
    </Field>
  )
}

export function Num({ label, hint, error, value, onChange, big, ...rest }) {
  return (
    <div className={big ? 'big-num' : undefined}>
      <Field label={label} hint={hint} error={error}>
        <input inputMode="decimal" autoComplete="off" value={value ?? ''} aria-invalid={error ? 'true' : undefined}
          onChange={(e) => onChange(e.target.value)} {...rest} />
      </Field>
    </div>
  )
}

export function Text({ label, hint, value, onChange, multiline, ...rest }) {
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <Field label={label} hint={hint}>
      <Tag value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  )
}

export function Check({ label, checked, onChange }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

export function Banner({ kind = 'info', icon, children }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : 'status'}>
      {icon && <Icon name={icon} />}
      <div className="grow">{children}</div>
    </div>
  )
}

export function Dialog({ open, title, onClose, children, footer, onSubmit }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  const Body = onSubmit ? 'form' : 'div'
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <Body onSubmit={onSubmit && ((e) => (e.preventDefault(), onSubmit()))} noValidate>
          <div className="dialog-head">
            <h2 className="grow">{title}</h2>
            <button type="button" className="ghost" onClick={onClose} aria-label="Zatvori"><Icon name="x" /></button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </Body>
      )}
    </dialog>
  )
}

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const show = useCallback((text, kind = 'ok') => {
    clearTimeout(timer.current)
    setToast({ text, kind })
    timer.current = setTimeout(() => setToast(null), kind === 'danger' ? 6000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          <Icon name={toast.kind === 'ok' ? 'check' : toast.kind === 'warn' ? 'clock' : 'alert'} />
          {toast.text}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

// Potvrda brisanja i sličnih radnji: await confirm('Obrisati?') vraća true ili false.
const ConfirmCtx = createContext(async () => false)
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null)
  const confirm = useCallback(
    (text, action = 'Obriši') => new Promise((resolve) => setAsk({ text, action, resolve })),
    [],
  )
  const answer = (value) => {
    ask?.resolve(value)
    setAsk(null)
  }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(ask)} title="Potvrda" onClose={() => answer(false)}
        footer={<>
          <button type="button" className="btn grow" onClick={() => answer(false)}>Odustani</button>
          <button type="button" className="btn danger grow" onClick={() => answer(true)}>{ask?.action}</button>
        </>}>
        <p>{ask?.text}</p>
      </Dialog>
    </ConfirmCtx.Provider>
  )
}

// Pokreće asinkronu radnju, prati je li u tijeku i prikazuje grešku ako ne uspije.
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn, done) => {
    setBusy(true)
    try {
      const result = await fn()
      if (done) toast(done)
      return result ?? true
    } catch (e) {
      toast(e.message || 'Radnja nije uspjela.', 'danger')
      return false
    } finally {
      setBusy(false)
    }
  }, [toast])
  return [run, busy]
}

// Učitava podatke i ponovno ih učitava kad se promijeni neka od ovisnosti.
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const tick = useRef(0)
  const load = useCallback(async () => {
    const mine = ++tick.current
    setState((s) => ({ ...s, loading: true }))
    try {
      const data = await fn()
      if (mine === tick.current) setState({ data, error: null, loading: false })
    } catch (e) {
      if (mine === tick.current) setState((s) => ({ data: s.data, error: e.message || 'Učitavanje nije uspjelo.', loading: false }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}
