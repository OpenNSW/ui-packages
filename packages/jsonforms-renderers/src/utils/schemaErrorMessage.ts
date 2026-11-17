import type { JsonSchema } from '@jsonforms/core'

type SchemaNode = Record<string, unknown>

const KEYWORD = 'x-error-message'

/**
 * A message on a `then`, an `else` or an `allOf` entry covers every rule inside it.
 * A message anywhere else covers only the rules written on its own node.
 */
const coversInside = (segment: string, parentSegment: string | undefined) =>
  segment === 'then' || segment === 'else' || parentSegment === 'allOf'

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
    if (segments[i] === 'contains') return undefined
    if (coversInside(segments[i - 1], segments[i - 2])) {
      const message = messageOf(nodes[i])
      if (message !== undefined) return message
    }
  }
  return undefined
}
