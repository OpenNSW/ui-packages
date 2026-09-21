// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JsonForms } from '@jsonforms/react'
import { Theme } from '@radix-ui/themes'
import type { JsonSchema, UISchemaElement } from '@jsonforms/core'
import { radixRenderers } from './index'
import { SearchServiceProvider, type SearchService } from '../contexts/SearchServiceContext'

type Data = Record<string, unknown>

const finishers: (() => void)[] = []
afterEach(() => {
  for (const stop of finishers) stop()
  finishers.length = 0
  cleanup()
})

const schema = {
  type: 'object',
  properties: {
    continent: { type: 'string', title: 'Continent' },
    country: {
      type: 'string',
      title: 'Country',
      'x-search': { service: 'countries', mode: 'small-list', dependsOn: 'continent' },
    },
  },
} as unknown as JsonSchema

const uischema = {
  type: 'VerticalLayout',
  elements: [
    { type: 'Control', scope: '#/properties/continent' },
    { type: 'Control', scope: '#/properties/country' },
  ],
} as UISchemaElement

function renderForm(seed: Data, search: SearchService['search']) {
  const writes: Data[] = []
  let live = true
  finishers.push(() => {
    live = false
  })

  const services = {
    countries: {
      search,
      async resolve(value: string) {
        return { id: value, name: value }
      },
    },
  }

  function Harness() {
    const [initial] = useState(seed)
    return (
      <Theme>
        <SearchServiceProvider services={services}>
          <JsonForms
            schema={schema}
            uischema={uischema}
            data={initial}
            renderers={radixRenderers}
            onChange={({ data }) => {
              if (live) writes.push(data as Data)
            }}
          />
        </SearchServiceProvider>
      </Theme>
    )
  }

  render(<Harness />)
  return { writes, latest: () => writes[writes.length - 1] }
}

describe('SearchSelectControl dependsOn', () => {
  it('does not fetch and shows gating copy until the sibling is set', async () => {
    const searches: unknown[] = []
    renderForm({}, async (args) => {
      searches.push(args)
      return { options: [{ id: 'lk', name: 'Sri Lanka' }] }
    })

    const country = screen.getAllByRole('textbox')[1]
    fireEvent.focus(country)

    expect(await screen.findByText('Select the related field first.')).toBeTruthy()
    expect(searches).toHaveLength(0)
  })

  it('clears this field when the sibling value changes', async () => {
    const { latest } = renderForm({ continent: 'asia', country: 'lk' }, async () => ({
      options: [{ id: 'lk', name: 'Sri Lanka' }],
    }))

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'europe' } })

    await waitFor(() => {
      expect(latest()?.continent).toBe('europe')
      expect(latest()?.country == null).toBe(true)
    })
  })
})
