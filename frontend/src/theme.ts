/**
 * PaperGraph AI — unified design tokens.
 * Use these everywhere instead of hardcoding colors. Keeps the palette
 * consistent across landing + app, and makes a future re-skin a one-file change.
 *
 * Naming:
 *   bg.*       — page / surface backgrounds
 *   border.*   — divider / outline strokes
 *   text.*     — text colors (1 = primary, 4 = faintest)
 *   brand.*    — indigo-violet primary scale
 *   accent.*   — single warm accent (used sparingly, e.g. graph edges)
 *   status.*   — semantic success / warn / error
 */
export const theme = {
  bg: {
    deep:    '#050510',
    base:    '#09090b',
    mid:     '#0d0a1c',
    top:     '#1a1230',
    surface: 'rgba(255,255,255,0.025)',
    raised:  'rgba(255,255,255,0.04)',
    overlay: 'rgba(0,0,0,0.32)',
  },
  border: {
    subtle: 'rgba(255,255,255,0.06)',
    base:   'rgba(255,255,255,0.1)',
    strong: 'rgba(255,255,255,0.18)',
    brand:  'rgba(99,102,241,0.3)',
  },
  text: {
    1: '#ffffff',
    2: 'rgba(255,255,255,0.72)',
    3: 'rgba(255,255,255,0.5)',
    4: 'rgba(255,255,255,0.32)',
    5: 'rgba(255,255,255,0.18)',
  },
  brand: {
    50:   '#eef2ff',
    300:  '#a5b4fc',
    400:  '#818cf8',
    500:  '#6366f1',
    600:  '#4f46e5',
    700:  '#4338ca',
    violet: '#7c3aed',
    soft:   'rgba(99,102,241,0.08)',
    tint:   'rgba(99,102,241,0.15)',
    glow:   'rgba(99,102,241,0.4)',
    gradient: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
  },
  accent: {
    warm: '#f59e0b',
    soft: 'rgba(245,158,11,0.12)',
  },
  status: {
    ok:    '#10b981',
    warn:  '#f59e0b',
    error: '#ef4444',
    info:  '#6366f1',
  },
} as const

export type Theme = typeof theme
