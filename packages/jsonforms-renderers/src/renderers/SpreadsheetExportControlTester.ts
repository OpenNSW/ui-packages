import { and, not, optionIs, rankWith, schemaMatches } from '@jsonforms/core'
import type { JsonSchema } from '@jsonforms/core'

// Rank 10 clears the rank-3 array testers (ArrayControlTester /
// PrimitiveArrayControlTester) outright, unconditionally — there's no rank
// tie the way XmlControlTester/XmlExportControlTester have, so by itself this
// would make x-spreadsheet-export claim EVERY Control at that scope, with no way to
// still get the default editable array control there (unlike a rank TIE,
// where a second uischema element could win it back — see XmlControlTester's
// own comment for that case). `not(optionIs('editable', true))` is the escape
// hatch: a second Control at the same scope marked `options: { editable:
// true }` is left to ArrayControlTester/PrimitiveArrayControlTester instead,
// so a schema author who wants both an editable list AND an export button for
// the same array can have both, each on its own uischema element. Without the
// option (the common case — just a download button, no editing), this tester
// still wins outright, same as before. See "Co-locating with an editable
// array control" in docs/spreadsheet-export-control.md.
//
// Self-contained: unlike the XML fix, this needs no change to
// ArrayControlTester/PrimitiveArrayControlTester themselves — those are
// shared, generic testers used by every array field in the package, not
// specific to this control's domain, so leaving them untouched keeps this
// PR's blast radius to its own new files only.
export const SpreadsheetExportControlTester = rankWith(
  10,
  and(
    schemaMatches((schema: JsonSchema) => {
      // typeof null === 'object' in JS, so `"x-spreadsheet-export": null` would
      // match without this and render the button for an empty configuration.
      const opts = (schema as Record<string, unknown>)['x-spreadsheet-export']
      return schema.type === 'array' && typeof opts === 'object' && opts !== null
    }),
    not(optionIs('editable', true)),
  ),
)
