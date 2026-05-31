/** Curated warm swatches for money boxes, and small color helpers. */

export interface Swatch {
  key: string
  name: string
  hex: string
}

export const SWATCHES: Swatch[] = [
  { key: 'clay', name: 'Clay', hex: '#d4845c' },
  { key: 'honey', name: 'Honey', hex: '#e0aa66' },
  { key: 'ochre', name: 'Ochre', hex: '#cba24f' },
  { key: 'sage', name: 'Sage', hex: '#9eb87f' },
  { key: 'teal', name: 'Teal', hex: '#74b1a3' },
  { key: 'dusk', name: 'Dusk', hex: '#8aa0c8' },
  { key: 'plum', name: 'Plum', hex: '#b88cc0' },
  { key: 'rose', name: 'Rose', hex: '#db8a82' },
]

export const DEFAULT_SWATCH = SWATCHES[0].hex

/** Convert "#rrggbb" + alpha into an rgba() string (for chart fills). */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
