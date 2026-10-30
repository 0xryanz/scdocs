import type {
  ContractDoc,
  DocsBundle,
  FunctionDoc,
  ParamDoc,
  SchemaNode,
} from '../shared/types.js'

/**
 * OpenAPI 3.1 export.
 *
 * This is deliberately a *reference* surface: perfect for Postman, codegen and
 * LLM/agent consumption, and for diffing API shape between releases. The
 * interactive page does not use it (it encodes against the ABI directly), so the
 * spec never has to lie about signing or `msg.sender`.
 */
export function toOpenApi(bundle: DocsBundle): Record<string, unknown> {
  const paths: Record<string, unknown> = {}
  const usedPaths = new Set<string>()

  for (const contract of bundle.contracts) {
    const base = slug(contract.name)
    for (const fn of contract.functions) {
      let path = `/${base}/${fn.selector}`
      let n = 2
      while (usedPaths.has(path)) path = `/${base}-${n++}/${fn.selector}`
      usedPaths.add(path)
      paths[path] = buildOperation(contract, fn)
    }
  }

  const webhooks: Record<string, unknown> = {}
  for (const contract of bundle.contracts) {
    for (const event of contract.events) {
      const key = `${contract.name}.${event.name}`
      webhooks[key] = {
        post: {
          summary: event.summary ?? `Emitted by ${contract.name}.${event.name}`,
          description: joinDocs(event.summary, event.description),
          operationId: `on_${contract.name}_${event.name}`,
          'x-topic0': event.topic0,
          'x-anonymous': event.anonymous,
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: objectSchema(event.inputs) },
            },
          },
          responses: { 200: { description: 'Event payload' } },
        },
      }
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: bundle.title,
      version: bundle.abiHash.slice(2, 10),
      description: bundle.description,
      'x-generator': `${bundle.generator.name}@${bundle.generator.version}`,
      'x-abi-hash': bundle.abiHash,
      'x-generated-at': bundle.generatedAt,
    },
    servers: bundle.chains.map((chain) => ({
      url: chain.rpcUrl ?? `chain://${chain.chainId}`,
      description: chain.name,
      'x-chain-id': chain.chainId,
    })),
    tags: bundle.contracts.map((c) => ({
      name: c.name,
      description: joinDocs(c.summary, c.description) ?? c.title,
      'x-file': c.file,
    })),
    paths,
    ...(Object.keys(webhooks).length ? { webhooks } : {}),
  }
}

function buildOperation(contract: ContractDoc, fn: FunctionDoc): Record<string, unknown> {
  const isRead = fn.mutability === 'view' || fn.mutability === 'pure'
  const properties: Record<string, SchemaNode> = {}
  const required: string[] = []

  fn.inputs.forEach((param, i) => {
    const key = paramKey(param, i)
    properties[key] = { ...param.schema, description: param.description ?? param.schema.description }
    required.push(key)
  })

  // `msg.sender` / `msg.value` are not ABI inputs but they change behaviour.
  properties.__from = {
    type: 'string',
    format: 'address',
    description: 'Value for msg.sender. Defaults to the connected account.',
    'x-implicit': true,
  } as SchemaNode
  if (fn.mutability === 'payable') {
    properties.__value = {
      type: 'string',
      format: 'uint256',
      description: 'msg.value in wei.',
      'x-implicit': true,
    } as SchemaNode
  }

  return {
    post: {
      summary: fn.summary ?? fn.signature,
      description: joinDocs(fn.summary, fn.description),
      operationId: `${contract.name}_${fn.selector.slice(2)}`,
      tags: [contract.name],
      'x-function': fn.signature,
      'x-selector': fn.selector,
      'x-mutability': fn.mutability,
      'x-payable': fn.mutability === 'payable',
      'x-read-only': isRead,
      'x-file': contract.file,
      'x-errors': contract.errors.map((error) => ({
        name: error.name,
        selector: error.selector,
        signature: error.signature,
        description: joinDocs(error.summary, error.description),
      })),
      ...(Object.keys(fn.custom).length ? { 'x-natspec-custom': fn.custom } : {}),
      requestBody: {
        required: required.length > 0,
        content: { 'application/json': { schema: { type: 'object', properties, required } } },
      },
      responses: isRead
        ? {
            200: {
              description: 'Decoded return values',
              content: { 'application/json': { schema: objectSchema(fn.outputs) } },
            },
            400: { description: 'Execution reverted' },
          }
        : {
            200: {
              description: 'Transaction submitted',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      transactionHash: { type: 'string', format: 'hex' },
                    },
                  },
                },
              },
            },
            400: { description: 'Simulation reverted, transaction not sent' },
          },
    },
  }
}

function objectSchema(params: ParamDoc[]): SchemaNode {
  const properties: Record<string, SchemaNode> = {}
  const required: string[] = []
  params.forEach((param, i) => {
    const key = paramKey(param, i)
    properties[key] = { ...param.schema, description: param.description ?? param.schema.description }
    required.push(key)
  })
  return { type: 'object', properties, required }
}

function paramKey(param: ParamDoc, index: number): string {
  return param.name && param.name.length > 0 ? param.name : `arg${index}`
}

function joinDocs(summary?: string, description?: string): string | undefined {
  const parts = [summary, description].filter(Boolean)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

function slug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
}
