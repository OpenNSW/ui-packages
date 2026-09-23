import type { SearchOption, SearchServiceRegistry } from '../src'

// Small fixed list so pagination (5/page) and search filtering are both easy to exercise by hand.
// `size` is only used by the multi-sibling dependsOn map fixture (params.size).
const COUNTRIES: (SearchOption & { continent: string; size: 'large' | 'small' })[] = [
  { id: 'au', name: 'Australia', continent: 'oceania', size: 'large' },
  { id: 'lk', name: 'Sri Lanka', continent: 'asia', size: 'small' },
  { id: 'in', name: 'India', continent: 'asia', size: 'large' },
  { id: 'mv', name: 'Maldives', continent: 'asia', size: 'small' },
  { id: 'sg', name: 'Singapore', continent: 'asia', size: 'small' },
  { id: 'my', name: 'Malaysia', continent: 'asia', size: 'large' },
  { id: 'th', name: 'Thailand', continent: 'asia', size: 'large' },
  { id: 'jp', name: 'Japan', continent: 'asia', size: 'large' },
  { id: 'kr', name: 'South Korea', continent: 'asia', size: 'large' },
  { id: 'cn', name: 'China', continent: 'asia', size: 'large' },
  { id: 'us', name: 'United States', continent: 'north-america', size: 'large' },
  { id: 'gb', name: 'United Kingdom', continent: 'europe', size: 'large' },
]

// A few UN/LOCODE rows from the NPQS port list. Several share the title HAMPTON,
// so a displayTemplate of "{id}-{name}" is what tells them apart.
const PORTS: SearchOption[] = [
  { id: 'USUJS', name: 'HAMPTON' },
  { id: 'USHPF', name: 'HAMPTON' },
  { id: 'USHPN', name: 'HAMPTON' },
  { id: 'USAHM', name: 'HAMPTON' },
  { id: 'GBHMP', name: 'HAMPTON' },
  { id: 'USPHF', name: 'HAMPTON/HAMPTON ROADS' },
  { id: 'USNIM', name: 'NEW HAMPTON' },
  { id: 'USHTO', name: 'EAST HAMPTON' },
]

const PAGE_SIZE = 5

function pageByName(options: SearchOption[], query: string | undefined, cursor: unknown) {
  const matches = query ? options.filter((option) => option.name.toLowerCase().includes(query.toLowerCase())) : options

  // An empty query means "browse everything" — the only fetch small-list ever makes, and
  // large-searchable-list's initial one. Neither mode renders "Load more", so paging here would hide
  // items with no way to reach them. Only page once there's an actual query, like a real search API would.
  if (!query) return { options: matches, nextCursor: undefined }

  const offset = typeof cursor === 'number' ? cursor : 0
  const page = matches.slice(offset, offset + PAGE_SIZE)
  const nextOffset = offset + PAGE_SIZE
  return { options: page, nextCursor: nextOffset < matches.length ? nextOffset : undefined }
}

export const searchServices: SearchServiceRegistry = {
  countries: {
    // Live sibling filters arrive via x-search.dependsOn:
    // - string form → params.parent
    // - map form → one params entry per key (e.g. continent + size)
    // Fixed x-search.params.continent still works the same way for the params fixture.
    async search({ query, cursor, params }) {
      const continent =
        typeof params?.parent === 'string' && params.parent
          ? params.parent
          : typeof params?.continent === 'string'
            ? params.continent
            : undefined
      const size = typeof params?.size === 'string' ? params.size : undefined
      let scoped = continent ? COUNTRIES.filter((c) => c.continent === continent) : COUNTRIES
      if (size) scoped = scoped.filter((c) => c.size === size)
      return pageByName(scoped, query, cursor)
    },
    async resolve(value) {
      return COUNTRIES.find((c) => c.id === value)
    },
  },
  ports: {
    async search({ query, cursor }) {
      return pageByName(PORTS, query, cursor)
    },
    async resolve(value) {
      return PORTS.find((port) => port.id === value)
    },
  },
}
