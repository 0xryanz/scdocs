import type { CSSProperties, ReactNode } from 'react'

const PATHS: Record<string, ReactNode> = {
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="M10.6 10.6L13.5 13.5" />
    </>
  ),
  chevron: <path d="M6 3.5L10.5 8L6 12.5" />,
  down: <path d="M3.5 6L8 10.5L12.5 6" />,
  wallet: (
    <>
      <rect x="2" y="4" width="12" height="9" rx="2" />
      <path d="M2 7h12" />
      <circle cx="10.5" cy="10" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  sliders: (
    <>
      <path d="M3 5h10M3 11h10" />
      <circle cx="6" cy="5" r="1.6" />
      <circle cx="10" cy="11" r="1.6" />
    </>
  ),
  external: (
    <>
      <path d="M9 3h4v4" />
      <path d="M13 3L7 9" />
      <path d="M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.4" />
      <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </>
  ),
  check: <path d="M3 8.5L6.5 12L13 4.5" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  trash: (
    <>
      <path d="M3 4.5h10" />
      <path d="M6.5 4.5V3h3v1.5" />
      <path d="M4.5 4.5l.6 8a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1l.6-8" />
    </>
  ),
  play: <path d="M5.5 3.5L12 8l-6.5 4.5z" fill="currentColor" stroke="none" />,
  code: <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3" />,
  link: (
    <>
      <path d="M6.5 9.5l3-3" />
      <path d="M7 4.5l1-1a2.1 2.1 0 0 1 3 3l-1 1" />
      <path d="M9 11.5l-1 1a2.1 2.1 0 0 1-3-3l1-1" />
    </>
  ),
  logs: (
    <>
      <path d="M3 4h10M3 8h10M3 12h6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  proxy: (
    <>
      <path d="M8 2.5l5 2.8-5 2.8-5-2.8z" />
      <path d="M3 8.2l5 2.8 5-2.8M3 11l5 2.8 5-2.8" />
    </>
  ),
  braces: (
    <>
      <path d="M6 2.8c-1.3 0-2 .7-2 2v1.5c0 .9-.4 1.4-1.3 1.5.9.1 1.3.6 1.3 1.5v1.4c0 1.3.7 2 2 2" />
      <path d="M10 2.8c1.3 0 2 .7 2 2v1.5c0 .9.4 1.4 1.3 1.5-.9.1-1.3.6-1.3 1.5v1.4c0 1.3-.7 2-2 2" />
    </>
  ),
  alert: (
    <>
      <path d="M8 2.5L14 13H2z" />
      <path d="M8 6.5v3M8 11.2v.1" />
    </>
  ),
  menu: <path d="M3 4.5h10M3 8h10M3 11.5h10" />,
  book: (
    <>
      <path d="M3 3.5h4a2 2 0 0 1 2 2v7a1.5 1.5 0 0 0-1.5-1.5H3z" />
      <path d="M13 3.5H9a2 2 0 0 0-2 2v7a1.5 1.5 0 0 1 1.5-1.5H13z" />
    </>
  ),
  heart: (
    <path d="M8 13.3S2.5 10 2.5 5.9A2.8 2.8 0 0 1 8 4.3a2.8 2.8 0 0 1 5.5 1.6c0 4.1-5.5 7.4-5.5 7.4z" />
  ),
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
    />
  ),
}

export function Icon({
  name,
  size = 16,
  style,
  className,
}: {
  name: keyof typeof PATHS | string
  size?: number
  style?: CSSProperties
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: 'none', display: 'block', ...style }}
      className={className}
      aria-hidden="true"
    >
      {PATHS[name] ?? null}
    </svg>
  )
}
