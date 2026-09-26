/**
 * Numbers typed on a Slovenian keyboard use a decimal comma ("5,2"). Number()
 * would turn that into NaN, so normalise it first. Returns NaN when the text
 * is not a plain number.
 */
export function parseDecimal(text) {
  if (typeof text === 'number') return text
  const s = String(text ?? '').trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN
  return Number(s)
}

/** "" -> fallback (used for optional seconds), otherwise a whole number or NaN. */
export function parseWhole(text, fallback = 0) {
  const s = String(text ?? '').trim()
  if (s === '') return fallback
  return /^\d+$/.test(s) ? Number(s) : NaN
}
