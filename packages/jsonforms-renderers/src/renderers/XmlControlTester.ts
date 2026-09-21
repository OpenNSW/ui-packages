import { rankWith, schemaMatches, and, not, optionIs } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 10 matches FileControlTester/SpreadsheetControlTester — enough to beat
// the default object/Group renderer for a `type: 'object'` schema. The rank ties
// with those, and @jsonforms/react breaks a tie by registration order, so the
// entry in renderers/index.ts is placed deliberately.
//
// The `not(optionIs('export', true))` clause steps aside for a uischema
// element explicitly marked as the export button for this same scope. Two
// `Control`s can point at the identical scope (there's no sub-property of
// XmlControl's own value to give the export button a different one, unlike
// SpreadsheetControl's `sheet`), and both this tester and
// XmlExportControlTester would otherwise match a plain `x-xml` schema at
// the same rank — a tie @jsonforms/react resolves by registration order,
// which would make BOTH elements render whichever renderer is registered
// first. This is additive and backward-compatible: it only changes the
// outcome for an element that explicitly carries `options: { export: true }`
// — see docs/xml-export-control.md.
export const XmlControlTester = rankWith(
  10,
  and(
    schemaMatches((schema: JsonSchema) => {
      // typeof null === 'object' in JS, so `"x-xml": null` would match without
      // this and render an upload control for an empty configuration.
      const xXml = (schema as Record<string, unknown>)['x-xml']
      return schema.type === 'object' && typeof xXml === 'object' && xXml !== null
    }),
    not(optionIs('export', true)),
  ),
)
