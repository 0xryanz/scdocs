import { useMemo, useSyncExternalStore } from 'react'
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

  const active = set.items.find((item) => item.id === framework) ?? set.items[0]
  if (!active) return null

  return (
    <section className="examples" aria-label="Contract call examples">
      <div className="examples-head">
        <span className="examples-title">
          <Icon name="braces" size={13} />
          Call examples
        </span>
        <span className="hint">TypeScript · mirrors the values above</span>
      </div>

      <div className="code-tabs" role="tablist" aria-label="Example framework">
        {set.items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === active.id}
            className={`code-tab${item.id === active.id ? ' active' : ''}`}
            onClick={() => selectFramework(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="code-panel">
        <div className="code-panel-head">
          <span className="code-file">{active.file}</span>
          <span className="badge code-lang">{active.language}</span>
          <span className="spacer" />
          <CopyButton text={active.code} label="copy code" />
        </div>
        <pre className="code-pre" tabIndex={0}>
          <code>
            {active.code.split('\n').map((line, index) => (
              <CodeLine key={index} number={index + 1} line={line} />
            ))}
          </code>
        </pre>
      </div>

      <div className="examples-foot">
        <span>
          ABI: <code>{set.abiName}</code> from <code>./abi</code>
        </span>
        <span className="spacer" />
        <code>{active.install}</code>
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
