import { useMemo, useState, useSyncExternalStore } from 'react'
import type { ContractDoc, FunctionDoc } from '../../shared/types'
import { useDocs } from '../context'
import type { FormValue } from '../lib/coerce'
import { buildCallExamples, type ExampleFramework } from '../lib/examples'
import { tokenizeLine } from '../lib/highlight'
import { CopyButton } from './CopyButton'
import { Icon } from './Icon'

const STORAGE_KEY = 'scdocs:example-framework'
const FRAMEWORKS: ExampleFramework[] = ['viem', 'ethers', 'wagmi', 'web3']

/**
 * The selected framework is a reading preference, not per-function state: when
 * you switch to ethers on one card every other card follows.
 */
let currentFramework: ExampleFramework = readStoredFramework()
const frameworkListeners = new Set<() => void>()

function subscribeFramework(listener: () => void): () => void {
  frameworkListeners.add(listener)
  return () => {
    frameworkListeners.delete(listener)
  }
}

function getFramework(): ExampleFramework {
  return currentFramework
}

function selectFramework(next: ExampleFramework): void {
  if (next === currentFramework) return
  currentFramework = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* file:// or private mode */
  }
  frameworkListeners.forEach((listener) => listener())
}

export function CodeExamples({
  contract,
  fn,
  values,
  value,
}: {
  contract: ContractDoc
  fn: FunctionDoc
  values: FormValue[]
  value?: bigint
}) {
  const ctx = useDocs()
  const address = ctx.addressFor(contract)

  const set = useMemo(
    () =>
      buildCallExamples({
        contract,
        fn,
        chain: ctx.chain,
        address,
        rpcUrl: ctx.rpcUrl,
        account: ctx.account,
        values,
        value,
      }),
    [contract, fn, ctx.chain, ctx.rpcUrl, address, ctx.account, values, value],
  )

  const framework = useSyncExternalStore(subscribeFramework, getFramework, () => 'viem')
  const [showAbi, setShowAbi] = useState(false)

  const abiJson = useMemo(() => JSON.stringify(fn.abi, null, 2), [fn.abi])

  const active = set.items.find((item) => item.id === framework) ?? set.items[0]
  if (!active) return null

  // The ABI tab shows the exact fragment for this overload, ready to paste into
  // `abi.ts` or a cast/viem call.
  const view = showAbi
    ? { file: `${fn.name}.abi.json`, language: 'json', code: abiJson }
    : active

  return (
    <section className="examples" aria-label="Contract call examples">
      <div className="examples-head">
        <span className="examples-title">
          <Icon name="braces" size={13} />
          Call examples
        </span>
        <span className="hint">
          {showAbi ? 'JSON · exact fragment for this method' : 'TypeScript · mirrors the values above'}
        </span>
      </div>

      <div className="code-tabs" role="tablist" aria-label="Example framework and method ABI">
        {set.items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={!showAbi && item.id === active.id}
            className={`code-tab${!showAbi && item.id === active.id ? ' active' : ''}`}
            onClick={() => {
              selectFramework(item.id)
              setShowAbi(false)
            }}
          >
            {item.label}
          </button>
        ))}
        <span className="code-tab-sep" aria-hidden="true" />
        <button
          type="button"
          role="tab"
          aria-selected={showAbi}
          className={`code-tab abi-tab${showAbi ? ' active' : ''}`}
          title="The exact ABI fragment for this method"
          onClick={() => setShowAbi((prev) => !prev)}
        >
          ABI
        </button>
      </div>

      <div className="code-panel">
        <div className="code-panel-head">
          <span className="code-file">{view.file}</span>
          <span className="badge code-lang">{view.language}</span>
          <span className="spacer" />
          <CopyButton text={view.code} label="copy code" />
        </div>
        <pre className="code-pre" tabIndex={0}>
          <code>
            {view.code.split('\n').map((line, index) => (
              <CodeLine key={index} number={index + 1} line={line} />
            ))}
          </code>
        </pre>
      </div>

      <div className="examples-foot">
        {showAbi ? (
          <span>
            selector <code>{fn.selector}</code> · {fn.signature}
          </span>
        ) : (
          <span>
            ABI: <code>{set.abiName}</code> from <code>./abi</code>
          </span>
        )}
        <span className="spacer" />
        {showAbi ? <span>paste into an ABI array</span> : <code>{active.install}</code>}
      </div>
    </section>
  )
}

function CodeLine({ number, line }: { number: number; line: string }) {
  return (
    <span className="code-line">
      <span className="code-ln">{number}</span>
      <span className="code-content">
        {tokenizeLine(line).map((token, index) =>
          token.kind ? (
            <span key={index} className={`tok-${token.kind}`}>
              {token.text}
            </span>
          ) : (
            <span key={index}>{token.text}</span>
          ),
        )}
        {line.length === 0 ? ' ' : null}
      </span>
    </span>
  )
}

function readStoredFramework(): ExampleFramework {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (FRAMEWORKS as string[]).includes(stored)) return stored as ExampleFramework
  } catch {
    /* file:// or private mode */
  }
  return 'viem'
}
