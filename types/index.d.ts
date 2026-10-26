export type Reading = {
  tokens?: number
  window: number
  percent?: number
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'token-hearts': { reading: Shaped<Reading | null> }
  }
}
