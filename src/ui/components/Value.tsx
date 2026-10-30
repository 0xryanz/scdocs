import type { ParamDoc } from '../../shared/types'
import { valueKind } from '../lib/format'

function formatLeaf(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '—'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value.length === 0 ? '""' : value
  return String(value)
}

function elementType(type?: string): string | undefined {
  const match = /^(.+)\[\d*\]$/.exec(type ?? '')
  return match?.[1]
}

function Node({ value, name, type }: { value: unknown; name: string; type?: string }) {
  if (Array.isArray(value)) {
    return (
      <div className="out-row">
        <span className="out-name">
          {name}
          {type ? ` ${type}` : ''}
        </span>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          {value.length === 0 ? <span className="out-val">[]</span> : null}
          {value.map((item, index) => (
            <Node key={index} value={item} name={`[${index}]`} type={elementType(type)} />
          ))}
        </div>
      </div>
    )
  }

  if (value && typeof value === 'object') {
    return (
      <div className="out-row">
        <span className="out-name">{name}</span>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          {Object.entries(value as Record<string, unknown>).map(([key, inner]) => (
            <Node key={key} value={inner} name={key} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="out-row">
      <span className="out-name">
        {name}
        {type ? ` ${type}` : ''}
      </span>
      <span className={`out-val ${valueKind(value, type)}`}>{formatLeaf(value)}</span>
    </div>
  )
}

/** Normalises viem's return shape: a bare value for one output, an array for many. */
export function ValueList({ outputs, value }: { outputs: ParamDoc[]; value: unknown }) {
  if (outputs.length === 0) return <span className="out-val">no return values</span>

  const items = outputs.length === 1 ? [value] : Array.isArray(value) ? value : [value]

  return (
    <>
      {items.map((item, index) => (
        <Node
          key={index}
          value={item}
          name={outputs[index]?.name || (outputs.length > 1 ? `#${index}` : 'return')}
          type={outputs[index]?.type}
        />
      ))}
    </>
  )
}
