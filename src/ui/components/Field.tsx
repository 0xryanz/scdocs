import type { ParamDoc } from '../../shared/types'
import { fieldError, initialFormValue, type FormValue } from '../lib/coerce'
import { Icon } from './Icon'

const FIXED_ARRAY = /\[(\d+)\]$/

interface FieldProps {
  param: ParamDoc
  value: FormValue | undefined
  onChange(next: FormValue): void
  label?: string
  /** Set after a failed submit so empty required fields light up immediately. */
  showErrors?: boolean
}

export function Field({ param, value, onChange, label, showErrors = false }: FieldProps) {
  const name = label ?? param.name ?? ''
  if (param.element) {
    return (
      <ArrayField param={param} value={value} onChange={onChange} label={name} showErrors={showErrors} />
    )
  }
  if (param.components) {
    return (
      <TupleField param={param} value={value} onChange={onChange} label={name} showErrors={showErrors} />
    )
  }
  return (
    <ScalarField param={param} value={value} onChange={onChange} label={name} showErrors={showErrors} />
  )
}

function FieldLabel({ name, param }: { name: string; param: ParamDoc }) {
  return (
    <>
      <div className="field-label">
        {name ? <span className="field-name">{name}</span> : <span className="field-name">(unnamed)</span>}
        <span className="field-type">{friendlyType(param)}</span>
        {param.indexed ? <span className="field-type">indexed</span> : null}
      </div>
      <div className="field-desc">{param.description ?? param.schema.description}</div>
    </>
  )
}

/** `struct DemoToken.Meta` -> `struct Meta`, which reads far better than `(string,string,uint8)`. */
export function friendlyType(param: ParamDoc): string {
  const internal = param.internalType
  if (!internal) return param.type
  const suffix = internal.endsWith('[]') ? '[]' : ''
  const base = internal.replace(/\[\]$/, '')
  const kind = /^(struct|enum|contract)\s+/.exec(base)?.[1]
  const name = base.split('.').pop() ?? base
  return kind ? `${kind} ${name}${suffix}` : `${name}${suffix}`
}

function ArrayField({ param, value, onChange, label, showErrors }: Required<FieldProps>) {
  const items = Array.isArray(value) ? (value as FormValue[]) : []
  const fixed = FIXED_ARRAY.exec(param.type)
  const size = fixed ? Number(fixed[1]) : null
  const element = param.element!

  const replace = (next: FormValue[]) => onChange(next)

  return (
    <div className="field">
      <FieldLabel name={label} param={param} />
      <div className="group">
        {items.length === 0 ? (
          <div className="array-empty">
            <span className="hint">No items yet.</span>
            {size === null ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => replace([initialFormValue(element)])}
              >
                <Icon name="plus" size={13} /> Add item
              </button>
            ) : null}
          </div>
        ) : null}
        {items.map((item, index) => (
          <div className="array-item" key={`${index}-${items.length}`}>
            <span className="array-index">{index}</span>
            <Field
              param={element}
              value={item}
              label={element.name || `[${index}]`}
              showErrors={showErrors}
              onChange={(next) => {
                const copy = [...items]
                copy[index] = next
                replace(copy)
              }}
            />
            {size === null ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Remove item"
                style={{ marginTop: 18 }}
                onClick={() => replace(items.filter((_, i) => i !== index))}
              >
                <Icon name="trash" size={13} />
              </button>
            ) : null}
          </div>
        ))}
        {size === null && items.length > 0 ? (
          <div className="array-controls">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => replace([...items, initialFormValue(element)])}
            >
              <Icon name="plus" size={13} /> Add item
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TupleField({ param, value, onChange, label, showErrors }: Required<FieldProps>) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, FormValue>)
      : {}

  return (
    <div className="field">
      <FieldLabel name={label} param={param} />
      <div className="group">
        {param.components!.map((component, index) => {
          const key = component.name || String(index)
          return (
            <Field
              key={key}
              param={component}
              label={component.name || `#${index}`}
              value={source[key]}
              showErrors={showErrors}
              onChange={(next) => onChange({ ...source, [key]: next })}
            />
          )
        })}
      </div>
    </div>
  )
}

function ScalarField({ param, value, onChange, label, showErrors }: Required<FieldProps>) {
  const text = typeof value === 'string' ? value : ''
  // Validate on the fly once the user starts typing; otherwise wait until a
  // submit was attempted, so an untouched form is not a wall of red.
  const error = text.trim() !== '' || showErrors ? fieldError(param, text) : null
  const invalid = error ? ' invalid' : ''

  if (param.type === 'bool') {
    return (
      <div className="field">
        <FieldLabel name={label} param={param} />
        <div className="seg" role="group">
          {(['true', 'false'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={text === option ? 'on' : ''}
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const isLong = param.type === 'bytes'

  return (
    <div className="field">
      <FieldLabel name={label} param={param} />
      {isLong ? (
        <textarea
          className={`textarea${invalid}`}
          value={text}
          rows={3}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          placeholder="0x…"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={`input${invalid}`}
          value={text}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          inputMode={/^u?int/.test(param.type) ? 'numeric' : 'text'}
          placeholder={placeholderFor(param.type)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  )
}

function placeholderFor(type: string): string {
  if (type === 'address') return '0x0000…0000'
  if (type === 'string') return 'text'
  if (/^bytes\d+/.test(type)) return `0x (${type.slice(5)} bytes)`
  if (/^u?int/.test(type)) return '0'
  return ''
}
