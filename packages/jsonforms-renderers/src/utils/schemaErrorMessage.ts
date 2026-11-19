import type { JsonSchema } from '@jsonforms/core'

type SchemaNode = Record<string, unknown>

const KEYWORD = 'x-error-message'

/** Schema keywords whose value maps names to schemas: the segment after one is a name, not a keyword. */
const NAME_MAPS = new Set([
  'properties',
  'patternProperties',
  'definitions',
  '$defs',
  'dependencies',
  'dependentSchemas',
])

/** Schema keywords whose value can be a list of schemas: the segment after one can be an index. */
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'items', 'prefixItems'])

/** What a path segment is: a schema keyword, a name a map assigns to a schema, or a position in a list of schemas. */
type Edge = 'keyword' | 'name' | 'index'

/**
 * Tells keywords from names, so a field called `then` or `contains` isn't taken for the keyword.
 * `previous` is the keyword just before a segment, or undefined when that segment was a name or an index.
 */
function classify(segments: string[]): Edge[] {
  const edges: Edge[] = []
  segments.forEach((segment, i) => {
    const previous = edges[i - 1] === 'keyword' ? segments[i - 1] : undefined
    if (previous && NAME_MAPS.has(previous)) edges.push('name')
    else if (previous && SCHEMA_LISTS.has(previous) && /^\d+$/.test(segment)) edges.push('index')
    else edges.push('keyword')
  })
  return edges
}

/**
 * A message on a `then`, an `else` or an `allOf` entry covers every rule inside it.
 * A message anywhere else covers only the rules written on its own node.
 * `nodeIndex` is the position of the node in the walk: it was reached through segment `nodeIndex - 1`.
 */
const coversInside = (segments: string[], edges: Edge[], nodeIndex: number) => {
  const segment = segments[nodeIndex - 1]
  if (edges[nodeIndex - 1] === 'keyword') return segment === 'then' || segment === 'else'
  return edges[nodeIndex - 1] === 'index' && segments[nodeIndex - 2] === 'allOf'
}

const messageOf = (node: SchemaNode): string | undefined =>
  typeof node[KEYWORD] === 'string' ? node[KEYWORD] : undefined

/** One JSON Pointer token, unescaped (RFC 6901). */
const decode = (segment: string) => segment.replace(/~1/g, '/').replace(/~0/g, '~')

/**
 * The form's own message for a failed rule, from `x-error-message`, or undefined
 * when the form has none and the default message applies.
 *
 * `error.schemaPath` is AJV's path to the failed rule, e.g.
 * `#/then/properties/documents/contains`. The nearest message wins: the node
 * holding the rule first, then the nearest `then`, `else` or `allOf` entry around it.
 */
export function schemaErrorMessage(error: { schemaPath: string }, rootSchema: JsonSchema): string | undefined {
  const segments = error.schemaPath.replace(/^#\/?/, '').split('/').map(decode)
  const edges = classify(segments)
  // The last segment is the failed keyword; every segment before it leads to a schema node.
  const nodes: SchemaNode[] = [rootSchema as SchemaNode]
  for (const segment of segments.slice(0, -1)) {
    const next = nodes[nodes.length - 1][segment]
    // A path this schema can't follow, such as a $ref to another schema.
    if (!next || typeof next !== 'object') return undefined
    nodes.push(next as SchemaNode)
  }

  const own = messageOf(nodes[nodes.length - 1])
  if (own !== undefined) return own

  // nodes[i] was reached through segments[i - 1].
  for (let i = nodes.length - 2; i > 0; i--) {
    // Errors inside a `contains` say why an item didn't match, not that the rule failed.
    if (edges[i] === 'keyword' && segments[i] === 'contains') return undefined
    if (coversInside(segments, edges, i)) {
      const message = messageOf(nodes[i])
      if (message !== undefined) return message
    }
  }
  return undefined
}
