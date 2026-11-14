// Datumi se vode kao lokalni 'YYYY-MM-DD' nizovi. toISOString() bi ih pretvorio u UTC
// i između ponoći i 2 h ujutro vratio jučerašnji datum.
const pad = (n) => String(n).padStart(2, '0')

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function localTime(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

export const monthStart = (s = localDate()) => s.slice(0, 8) + '01'

export const fmtDate = (s) => {
  if (!s) return ''
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${Number(d)}. ${Number(m)}. ${y}.`
}

export const fmtDay = (s) => {
  const [, m, d] = s.slice(0, 10).split('-')
  return `${Number(d)}. ${Number(m)}.`
}

export const fmtTime = (iso) => (iso ? localTime(new Date(iso)) : '')

export const fmtDateTime = (iso) => (iso ? `${fmtDate(localDate(new Date(iso)))} ${fmtTime(iso)}` : '')

// Sati između dva vremena 'HH:MM'. Kraj prije početka znači smjenu preko ponoći.
export function hoursBetween(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60
  return mins / 60
}
