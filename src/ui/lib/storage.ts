export interface Settings {
  chainKey?: string
  /** chainId -> rpc url */
  rpc: Record<string, string>
  /** `${chainId}:${contractId}` -> address */
  addresses: Record<string, string>
  theme: 'auto' | 'dark' | 'light'
  /** Undefined means "follow scdocs.config.ts". */
  expandAll?: boolean
}

const KEY = 'scdocs:settings:v1'

export const defaultSettings: Settings = {
  rpc: {},
  addresses: {},
  theme: 'auto',
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaultSettings }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...defaultSettings,
      ...parsed,
      rpc: parsed.rpc ?? {},
      addresses: parsed.addresses ?? {},
    }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* private mode / quota — settings simply won't persist */
  }
}

export function addressKey(chainId: number, contractId: string): string {
  return `${chainId}:${contractId}`
}
