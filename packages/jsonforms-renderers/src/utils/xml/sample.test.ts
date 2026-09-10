import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createAjv } from '@jsonforms/core'
import { parseXmlToDocument } from './parse'

// End-to-end check over the document the dev playground ships, using the same
// x-xml configuration as the 'xml' fixture in dev/fixtures.ts. It exists for two
// reasons no unit test covers:
//
//  1. docs/xml-control.md documents this file's parsed output, so this is what
//     keeps the documentation honest.
//  2. It validates the persisted value against the same JSON Schema the fixture
//     declares, guarding the trap where a perfectly correct write fails AJV
//     because the schema and the value shape drifted apart — the same lockstep
//     hazard already called out for SpreadsheetValue in dev/fixtures.ts.
const samplePath = fileURLToPath(new URL('../../../dev/sample-files/sales-data-sample.xml', import.meta.url))
const sampleXml = readFileSync(samplePath, 'utf8')

const arrayPaths = ['salesData.sale']

// Mirrors the fixture's sub-schema. Kept literal rather than imported so a
// change to either side has to be made deliberately on both.
// The field's value is the parsed document itself, so `type: 'object'` is the
// whole schema a consuming app needs.
const fieldSchema = { type: 'object' } as const

describe('the dev playground sample document', () => {
  it('parses to the flat records documented in docs/xml-control.md', async () => {
    const document = await parseXmlToDocument(sampleXml, { arrayPaths })
    expect(document).toEqual({
      salesData: {
        sale: [
          // Quantity is a NUMBER while Date stays a STRING — the coercion rules
          // in miniature, and the reason the parser's leading-zero default is
          // overridden.
          { Date: '01/06/2026', Item: 'Widget A', Category: 'Hardware', Quantity: 500 },
          { Date: '02/06/2026', Item: 'Widget B', Category: 'Hardware', Quantity: 300 },
          { Date: '03/06/2026', Item: 'Widget C', Category: 'Accessories', Quantity: 200 },
        ],
      },
    })
  })

  it('parses the rows as an array even without arrayPaths, since there are three of them', async () => {
    // arrayPaths is belt and braces for THIS file, unlike a document with a
    // single repeated element where it is what stops the array collapsing to an
    // object. Both cases are pinned — the other one in parse.test.ts.
    const document = await parseXmlToDocument(sampleXml)
    const salesData = document.salesData as Record<string, unknown>
    expect(Array.isArray(salesData.sale)).toBe(true)
  })

  it('produces a value that validates against the schema the fixture declares', async () => {
    const document = await parseXmlToDocument(sampleXml, { arrayPaths })
    const value = document
    const validate = createAjv({ useDefaults: true }).compile(fieldSchema)
    // JSON round trip because that is how the value actually reaches AJV through
    // the JSONForms store.
    expect(validate(JSON.parse(JSON.stringify(value)))).toBe(true)
  })
})
