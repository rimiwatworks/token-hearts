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
const SHADOW = '#7a3a24'
const RED = '#d82800'
const EMPTY = '#fcd8a8'
const GREEN = '#00a800'
const HEARTS = 8

type Px = string | null
type Canvas = Px[][]

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...']
const MINI = ['XX.XX', 'XXXXX', '.XXX.', '..X..']

const FONT: Record<string, string[]> = {
  T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
  O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X'],
  S: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
}

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

// halves: 0 empty, 1 half, 2 full
const heartRow = (halves: number[], art: string[]): Canvas => {
  const w = art[0].length
  const c = blank(halves.length * (w + 1), art.length)
  halves.forEach((h, i) =>
    stamp(c, art, i * (w + 1), 0, col => (h === 2 || (h === 1 && col < w / 2) ? RED : EMPTY)),
  )
  return c
}

const toHalves = (remainingPct: number, count: number) => {
  const units = Math.round((Math.max(0, Math.min(100, remainingPct)) / 100) * count * 2)
  return Array.from({ length: count }, (_, i) => Math.max(0, Math.min(2, units - i * 2)))
}

const title = (scale: number): Canvas => {
  const word = 'TOKENS'
  const c = blank(word.length * 4 * scale + scale, 5 * scale + scale)
  ;[SHADOW, ORANGE].forEach((color, layer) =>
    [...word].forEach((ch, i) =>
      stamp(c, FONT[ch], i * 4 * scale + (layer ? 0 : scale), layer ? 0 : scale, () => color, scale),
    ),
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
  const left = 100 - (r.percent ?? 0)
  await $.ui.status(`${heartsText(left)} ${left}% left`)
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
    return { text: `♥ ${100 - (r?.percent ?? 0)}% of context left. Hearts pane opened.` }
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const r = await read($, reading)
    const cols = e.props.bodyColumns ?? 60

    const draw = (c: Canvas, key: string) => {
      const rows = []
      for (let y = 0; y < c.length; y += 2) {
        const segs: { top: string; bottom: string; n: number }[] = []
        c[y].forEach((px, x) => {
          const top = px ?? BG
          const bottom = c[y + 1]?.[x] ?? BG
          const last = segs[segs.length - 1]
          if (last && last.top === top && last.bottom === bottom) last.n++
          else segs.push({ top, bottom, n: 1 })
        })
        rows.push(
          <Box key={`${key}-${y}`} flexDirection="row">
            {segs.map(s => (
              <Text mono color={s.top} backgroundColor={s.bottom}>
                {'▀'.repeat(s.n)}
              </Text>
            ))}
          </Box>,
        )
      }
      return rows
    }

    const hearts = (pct: number, art: string[], key: string) => {
      const w = art[0].length + 1
      const perRow = Math.max(1, Math.min(HEARTS, Math.floor(cols / w)))
      const halves = toHalves(pct, HEARTS)
      const out = []
      for (let i = 0; i < halves.length; i += perRow)
        out.push(...draw(heartRow(halves.slice(i, i + perRow), art), `${key}${i}`))
      return out
    }

    const txt = (s: string, color = ORANGE) => (
      <Text mono color={color} backgroundColor={BG} weight="bold">
        {s}
      </Text>
    )

    const left = 100 - (r?.percent ?? 0)
    const fmt = (n?: number) => (n === undefined ? '?' : n.toLocaleString('en-US'))

    return (
      <Box flexDirection="column" backgroundColor={BG} paddingX={1}>
        {draw(title(cols >= 52 ? 2 : 1), 'title')}
        {txt(' ')}
        {txt('-LIFE-  CONTEXT', RED)}
        {hearts(left, HEART, 'ctx')}
        {txt(`${left}% left · ${fmt(r && r.tokens !== undefined ? r.window - r.tokens : r?.window)} / ${fmt(r?.window)} tokens`)}
        {r?.limits.map(l => [
          txt(' '),
          txt(`-${label(l.kind)}-  ${resetIn(l.resetsAt) && `reset ${resetIn(l.resetsAt)}`}`, RED),
          ...hearts(100 - l.percentUsed, MINI, l.kind),
          txt(`${Math.round((100 - l.percentUsed) * 10) / 10}% left`),
        ])}
        {r?.usd !== undefined && [txt(' '), txt(`◆ ×${r.usd.toFixed(2)} USD`, GREEN)]}
        {!r && txt('No reading yet…')}
      </Box>
    )
  })
}
