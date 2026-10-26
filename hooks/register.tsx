import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Reading } from '../types'

const PANE = 'token-hearts'
const reading = atom({ plugin: 'token-hearts', key: 'reading' } as const, null, {
  shape: 'reading-1',
})

// NES palette
const BG = '#000000'
const ORANGE = '#d97757'
const SHADOW = '#6e3220'
const RED = '#d82800'
const EMPTY = '#fcd8a8'
const GREEN = '#00a800'
const HEARTS = 8

type Px = string | null
type Canvas = Px[][]

// 7x6 heart on an 8px stride; each text cell holds 2x2 pixels, so 8 hearts take 32 columns
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']

const FONT: Record<string, string[]> = {
  T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X'],
  S: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
}

// quadrant glyphs by bits: top-left 1, top-right 2, bottom-left 4, bottom-right 8
const QUAD = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█'

const blank = (w: number, h: number): Canvas =>
  Array.from({ length: h }, () => Array<Px>(w).fill(null))

const stamp = (c: Canvas, art: string[], x: number, y: number, paint: (col: number) => Px, scale = 1) =>
  art.forEach((row, ry) =>
    [...row].forEach((ch, rx) => {
      if (ch !== 'X') return
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const line = c[y + ry * scale + dy]
          if (line && x + rx * scale + dx < line.length) line[x + rx * scale + dx] = paint(rx)
        }
    }),
  )

// halves: 0 empty, 1 half, 2 full; a half heart splits on a cell edge so no cell mixes two colors
const heartRow = (halves: number[]): Canvas => {
  const c = blank(halves.length * 8, HEART.length)
  halves.forEach((h, i) => stamp(c, HEART, i * 8, 0, col => (h === 2 || (h === 1 && col < 4) ? RED : EMPTY)))
  return c
}

const toHalves = (remainingPct: number, count: number) => {
  const units = Math.round((Math.max(0, Math.min(100, remainingPct)) / 100) * count * 2)
  return Array.from({ length: count }, (_, i) => Math.max(0, Math.min(2, units - i * 2)))
}

// letters on a 5px stride, a thin 1px shadow down and to the right
const title = (scale: number): Canvas => {
  const word = 'TOKENS'
  const c = blank(word.length * 5 * scale, 5 * scale + 1)
  ;[SHADOW, ORANGE].forEach((color, layer) =>
    [...word].forEach((ch, i) => stamp(c, FONT[ch], i * 5 * scale + (layer ? 0 : 1), layer ? 0 : 1, () => color, scale)),
  )
  return c
}

const label = (kind: string) =>
  ({ five_hour: '5 HOUR', seven_day: '7 DAY', spend_limit: 'SPEND' })[kind] ?? kind.toUpperCase()

const resetIn = (iso?: string, now = Date.now()) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  return mins >= 60 * 24
    ? `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`
    : `${Math.floor(mins / 60)}h${mins % 60}m`
}

const heartsText = (remainingPct: number) =>
  toHalves(remainingPct, 5)
    .map(h => (h === 2 ? '♥' : h === 1 ? '❥' : '♡'))
    .join('')

const pctLeft = (used: number) => Math.round((100 - used) * 10) / 10

async function refresh($: EngineInterface) {
  const u = await $.session.usage()
  const r: Reading = {
    tokens: u.context.tokens,
    window: u.context.window,
    percent: u.context.percent,
    limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    usd: u.cost?.usd,
  }
  await update($, reading, () => r)
  const chat = 100 - (r.percent ?? 0)
  const five = r.limits.find(l => l.kind === 'five_hour')
  await $.ui.status(
    `chat ${heartsText(chat)} ${chat}%` + (five ? ` · 5h ${heartsText(100 - five.percentUsed)} ${pctLeft(five.percentUsed)}%` : ''),
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tokens', description: 'Show remaining tokens as 8-bit hearts' })
    await refresh($)
    void $.ui.open({ id: PANE, title: '♥ Tokens' })
    return next(e)
  })

  on('command.run', { command: 'tokens' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: '♥ Tokens' })
    const r = await read($, reading)
    return { text: `♥ ${100 - (r?.percent ?? 0)}% of this chat's context left. Hearts pane opened.` }
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, reading)
    const cols = e.props.bodyColumns ?? 60

    const row = (key: string, segs: { ch: string; fg: string; bg: string }[]) => {
      const runs: { text: string; fg: string; bg: string }[] = []
      segs.forEach(s => {
        const last = runs[runs.length - 1]
        if (last && last.fg === s.fg && last.bg === s.bg) last.text += s.ch
        else runs.push({ text: s.ch, fg: s.fg, bg: s.bg })
      })
      return (
        <Box key={key} flexDirection="row">
          {runs.map(s => (
            <Text mono color={s.fg} backgroundColor={s.bg}>
              {s.text}
            </Text>
          ))}
        </Box>
      )
    }

    // one cell = 1 pixel wide, 2 tall
    const drawHalf = (c: Canvas, key: string) => {
      const rows = []
      for (let y = 0; y < c.length; y += 2)
        rows.push(row(`${key}-${y}`, c[y].map((px, x) => ({ ch: '▀', fg: px ?? BG, bg: c[y + 1]?.[x] ?? BG }))))
      return rows
    }

    // one cell = 2x2 pixels, one color plus black
    const drawQuad = (c: Canvas, key: string) => {
      const rows = []
      for (let y = 0; y < c.length; y += 2) {
        const segs = []
        for (let x = 0; x < c[y].length; x += 2) {
          const px = [c[y][x], c[y][x + 1], c[y + 1]?.[x], c[y + 1]?.[x + 1]]
          const fg = px.find(p => p) ?? BG
          const bits = px.reduce((b, p, i) => (p === fg ? b | (1 << i) : b), 0)
          segs.push({ ch: QUAD[bits], fg, bg: BG })
        }
        rows.push(row(`${key}-${y}`, segs))
      }
      return rows
    }

    const hearts = (pct: number, key: string) => drawQuad(heartRow(toHalves(pct, HEARTS)), key)

    const txt = (s: string, color = ORANGE) => (
      <Text mono color={color} backgroundColor={BG} weight="bold">
        {s}
      </Text>
    )

    const chat = 100 - (r?.percent ?? 0)
    const fmt = (n?: number) => (n === undefined ? '?' : n.toLocaleString('en-US'))

    return (
      <Box flexDirection="column" backgroundColor={BG} paddingX={1}>
        {drawHalf(title(cols >= 62 ? 2 : 1), 'title')}
        {txt(' ')}
        {txt('-CHAT-', RED)}
        {hearts(chat, 'chat')}
        {txt(`${chat}% left · ${fmt(r && r.tokens !== undefined ? r.window - r.tokens : r?.window)} / ${fmt(r?.window)}`)}
        {txt(' ')}
        {txt('-ACCOUNT-', RED)}
        {r && r.limits.length === 0 && txt('shows after the first reply', EMPTY)}
        {r?.limits.map(l => [
          txt(`${label(l.kind)}${l.resetsAt ? ` · reset ${resetIn(l.resetsAt)}` : ''}`),
          ...hearts(100 - l.percentUsed, l.kind),
          txt(`${pctLeft(l.percentUsed)}% left`),
        ])}
        {r?.usd !== undefined && [txt(' '), txt(`◆ ×${r.usd.toFixed(2)} USD`, GREEN)]}
        {!r && txt('No reading yet…')}
      </Box>
    )
  })
}
