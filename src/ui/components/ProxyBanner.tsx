import { useEffect, useState } from 'react'
import type { ContractDoc, Hex } from '../../shared/types'
import { useDocs } from '../context'
import { shortAddress } from '../lib/format'
import { Icon } from './Icon'

/** EIP-1967 implementation slot. */
const IMPLEMENTATION_SLOT: Hex =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'

export function ProxyBanner({ contract }: { contract: ContractDoc }) {
  const ctx = useDocs()
  const address = ctx.addressFor(contract)
  const [implementation, setImplementation] = useState<Hex | undefined>()

  useEffect(() => {
    if (!address || !ctx.publicClient) {
      setImplementation(undefined)
      return
    }
    let cancelled = false
    ctx.publicClient
      .getStorageAt({ address, slot: IMPLEMENTATION_SLOT })
      .then((value) => {
        if (!cancelled) setImplementation(addressFromWord(value))
      })
      .catch(() => {
        if (!cancelled) setImplementation(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [address, ctx.publicClient])

  if (!implementation) return null

  const target = contract.proxyTargetId
    ? ctx.bundle.contracts.find((item) => item.id === contract.proxyTargetId)
    : undefined

  return (
    <div className="banner proxy-banner">
      <Icon name="proxy" size={14} style={{ marginTop: 2 }} />
      <div>
        EIP-1967 proxy · implementation <code>{shortAddress(implementation, 6)}</code>
      </div>
      <span className="spacer" />
      {ctx.explorer ? (
        <a
          className="btn btn-ghost btn-sm"
          href={`${ctx.explorer}/address/${implementation}`}
          target="_blank"
          rel="noreferrer"
        >
          explorer <Icon name="external" size={11} />
        </a>
      ) : null}
      {target ? (
        <button
          className="btn btn-sm"
          onClick={() => {
            ctx.setAddressFor(target.id, implementation)
            ctx.openContract(target.id)
          }}
        >
          Open implementation docs
        </button>
      ) : (
        <span className="hint">Map this proxy in scdocs.config.ts to show its implementation ABI.</span>
      )}
    </div>
  )
}

function addressFromWord(value?: string): Hex | undefined {
  if (!value || value === '0x') return undefined
  const word = value.slice(-40)
  if (!/^[0-9a-fA-F]{40}$/.test(word) || /^0+$/.test(word)) return undefined
  return `0x${word}` as Hex
}
