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
      'x-search': { service: 'countries', mode: 'small-list', dependsOn: 'continent', displayTemplate: '{name}' },
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

function renderForm(
  seed: Data,
  search: SearchService['search'],
  formSchema: JsonSchema = schema,
  formUi: UISchemaElement = uischema,
) {
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
            schema={formSchema}
            uischema={formUi}
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

  const mapSchema = {
    type: 'object',
    properties: {
      continent: { type: 'string', title: 'Continent' },
      region: { type: 'string', title: 'Region' },
      country: {
        type: 'string',
        title: 'Country',
        'x-search': {
          service: 'countries',
          mode: 'small-list',
          dependsOn: { continent: 'continent', region: 'region' },
          displayTemplate: '{name}',
        },
      },
    },
  } as unknown as JsonSchema

  const mapUi = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Control', scope: '#/properties/continent' },
      { type: 'Control', scope: '#/properties/region' },
      { type: 'Control', scope: '#/properties/country' },
    ],
  } as UISchemaElement

  it('waits for every mapped sibling before fetching, then sends each as its param key', async () => {
    const searches: Array<{ params?: Record<string, unknown> }> = []
    renderForm(
      { continent: 'asia' },
      async (args) => {
        searches.push(args)
        return { options: [{ id: 'lk', name: 'Sri Lanka' }] }
      },
      mapSchema,
      mapUi,
    )

    fireEvent.focus(screen.getAllByRole('textbox')[2])
    expect(await screen.findByText('Select the related field first.')).toBeTruthy()
    expect(searches).toHaveLength(0)

    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'west' } })

    await waitFor(() => {
      expect(searches.length).toBeGreaterThan(0)
    })
    expect(searches[searches.length - 1]?.params).toEqual({ continent: 'asia', region: 'west' })
  })

  it('clears this field when any mapped sibling that had a value changes', async () => {
    const { latest } = renderForm(
      { continent: 'asia', region: 'west', country: 'lk' },
      async () => ({ options: [{ id: 'lk', name: 'Sri Lanka' }] }),
      mapSchema,
      mapUi,
    )

    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'east' } })

    await waitFor(() => {
      expect(latest()?.region).toBe('east')
      expect(latest()?.country == null).toBe(true)
    })
  })

  it('does not clear when a sibling goes from unset to set', async () => {
    const { latest, writes } = renderForm({ country: 'lk' }, async () => ({
      options: [{ id: 'lk', name: 'Sri Lanka' }],
    }))

    const before = writes.length
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'asia' } })

    await waitFor(() => {
      expect(latest()?.continent).toBe('asia')
    })
    expect(latest()?.country).toBe('lk')
    // continent write only — the clear effect must not also wipe country
    expect(writes.slice(before).every((w) => w.country === 'lk')).toBe(true)
  })

  it('merges mapped siblings into fixed x-search.params', async () => {
    const searches: Array<{ params?: Record<string, unknown> }> = []
    const schemaWithParams = {
      type: 'object',
      properties: {
        continent: { type: 'string', title: 'Continent' },
        region: { type: 'string', title: 'Region' },
        country: {
          type: 'string',
          title: 'Country',
          'x-search': {
            service: 'countries',
            mode: 'small-list',
            dependsOn: { continent: 'continent', region: 'region' },
            params: { id: 'scientific-names', version: '1' },
            displayTemplate: '{name}',
          },
        },
      },
    } as unknown as JsonSchema

    renderForm(
      { continent: 'asia', region: 'west' },
      async (args) => {
        searches.push(args)
        return { options: [{ id: 'lk', name: 'Sri Lanka' }] }
      },
      schemaWithParams,
      mapUi,
    )

    fireEvent.focus(screen.getAllByRole('textbox')[2])

    await waitFor(() => {
      expect(searches.length).toBeGreaterThan(0)
    })
    expect(searches[searches.length - 1]?.params).toEqual({
      id: 'scientific-names',
      version: '1',
      continent: 'asia',
      region: 'west',
    })
  })

  it('does not fetch when a dependsOn map has no valid entries', async () => {
    const searches: unknown[] = []
    const brokenSchema = {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          title: 'Country',
          'x-search': {
            service: 'countries',
            mode: 'small-list',
            dependsOn: { continent: '', region: 3 },
            displayTemplate: '{name}',
          },
        },
      },
    } as unknown as JsonSchema
    const brokenUi = {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/country' }],
    } as UISchemaElement

    renderForm(
      {},
      async (args) => {
        searches.push(args)
        return { options: [{ id: 'lk', name: 'Sri Lanka' }] }
      },
      brokenSchema,
      brokenUi,
    )

    fireEvent.focus(screen.getByRole('textbox'))
    expect(await screen.findByText('Select the related field first.')).toBeTruthy()
    expect(searches).toHaveLength(0)
  })
})

describe('SearchSelectControl displayTemplate', () => {
  const portOption = { id: 'USTMR', name: 'ALTHEIMER' }

  const stringUi = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/port' }],
  } as UISchemaElement

  it('shows a config error when displayTemplate is omitted', async () => {
    const formSchema = {
      type: 'object',
      properties: {
        port: {
          type: 'string',
          title: 'Port',
          'x-search': { service: 'countries', mode: 'small-list' },
        },
      },
    } as unknown as JsonSchema

    const searches: unknown[] = []
    renderForm(
      {},
      async (args) => {
        searches.push(args)
        return { options: [portOption] }
      },
      formSchema,
      stringUi,
    )

    fireEvent.focus(screen.getByRole('textbox'))
    expect(await screen.findByText('x-search.displayTemplate is required.')).toBeTruthy()
    expect(screen.queryByText('ALTHEIMER')).toBeNull()
  })

  it('shows displayTemplate in the dropdown and stores the service id', async () => {
    const formSchema = {
      type: 'object',
      properties: {
        port: {
          type: 'string',
          title: 'Port',
          'x-search': {
            service: 'countries',
            mode: 'small-list',
            displayTemplate: '{id}-{name}',
          },
        },
      },
    } as unknown as JsonSchema

    const { latest } = renderForm({}, async () => ({ options: [portOption] }), formSchema, stringUi)

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.click(await screen.findByText('USTMR-ALTHEIMER'))

    await waitFor(() => {
      expect(latest()?.port).toBe('USTMR')
    })
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('USTMR-ALTHEIMER')
  })

  it('writes the service id and templated label for an object-shaped field', async () => {
    const formSchema = {
      type: 'object',
      properties: {
        port: {
          type: 'object',
          title: 'Port',
          'x-search': {
            service: 'countries',
            mode: 'small-list',
            displayTemplate: '{id}-{name}',
          },
          properties: {
            value: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['value'],
        },
      },
    } as unknown as JsonSchema

    const { latest } = renderForm({}, async () => ({ options: [portOption] }), formSchema, stringUi)

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.click(await screen.findByText('USTMR-ALTHEIMER'))

    await waitFor(() => {
      expect(latest()?.port).toEqual({ value: 'USTMR', label: 'USTMR-ALTHEIMER' })
    })
  })
})
