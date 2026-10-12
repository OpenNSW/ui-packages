// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { StrictMode, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const resolves: string[] = []
  let live = true
  finishers.push(() => {
    live = false
  })

  const services = {
    countries: {
      search,
      async resolve(value: string) {
        resolves.push(value)
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
  return { writes, latest: () => writes[writes.length - 1], resolves }
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

describe('SearchSelectControl defaultFrom', () => {
  const countryShape = {
    properties: {
      value: { type: 'string' },
      label: { type: 'string' },
    },
    required: ['value'],
  }

  const defaultFromSchema = {
    type: 'object',
    properties: {
      importing_country: {
        type: 'object',
        title: 'Importing Country',
        'x-search': {
          service: 'countries',
          mode: 'small-list',
          displayTemplate: '{name}',
        },
        ...countryShape,
      },
      consignee_country: {
        type: 'object',
        title: 'Consignee Country',
        'x-search': {
          service: 'countries',
          mode: 'small-list',
          displayTemplate: '{name}',
          defaultFrom: 'importing_country',
        },
        ...countryShape,
      },
    },
  } as unknown as JsonSchema

  const defaultFromUi = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Control', scope: '#/properties/importing_country' },
      { type: 'Control', scope: '#/properties/consignee_country' },
    ],
  } as UISchemaElement

  it('copies the sibling into this field while it is empty', async () => {
    const { latest } = renderForm(
      {},
      async () => ({ options: [{ id: 'GB', name: 'United Kingdom' }] }),
      defaultFromSchema,
      defaultFromUi,
    )

    fireEvent.focus(screen.getAllByRole('textbox')[0])
    fireEvent.click(await screen.findByText('United Kingdom'))

    await waitFor(() => {
      expect(latest()?.importing_country).toEqual({ value: 'GB', label: 'United Kingdom' })
      expect(latest()?.consignee_country).toEqual({ value: 'GB', label: 'United Kingdom' })
    })
  })

  it('overwrites this field when the sibling changes', async () => {
    const { latest } = renderForm(
      { consignee_country: { value: 'US', label: 'United States' } },
      async () => ({
        options: [
          { id: 'GB', name: 'United Kingdom' },
          { id: 'US', name: 'United States' },
          { id: 'AU', name: 'Australia' },
        ],
      }),
      defaultFromSchema,
      defaultFromUi,
    )

    fireEvent.focus(screen.getAllByRole('textbox')[0])
    fireEvent.click(await screen.findByText('United Kingdom'))

    await waitFor(() => {
      expect(latest()?.importing_country).toEqual({ value: 'GB', label: 'United Kingdom' })
      expect(latest()?.consignee_country).toEqual({ value: 'GB', label: 'United Kingdom' })
    })

    fireEvent.focus(screen.getAllByRole('textbox')[0])
    fireEvent.click(await screen.findByText('Australia'))

    await waitFor(() => {
      expect(latest()?.importing_country).toEqual({ value: 'AU', label: 'Australia' })
      expect(latest()?.consignee_country).toEqual({ value: 'AU', label: 'Australia' })
    })
  })

  it('keeps a user edit until the sibling changes', async () => {
    const { latest } = renderForm(
      {
        importing_country: { value: 'GB', label: 'United Kingdom' },
        consignee_country: { value: 'GB', label: 'United Kingdom' },
      },
      async () => ({
        options: [
          { id: 'GB', name: 'United Kingdom' },
          { id: 'US', name: 'United States' },
          { id: 'AU', name: 'Australia' },
        ],
      }),
      defaultFromSchema,
      defaultFromUi,
    )

    // Consignee is the second textbox; open it and pick a different country.
    fireEvent.focus(screen.getAllByRole('textbox')[1])
    fireEvent.click(await screen.findByText('United States'))

    await waitFor(() => {
      expect(latest()?.consignee_country).toEqual({ value: 'US', label: 'United States' })
      expect(latest()?.importing_country).toEqual({ value: 'GB', label: 'United Kingdom' })
    })

    fireEvent.focus(screen.getAllByRole('textbox')[0])
    fireEvent.click(await screen.findByText('Australia'))

    await waitFor(() => {
      expect(latest()?.importing_country).toEqual({ value: 'AU', label: 'Australia' })
      expect(latest()?.consignee_country).toEqual({ value: 'AU', label: 'Australia' })
    })
  })

  it('fills again after this field is cleared while the sibling still has a value', async () => {
    const { latest } = renderForm(
      {
        importing_country: { value: 'GB', label: 'United Kingdom' },
        consignee_country: { value: 'US', label: 'United States' },
      },
      async () => ({
        options: [
          { id: 'GB', name: 'United Kingdom' },
          { id: 'US', name: 'United States' },
        ],
      }),
      defaultFromSchema,
      defaultFromUi,
    )

    // Consignee is the second field; its clear control is the second "Clear selection".
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear selection' })[1])

    await waitFor(() => {
      expect(latest()?.consignee_country).toEqual({ value: 'GB', label: 'United Kingdom' })
    })
  })

  it('does not copy when the form is readonly', async () => {
    const writes: Data[] = []
    const services = {
      countries: {
        search: async () => ({ options: [{ id: 'GB', name: 'United Kingdom' }] }),
      },
    }

    function Harness() {
      return (
        <Theme>
          <SearchServiceProvider services={services}>
            <JsonForms
              schema={defaultFromSchema}
              uischema={defaultFromUi}
              data={{ importing_country: { value: 'GB', label: 'United Kingdom' } }}
              renderers={radixRenderers}
              readonly
              onChange={({ data }) => writes.push(data as Data)}
            />
          </SearchServiceProvider>
        </Theme>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getAllByRole('textbox')[0]).toBeTruthy()
    })
    // JsonForms debounces onChange (10ms). Wait past it so a write from the copy effect
    // would have landed.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    // onChange must have run (mount emit), otherwise the check below proves nothing.
    expect(writes.length).toBeGreaterThan(0)
    expect(writes[writes.length - 1].importing_country).toEqual({ value: 'GB', label: 'United Kingdom' })
    expect(writes.some((w) => w.consignee_country != null)).toBe(false)
  })

  it('fills on mount when the sibling already has a value', async () => {
    const { latest } = renderForm(
      { importing_country: { value: 'GB', label: 'United Kingdom' } },
      () => Promise.resolve({ options: [{ id: 'GB', name: 'United Kingdom' }] }),
      defaultFromSchema,
      defaultFromUi,
    )

    await waitFor(() => {
      expect(latest()?.consignee_country).toEqual({ value: 'GB', label: 'United Kingdom' })
    })
  })

  it('clears this field when the sibling is cleared', async () => {
    const { latest } = renderForm(
      {
        importing_country: { value: 'GB', label: 'United Kingdom' },
        consignee_country: { value: 'US', label: 'United States' },
      },
      () => Promise.resolve({ options: [{ id: 'GB', name: 'United Kingdom' }] }),
      defaultFromSchema,
      defaultFromUi,
    )

    // Importing country is the first field; its clear control is the first "Clear selection".
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear selection' })[0])

    await waitFor(() => {
      expect(latest()?.importing_country).toBeUndefined()
      expect(latest()?.consignee_country).toBeUndefined()
    })
  })
})

describe('SearchSelectControl defaultFrom (string mode)', () => {
  const stringSchema = {
    type: 'object',
    properties: {
      importing_country: {
        type: 'string',
        title: 'Importing Country',
        'x-search': { service: 'countries', mode: 'small-list', displayTemplate: '{name}' },
      },
      consignee_country: {
        type: 'string',
        title: 'Consignee Country',
        'x-search': {
          service: 'countries',
          mode: 'small-list',
          displayTemplate: '{name}',
          defaultFrom: 'importing_country',
        },
      },
    },
  } as unknown as JsonSchema

  const stringUi = {
    type: 'VerticalLayout',
    elements: [
      { type: 'Control', scope: '#/properties/importing_country' },
      { type: 'Control', scope: '#/properties/consignee_country' },
    ],
  } as UISchemaElement

  const options = () =>
    Promise.resolve({
      options: [
        { id: 'GB', name: 'United Kingdom' },
        { id: 'US', name: 'United States' },
        { id: 'AU', name: 'Australia' },
      ],
    })

  it('copies the sibling id while empty and overwrites a user edit when the sibling changes', async () => {
    const { latest } = renderForm({}, options, stringSchema, stringUi)

    fireEvent.focus(screen.getAllByRole('textbox')[0])
    fireEvent.click(await screen.findByText('United Kingdom'))

    await waitFor(() => {
      expect(latest()?.importing_country).toBe('GB')
      expect(latest()?.consignee_country).toBe('GB')
    })

    fireEvent.focus(screen.getAllByRole('textbox')[1])
    fireEvent.click(await screen.findByText('United States'))

    await waitFor(() => {
      expect(latest()?.consignee_country).toBe('US')
      expect(latest()?.importing_country).toBe('GB')
    })

    fireEvent.focus(screen.getAllByRole('textbox')[0])
    fireEvent.click(await screen.findByText('Australia'))

    await waitFor(() => {
      expect(latest()?.importing_country).toBe('AU')
      expect(latest()?.consignee_country).toBe('AU')
    })
  })

  it('clears this field to null when the sibling is cleared, like dependsOn', async () => {
    const { latest } = renderForm({ importing_country: 'GB', consignee_country: 'US' }, options, stringSchema, stringUi)

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear selection' })[0])

    await waitFor(() => {
      expect(latest()?.importing_country ?? null).toBeNull()
      expect(latest()).toHaveProperty('consignee_country', null)
    })
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
      (args) => {
        searches.push(args)
        return Promise.resolve({ options: [portOption] })
      },
      formSchema,
      stringUi,
    )

    fireEvent.focus(screen.getByRole('textbox'))
    expect(await screen.findByText('x-search.displayTemplate is required.')).toBeTruthy()
    expect(screen.queryByText('ALTHEIMER')).toBeNull()
    expect(searches).toHaveLength(0)
  })

  it('does not resolve a stored value when displayTemplate is omitted', async () => {
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

    const { resolves } = renderForm(
      { port: 'USTMR' },
      () => Promise.resolve({ options: [portOption] }),
      formSchema,
      stringUi,
    )

    await screen.findByRole('textbox')
    expect(resolves).toHaveLength(0)
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

    const { latest } = renderForm({}, () => Promise.resolve({ options: [portOption] }), formSchema, stringUi)

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.click(await screen.findByText('USTMR-ALTHEIMER'))

    await waitFor(() => {
      expect(latest()?.port).toBe('USTMR')
    })
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('USTMR-ALTHEIMER')
  })

  it('shows displayTemplate for a stored id after resolve is cancelled and retried', async () => {
    const formSchema = {
      type: 'object',
      properties: {
        port: {
          type: 'string',
          title: 'Port',
          'x-search': {
            service: 'countries',
            mode: 'small-list',
            displayTemplate: '{name} ({id})',
          },
        },
      },
    } as unknown as JsonSchema

    const resolves: string[] = []
    render(
      <StrictMode>
        <Theme>
          <SearchServiceProvider
            services={{
              countries: {
                search: () => Promise.resolve({ options: [] }),
                async resolve(value: string) {
                  resolves.push(value)
                  return { id: value, name: 'ALTHEIMER' }
                },
              },
            }}
          >
            <JsonForms schema={formSchema} uischema={stringUi} data={{ port: 'USTMR' }} renderers={radixRenderers} />
          </SearchServiceProvider>
        </Theme>
      </StrictMode>,
    )

    await waitFor(() => {
      expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('ALTHEIMER (USTMR)')
    })
    expect(resolves).toContain('USTMR')
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

    const { latest } = renderForm({}, () => Promise.resolve({ options: [portOption] }), formSchema, stringUi)

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.click(await screen.findByText('USTMR-ALTHEIMER'))

    await waitFor(() => {
      expect(latest()?.port).toEqual({ value: 'USTMR', label: 'USTMR-ALTHEIMER' })
    })
  })
})

describe('SearchSelectControl multi (array of x-search objects)', () => {
  const multiSchema = {
    type: 'object',
    properties: {
      transit_countries: {
        type: 'array',
        title: 'Transit Countries',
        maxItems: 2,
        items: {
          type: 'object',
          'x-search': {
            service: 'countries',
            mode: 'small-list',
            displayTemplate: '{name}',
          },
          properties: {
            value: { type: 'string', minLength: 1 },
            label: { type: 'string' },
          },
          required: ['value'],
        },
      },
    },
  } as unknown as JsonSchema

  const multiUi = {
    type: 'VerticalLayout',
    elements: [{ type: 'Control', scope: '#/properties/transit_countries' }],
  } as UISchemaElement

  const multiOptions = [
    { id: 'IN', name: 'India' },
    { id: 'SG', name: 'Singapore' },
    { id: 'LK', name: 'Sri Lanka' },
  ]

  it('renders a searchable multi dropdown instead of Add Item cards', async () => {
    const { latest } = renderForm({}, async () => ({ options: multiOptions }), multiSchema, multiUi)

    expect(screen.queryByRole('button', { name: /Add Item/ })).toBeNull()
    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.click(await screen.findByText('India'))
    fireEvent.click(await screen.findByText('Singapore'))

    await waitFor(() => {
      expect(latest()?.transit_countries).toEqual([
        { value: 'IN', label: 'India' },
        { value: 'SG', label: 'Singapore' },
      ])
    })
  })

  it('does not add another option once schema.maxItems is reached', async () => {
    const { latest } = renderForm({}, async () => ({ options: multiOptions }), multiSchema, multiUi)

    fireEvent.focus(screen.getByRole('textbox'))
    fireEvent.click(await screen.findByText('India'))
    fireEvent.click(await screen.findByText('Singapore'))
    fireEvent.click(await screen.findByText('Sri Lanka'))

    await waitFor(() => {
      expect(latest()?.transit_countries).toEqual([
        { value: 'IN', label: 'India' },
        { value: 'SG', label: 'Singapore' },
      ])
    })
  })

  it('resolves string-array ids to chip labels on mount', async () => {
    const stringMultiSchema = {
      type: 'object',
      properties: {
        transit_countries: {
          type: 'array',
          title: 'Transit Countries',
          items: {
            type: 'string',
            'x-search': {
              service: 'countries',
              mode: 'small-list',
              displayTemplate: '{name}',
            },
          },
        },
      },
    } as unknown as JsonSchema

    const names: Record<string, string> = { IN: 'India', SG: 'Singapore' }
    const writes: Data[] = []
    const services = {
      countries: {
        search: async () => ({ options: multiOptions }),
        async resolve(value: string) {
          return { id: value, name: names[value] ?? value }
        },
      },
    }

    function Harness() {
      const [data, setData] = useState<Data>({ transit_countries: ['IN', 'SG'] })
      let live = true
      finishers.push(() => {
        live = false
      })
      return (
        <Theme>
          <SearchServiceProvider services={services}>
            <JsonForms
              schema={stringMultiSchema}
              uischema={multiUi}
              data={data}
              renderers={radixRenderers}
              onChange={({ data: next }) => {
                if (!live) return
                writes.push(next as Data)
                setData(next as Data)
              }}
            />
          </SearchServiceProvider>
        </Theme>
      )
    }

    render(<Harness />)

    expect(await screen.findByText('India')).toBeTruthy()
    expect(screen.getByText('Singapore')).toBeTruthy()
    expect(screen.queryByText('IN')).toBeNull()
  })
})
