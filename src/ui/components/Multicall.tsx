import { useEffect, useMemo, useState } from 'react'
import type { ContractDoc, FunctionDoc } from '../../shared/types'
import { useDocs } from '../context'
import { prettyJson } from '../lib/format'
import { Icon } from './Icon'

interface BatchResult {
  fn: FunctionDoc
  status: 'success' | 'failure'
  value?: unknown
  error?: Error
}

export function Multicall({ contract, reads }: { contract: ContractDoc; reads: FunctionDoc[] }) {
  const ctx = useDocs()
  const candidates = useMemo(() => reads.filter((fn) => fn.inputs.length === 0), [reads])
  const address = ctx.addressFor(contract)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((fn) => fn.id)),
  )
  const [results, setResults] = useState<BatchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'multicall' | 'direct'>('multicall')

  useEffect(() => {
    setSelected(new Set(candidates.map((fn) => fn.id)))
    setResults(null)
  }, [candidates])

  if (candidates.length < 2) return null

  async function run() {
    const client = ctx.publicClient
    if (!client) {
      setError('No RPC endpoint configured for this chain.')
      return
    }
    if (!address) {
      setError('Set a contract address first.')
      return
    }
    const chosen = candidates.filter((fn) => selected.has(fn.id))
    if (chosen.length === 0) {
      setError('Select at least one read function.')
      return
    }

    setLoading(true)
    setError(null)
    setMode('multicall')
    try {
      let output: Array<
        | { status: 'success'; result: unknown }
        | { status: 'failure'; error: Error }
      >
      try {
        output = (await client.multicall({
          contracts: chosen.map((fn) => ({
            address,
            abi: [fn.abi] as never,
            functionName: fn.name,
          })),
          allowFailure: true,
        })) as Array<
          | { status: 'success'; result: unknown }
          | { status: 'failure'; error: Error }
        >
      } catch {
        // Some local chains have no Multicall3 deployment. Fall back to one
        // eth_call per function so the button still works everywhere.
        setMode('direct')
        output = await Promise.all(
          chosen.map(async (fn) => {
            try {
              const result = await client.readContract({
                address,
                abi: [fn.abi] as never,
                functionName: fn.name,
              } as never)
              return { status: 'success' as const, result }
            } catch (caught) {
              return { status: 'failure' as const, error: caught as Error }
            }
          }),
        )
      }

      setResults(
        chosen.map((fn, index) => {
          const result = output[index]
          return result.status === 'success'
            ? { fn, status: 'success', value: result.result }
            : { fn, status: 'failure', error: result.error }
        }),
      )
    } catch (caught) {
      setError((caught as Error).message)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="multicall">
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((value) => !value)}
        title="Call several parameterless read functions in one RPC round-trip"
      >
        <Icon name="play" size={12} />
        {open ? 'Hide batch' : `Batch read (${candidates.length})`}
      </button>

      {open ? (
        <div className="multicall-panel">
          <div className="multicall-head">
            <span>Multicall reads</span>
            <span className="hint">parameterless functions only</span>
            {mode === 'direct' ? (
              <span className="hint">· direct calls (no multicall3 on this chain)</span>
            ) : null}
            <span className="spacer" />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setSelected(
                  selected.size === candidates.length
                    ? new Set()
                    : new Set(candidates.map((fn) => fn.id)),
                )
              }
            >
              {selected.size === candidates.length ? 'None' : 'All'}
            </button>
            <button className="btn btn-sm" onClick={() => void run()} disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="play" size={11} />}
              {loading ? 'Running…' : 'Run'}
            </button>
          </div>

          <div className="multicall-list">
            {candidates.map((fn) => (
              <label className="multicall-option" key={fn.id}>
                <input
                  type="checkbox"
                  checked={selected.has(fn.id)}
                  onChange={() => toggle(fn.id)}
                />
                <span className="mono">{fn.name}</span>
                {fn.summary ? <span className="hint">{fn.summary}</span> : null}
              </label>
            ))}
          </div>

          {error ? <div className="hint" style={{ color: 'var(--danger)' }}>{error}</div> : null}
          {results?.map((result) => (
            <div className="multicall-result" key={result.fn.id}>
              <div className="multicall-result-name">{result.fn.name}</div>
              {result.status === 'success' ? (
                <pre className="raw">{prettyJson(result.value)}</pre>
              ) : (
                <div className="hint" style={{ color: 'var(--danger)' }}>
                  {result.error?.message ?? 'Call failed'}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
