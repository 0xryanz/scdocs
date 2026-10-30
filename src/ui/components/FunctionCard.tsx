import { useEffect, useMemo, useState } from 'react'
import { encodeFunctionData, type Abi } from 'viem'
import type { ContractDoc, FunctionDoc, Hex } from '../../shared/types'
import { useDocs } from '../context'
import {
  coerceArgs,
  initialArgs,
  parseAmount,
  type FormValue,
  type PayableUnit,
} from '../lib/coerce'
import { decodeRevert, type DecodedError } from '../lib/errors'
import { castCommand, functionAnchor, isAddress, prettyJson } from '../lib/format'
import { contractRoute, readRoute, writeRoute } from '../lib/hash'
import { CodeExamples } from './CodeExamples'
import { CopyButton } from './CopyButton'
import { Field } from './Field'
import { Icon } from './Icon'
import { ValueList } from './Value'

type Phase = 'idle' | 'calling' | 'simulating' | 'signing' | 'pending' | 'ok' | 'error'

interface CallState {
  phase: Phase
  value?: unknown
  hash?: Hex
  error?: DecodedError
  gas?: bigint
}

const BUSY: Phase[] = ['calling', 'simulating', 'signing', 'pending']

export function FunctionCard({ contract, fn }: { contract: ContractDoc; fn: FunctionDoc }) {
  const ctx = useDocs()
  const isRead = fn.mutability === 'view' || fn.mutability === 'pure'
  const [open, setOpen] = useState(ctx.expandAll)
  const [values, setValues] = useState<FormValue[]>(() => initialArgs(fn.inputs))
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<PayableUnit>('eth')
  const [state, setState] = useState<CallState>({ phase: 'idle' })
  const [showRaw, setShowRaw] = useState(false)
  const [showCast, setShowCast] = useState(false)
  const [showExamples, setShowExamples] = useState(false)
  const [callAs, setCallAs] = useState('')

  useEffect(() => {
    setOpen(ctx.expandAll)
  }, [ctx.expandAll])

  useEffect(() => {
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail === functionAnchor(fn)) setOpen(true)
    }
    window.addEventListener('scdocs:open-function', onOpen)
    return () => window.removeEventListener('scdocs:open-function', onOpen)
  }, [fn])

  useEffect(() => {
    const route = readRoute()
    if (route?.kind === 'contract' && route.anchor === functionAnchor(fn)) setOpen(true)
  }, [fn])

  const address = ctx.addressFor(contract)
  const busy = BUSY.includes(state.phase)

  const calldata = useMemo(() => {
    try {
      const args = coerceArgs(fn.inputs, values)
      const data = encodeFunctionData({
        abi: [fn.abi] as Abi,
        functionName: fn.name,
        args,
      } as any)
      return { data, command: castCommand(address ?? '0x…', fn, args) }
    } catch {
      return null
    }
  }, [fn, values, address])

  const exampleValue = useMemo(() => {
    if (fn.mutability !== 'payable') return undefined
    try {
      return parseAmount(amount, unit)
    } catch {
      return undefined
    }
  }, [fn.mutability, amount, unit])

  async function run() {
    if (!address) {
      ctx.notify('Set a contract address first', 'error')
      return
    }
    if (!ctx.publicClient) {
      ctx.notify('No RPC endpoint configured for this chain', 'error')
      return
    }

    let args: unknown[]
    let msgValue = 0n
    try {
      args = coerceArgs(fn.inputs, values)
      if (fn.mutability === 'payable') msgValue = parseAmount(amount, unit)
    } catch (error) {
      setState({
        phase: 'error',
        error: { kind: 'unknown', title: 'Check the inputs', detail: (error as Error).message },
      })
      return
    }

    if (isRead) {
      const from = callAs.trim()
      if (from && !isAddress(from)) {
        setState({
          phase: 'error',
          error: {
            kind: 'unknown',
            title: 'Invalid call-as address',
            detail: 'Use a 0x-prefixed 20-byte address, or leave the field empty.',
          },
        })
        return
      }
      setState({ phase: 'calling' })
      try {
        const result = await ctx.publicClient.readContract({
          address,
          abi: [fn.abi] as Abi,
          functionName: fn.name,
          args,
          account: from ? (from as Hex) : ctx.account,
        } as any)
        setState({ phase: 'ok', value: result })
      } catch (error) {
        setState({ phase: 'error', error: decodeRevert(error, contract.errors) })
      }
      return
    }

    if (!ctx.account) {
      ctx.notify('Connect a wallet to send transactions')
      ctx.connect()
      return
    }
    if (ctx.chainMismatch) {
      ctx.notify(`Switch your wallet to ${ctx.chain.name}`)
      ctx.switchWalletChain()
      return
    }
    if (!ctx.walletClient) {
      ctx.notify('Wallet client unavailable', 'error')
      return
    }

    setState({ phase: 'simulating' })
    let request: unknown
    try {
      const simulation = await ctx.publicClient.simulateContract({
        address,
        abi: [fn.abi] as Abi,
        functionName: fn.name,
        args,
        value: msgValue,
        account: ctx.account,
      } as any)
      request = simulation.request
    } catch (error) {
      const decoded = decodeRevert(error, contract.errors)
      if (decoded.kind === 'rejected') {
        setState({ phase: 'idle' })
        return
      }
      setState({ phase: 'error', error: decoded })
      return
    }

    const gas = await ctx.publicClient
      .estimateContractGas({
        address,
        abi: [fn.abi] as Abi,
        functionName: fn.name,
        args,
        value: msgValue,
        account: ctx.account,
      } as any)
      .catch(() => undefined)

    setState({ phase: 'signing' })
    try {
      const hash = await ctx.walletClient.writeContract(request as any)
      setState({ phase: 'pending', hash, gas })
      const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status === 'success') {
        setState({ phase: 'ok', hash, gas })
      } else {
        setState({
          phase: 'error',
          hash,
          gas,
          error: {
            kind: 'unknown',
            title: 'Transaction reverted on-chain',
            detail: `Gas used: ${receipt.gasUsed.toString()}`,
          },
        })
      }
    } catch (error) {
      const decoded = decodeRevert(error, contract.errors)
      if (decoded.kind === 'rejected') {
        setState({ phase: 'idle' })
        return
      }
      setState({ phase: 'error', error: decoded })
    }
  }

  function reset() {
    setValues(initialArgs(fn.inputs))
    setAmount('')
    setState({ phase: 'idle' })
    setShowRaw(false)
  }

  async function copyLink() {
    const route = contractRoute(contract.id, functionAnchor(fn))
    writeRoute(route, 'replace')
    const url = `${window.location.href.split('#')[0]}${route}`
    try {
      await navigator.clipboard.writeText(url)
      ctx.notify('Method link copied')
    } catch {
      ctx.notify('Clipboard blocked — copy the URL from the address bar', 'error')
    }
  }

  const mutabilityBadge = isRead ? (
    <span className="badge badge-read">{fn.mutability}</span>
  ) : (
    <span className="badge badge-write">{fn.mutability}</span>
  )

  return (
    <div
      className={`fn${busy ? ' running' : ''}`}
      id={functionAnchor(fn)}
      data-write={String(!isRead)}
    >
      <div className="fn-head" onClick={() => setOpen((prev) => !prev)}>
        <Icon name="chevron" className={`chev${open ? ' open' : ''}`} size={14} style={{ marginTop: 3 }} />
        <div className="fn-sig">
          <span className="fn-name">{fn.name}</span>
          <span className="fn-paren">(</span>
          {fn.inputs.map((param, index) => (
            <span key={index}>
              {index > 0 ? <span className="fn-paren">, </span> : null}
              <span className="fn-type">{param.type}</span>
              {param.name ? <span className="fn-args"> {param.name}</span> : null}
            </span>
          ))}
          <span className="fn-paren">)</span>
          {fn.outputs.length > 0 ? (
            <span className="fn-args">
              {' → '}
              {fn.outputs.map((output, index) => (
                <span key={index}>
                  {index > 0 ? ', ' : ''}
                  {output.type}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <div className="fn-badges">
          {Object.entries(fn.custom).map(([key, value]) => (
            <span className="badge badge-custom" key={key} title={value}>
              {key}
            </span>
          ))}
          {mutabilityBadge}
        </div>
      </div>

      {fn.summary ? <div className="fn-summary">{fn.summary}</div> : null}

      {open ? (
        <div className="fn-body">
          {fn.description ? <div className="fn-dev">{fn.description}</div> : null}
          {fn.undocumented ? (
            <div className="hint" style={{ marginBottom: 12 }}>
              No NatSpec for this function — add <code>/// @notice</code> to document it.
            </div>
          ) : null}

          {fn.inputs.length > 0 ? (
            <div className="params">
              {fn.inputs.map((param, index) => (
                <Field
                  key={index}
                  param={param}
                  label={param.name || `arg${index}`}
                  value={values[index]}
                  onChange={(next) => {
                    const copy = [...values]
                    copy[index] = next
                    setValues(copy)
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="hint" style={{ marginBottom: 12 }}>
              No parameters.
            </div>
          )}

          {isRead ? (
            <div className="value-row call-as-row">
              <span className="hint">call as</span>
              <input
                className={`input${callAs.trim() && !isAddress(callAs.trim()) ? ' invalid' : ''}`}
                value={callAs}
                spellCheck={false}
                placeholder={ctx.account ?? '0x… (optional)'}
                onChange={(event) => setCallAs(event.target.value)}
              />
              <span className="hint">simulate from this address</span>
            </div>
          ) : null}

          {fn.mutability === 'payable' ? (
            <div className="value-row">
              <span className="hint">msg.value</span>
              <input
                className="input"
                value={amount}
                inputMode="decimal"
                placeholder="0"
                onChange={(event) => setAmount(event.target.value)}
              />
              <select
                className="select"
                value={unit}
                onChange={(event) => setUnit(event.target.value as PayableUnit)}
              >
                <option value="eth">ETH</option>
                <option value="gwei">gwei</option>
                <option value="wei">wei</option>
              </select>
            </div>
          ) : null}

          <div className="actions">
            <button
              className={`btn ${isRead ? 'btn-primary' : 'btn-write'}`}
              onClick={run}
              disabled={busy || !address}
              title={address ? undefined : 'Set a contract address first'}
            >
              {busy ? <span className="spinner" /> : <Icon name="play" size={12} />}
              {labelFor(state.phase, isRead)}
            </button>

            <button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>
              Reset
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowCast((prev) => !prev)}
              disabled={!calldata}
              title="Show the equivalent cast command and calldata"
            >
              <Icon name="code" size={13} />
              {showCast ? 'Hide' : 'cast'}
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowExamples((prev) => !prev)}
              title="TypeScript call examples for this function"
            >
              <Icon name="braces" size={13} />
              {showExamples ? 'Hide examples' : 'Examples'}
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={copyLink}
              title="Copy a deep link to this method"
            >
              <Icon name="link" size={13} />
              link
            </button>

            <span className="actions-spacer" />
            {!isRead && ctx.chainMismatch ? (
              <span className="hint" style={{ color: 'var(--write)' }}>
                wallet is on chain {ctx.walletChainId}
              </span>
            ) : null}
            {state.gas !== undefined ? (
              <span className="hint">est. {state.gas.toString()} gas</span>
            ) : null}
          </div>

          {showCast && calldata ? (
            <div className="result" style={{ borderLeftColor: 'var(--accent)' }}>
              <div className="result-head">
                <span>cast</span>
                <span className="spacer" />
                <CopyButton text={calldata.command} />
              </div>
              <div className="result-body">
                <pre className="raw">{calldata.command}</pre>
                <pre className="raw" style={{ marginTop: 8, color: 'var(--text-faint)' }}>
                  {calldata.data}
                </pre>
              </div>
            </div>
          ) : null}

          {state.phase === 'error' && state.error ? (
            <div className="result error">
              <div className="result-head">
                <Icon name="alert" size={12} />
                <span>{state.error.kind === 'custom' ? 'reverted' : state.error.kind}</span>
                <span className="spacer" />
                {state.hash ? <TxLink hash={state.hash} /> : null}
              </div>
              <div className="result-body">
                <div className="err-title">{state.error.title}</div>
                {state.error.error ? (
                  <div className="err-detail">error {state.error.error.signature}</div>
                ) : null}
                {state.error.detail && state.error.detail !== state.error.title ? (
                  <div className="err-detail">{state.error.detail}</div>
                ) : null}
                {state.error.args ? (
                  <div className="err-args">
                    <div className="out-row">
                      <span className="out-name">args</span>
                      <span className="out-val">{prettyJson(state.error.args)}</span>
                    </div>
                  </div>
                ) : null}
                {state.error.raw ? (
                  <>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 8 }}
                      onClick={() => setShowRaw((prev) => !prev)}
                    >
                      {showRaw ? 'Hide' : 'Show'} revert data
                    </button>
                    {showRaw ? <pre className="raw" style={{ marginTop: 6 }}>{state.error.raw}</pre> : null}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {(state.phase === 'ok' || state.phase === 'pending') && !isRead ? (
            <div className={`result${state.phase === 'pending' ? '' : ' ok'}`}>
              <div className="result-head">
                {state.phase === 'pending' ? <span className="spinner" /> : <Icon name="check" size={12} />}
                <span>{state.phase === 'pending' ? 'pending' : 'confirmed'}</span>
                <span className="spacer" />
                {state.hash ? <TxLink hash={state.hash} /> : null}
              </div>
              <div className="result-body">
                <div className="hash-row">
                  <span className="label">tx</span>
                  <span>{state.hash}</span>
                  <CopyButton text={state.hash ?? ''} />
                </div>
              </div>
            </div>
          ) : null}

          {state.phase === 'ok' && isRead ? (
            <div className="result ok">
              <div className="result-head">
                <Icon name="check" size={12} />
                <span>result</span>
                <span className="spacer" />
                <CopyButton text={prettyJson(state.value)} />
              </div>
              <div className="result-body">
                <ValueList outputs={fn.outputs} value={state.value} />
              </div>
            </div>
          ) : null}

          {state.phase === 'calling' || state.phase === 'simulating' ? (
            <div className="result">
              <div className="result-body hint">
                {state.phase === 'calling' ? 'Calling eth_call…' : 'Simulating before asking for a signature…'}
              </div>
            </div>
          ) : null}

          {showExamples ? (
            <CodeExamples
              contract={contract}
              fn={fn}
              values={values}
              value={exampleValue}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function labelFor(phase: Phase, isRead: boolean): string {
  if (phase === 'calling') return 'Calling…'
  if (phase === 'simulating') return 'Simulating…'
  if (phase === 'signing') return 'Confirm in wallet…'
  if (phase === 'pending') return 'Waiting for receipt…'
  return isRead ? 'Query' : 'Simulate & send'
}

function TxLink({ hash }: { hash: Hex }) {
  const ctx = useDocs()
  if (!ctx.explorer) return null
  return (
    <a
      className="hint"
      href={`${ctx.explorer}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      explorer <Icon name="external" size={11} />
    </a>
  )
}
