import { useEffect, useState } from 'react'
import type { ContractDoc, EventDoc, Hex } from '../../shared/types'
import { useDocs } from '../context'
import { prettyJson, shortAddress } from '../lib/format'
import { Icon } from './Icon'

interface LogRow {
  blockNumber: bigint
  transactionHash: Hex
  args?: unknown
}

export function EventLogPanel({ contract, event }: { contract: ContractDoc; event: EventDoc }) {
  const ctx = useDocs()
  const [open, setOpen] = useState(false)
  const [fromBlock, setFromBlock] = useState('')
  const [toBlock, setToBlock] = useState('')
  const [logs, setLogs] = useState<LogRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const address = ctx.addressFor(contract)

  useEffect(() => {
    setLogs(null)
    setError(null)
  }, [address])

  async function load() {
    if (!ctx.publicClient) {
      setError('No RPC endpoint configured for this chain.')
      return
    }
    if (!address) {
      setError('Set a contract address first.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const latest = await ctx.publicClient.getBlockNumber()
      const from = fromBlock.trim()
        ? BigInt(fromBlock.trim())
        : latest > 5000n
          ? latest - 5000n
          : 0n
      const to = toBlock.trim() ? BigInt(toBlock.trim()) : latest
      if (from > to) throw new Error('From block must be lower than to block.')

      const result = (await ctx.publicClient.getLogs({
        address,
        event: event.abi as any,
        fromBlock: from,
        toBlock: to,
      } as any)) as Array<{
        blockNumber?: bigint
        transactionHash?: Hex
        args?: unknown
      }>
      setLogs(
        result.map((log) => ({
          blockNumber: log.blockNumber ?? 0n,
          transactionHash: (log.transactionHash ?? '0x') as Hex,
          args: log.args,
        })),
      )
    } catch (caught) {
      setError((caught as Error).message)
      setLogs(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="event-log-wrap">
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setOpen((value) => !value)
          if (!open && logs === null) void load()
        }}
        title="Read past event logs from the configured RPC"
      >
        <Icon name="logs" size={12} />
        {open ? 'Hide logs' : 'Query logs'}
      </button>

      {open ? (
        <div className="log-panel">
          <div className="log-controls">
            <label className="hint">
              from
              <input
                className="input"
                value={fromBlock}
                onChange={(event) => setFromBlock(event.target.value)}
                placeholder="latest - 5000"
                inputMode="numeric"
                spellCheck={false}
              />
            </label>
            <label className="hint">
              to
              <input
                className="input"
                value={toBlock}
                onChange={(event) => setToBlock(event.target.value)}
                placeholder="latest"
                inputMode="numeric"
                spellCheck={false}
              />
            </label>
            <button className="btn btn-sm" onClick={() => void load()} disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="search" size={12} />}
              {loading ? 'Loading…' : 'Fetch'}
            </button>
          </div>

          {error ? <div className="hint" style={{ color: 'var(--danger)' }}>{error}</div> : null}
          {logs?.length === 0 ? <div className="hint">No logs in this block range.</div> : null}
          {logs?.map((log, index) => (
            <div className="log-row" key={`${log.transactionHash}-${index}`}>
              <div className="log-head">
                <span>block {log.blockNumber.toString()}</span>
                <span className="mono">{shortAddress(log.transactionHash, 6)}</span>
                {ctx.explorer ? (
                  <a
                    className="hint"
                    href={`${ctx.explorer}/tx/${log.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    explorer <Icon name="external" size={10} />
                  </a>
                ) : null}
              </div>
              <pre className="raw">{prettyJson(log.args ?? {})}</pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
