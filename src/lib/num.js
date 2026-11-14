// Vraća broj, null za prazno polje ili NaN za neispravan unos. Prihvaća decimalni zarez.
export function parseNum(v) {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

export function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '–'
  return Number(n).toLocaleString('hr-HR', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

export const fmtMoney = (n) =>
  n === null || n === undefined
    ? '–'
    : Number(n).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

export const unitLabel = (u) => (u === 't' ? 't' : 'm³')

// "12 m³ · 20,4 t" za vožnju ili zbroj
export function qtyLabel(m3, t) {
  const parts = []
  if (Number(m3) > 0) parts.push(`${fmt(m3)} m³`)
  if (Number(t) > 0) parts.push(`${fmt(t)} t`)
  return parts.join(' · ')
}

// 1 tura, 2 ture, 5 tura
export function tripsLabel(n) {
  const m10 = n % 10
  const m100 = n % 100
  return `${n} ${m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'ture' : 'tura'}`
}
