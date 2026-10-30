import type { AbiParam, ParamDoc, SchemaNode } from '../shared/types.js'
import { arrayInfo, canonicalType, describeType, isNumericType } from './abi.js'

/**
 * ABI param -> ParamDoc, recursively, with a pre-computed JSON Schema.
 *
 * Doing this in the CLI (not the browser) means the UI has zero ABI logic and
 * the same descriptions can be reused for the OpenAPI export.
 */
export function toParamDoc(param: AbiParam, index: number): ParamDoc {
  // Solidity allows unnamed params; keep a stable placeholder so forms and
  // `@param` docs can still line up positionally.
  const name = param.name && param.name.length > 0 ? param.name : ''
  const type = canonicalType(param)

  const doc: ParamDoc = {
    name,
    type,
    internalType: param.internalType,
    schema: buildSchema(param),
  }

  if (param.indexed) doc.indexed = true

  if (param.type.startsWith('tuple') && param.components) {
    doc.components = param.components.map(toParamDoc)
  }

  if (param.type.startsWith('tuple') && !param.components) {
    // Defensive: some artifacts omit components for empty structs.
    doc.components = []
  }

  const arr = arrayInfo(param.type)
  if (arr) {
    // `components` belongs to the tuple element, so it travels with the inner type.
    doc.element = toParamDoc(
      { name: '', type: arr.inner, components: param.components, internalType: param.internalType },
      0,
    )
  }

  return doc
}

function buildSchema(param: AbiParam): SchemaNode {
  const type = param.type
  const sol = canonicalType(param)

  const arr = arrayInfo(type)
  if (arr) {
    const elementParam: AbiParam = { ...param, type: arr.inner }
    const node: SchemaNode = {
      type: 'array',
      items: buildSchema(elementParam),
      description: describeType(sol),
      'x-sol': sol,
    }
    if (arr.size !== null) {
      node.minItems = arr.size
      node.maxItems = arr.size
    }
    return node
  }

  if (type.startsWith('tuple')) {
    const props: Record<string, SchemaNode> = {}
    const required: string[] = []
    ;(param.components ?? []).forEach((c, i) => {
      const key = c.name && c.name.length > 0 ? c.name : String(i)
      props[key] = buildSchema(c)
      required.push(key)
    })
    return {
      type: 'object',
      properties: props,
      required,
      description: 'Struct',
      'x-sol': sol,
    }
  }

  if (isNumericType(type)) {
    const signed = type.startsWith('int')
    return {
      type: 'string', // JSON numbers cannot hold uint256 without precision loss
      format: sol,
      pattern: signed ? '^-?[0-9]+$' : '^[0-9]+$',
      description: describeType(sol),
      'x-sol': sol,
    }
  }

  if (type === 'address') {
    return {
      type: 'string',
      format: 'address',
      pattern: '^0x[0-9a-fA-F]{40}$',
      description: describeType(sol),
      'x-sol': sol,
    }
  }

  if (type === 'bool') {
    return { type: 'boolean', description: describeType(sol), 'x-sol': sol }
  }

  if (type === 'string') {
    return { type: 'string', description: describeType(sol), 'x-sol': sol }
  }

  if (type === 'bytes' || /^bytes\d+$/.test(type)) {
    const fixed = /^bytes(\d+)$/.exec(type)
    return {
      type: 'string',
      format: sol,
      pattern: fixed
        ? `^0x([0-9a-fA-F]{2}){${fixed[1]}}$`
        : '^0x([0-9a-fA-F]{2})*$',
      description: describeType(sol),
      'x-sol': sol,
    }
  }

  if (type === 'function') {
    return {
      type: 'string',
      format: 'function',
      pattern: '^0x[0-9a-fA-F]{48}$',
      description: describeType(sol),
      'x-sol': sol,
    }
  }

  return { type: 'string', description: describeType(sol), 'x-sol': sol }
}
