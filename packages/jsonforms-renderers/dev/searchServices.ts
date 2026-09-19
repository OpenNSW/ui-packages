import type { SearchOption, SearchServiceRegistry } from '../src'

// Small fixed list so pagination (5/page) and search filtering are both easy to exercise by hand.
const COUNTRIES: (SearchOption & { continent: string })[] = [
  { id: 'au', name: 'Australia', continent: 'oceania' },
  { id: 'lk', name: 'Sri Lanka', continent: 'asia' },
  { id: 'in', name: 'India', continent: 'asia' },
  { id: 'mv', name: 'Maldives', continent: 'asia' },
  { id: 'sg', name: 'Singapore', continent: 'asia' },
  { id: 'my', name: 'Malaysia', continent: 'asia' },
  { id: 'th', name: 'Thailand', continent: 'asia' },
  { id: 'jp', name: 'Japan', continent: 'asia' },
  { id: 'kr', name: 'South Korea', continent: 'asia' },
  { id: 'cn', name: 'China', continent: 'asia' },
  { id: 'us', name: 'United States', continent: 'north-america' },
  { id: 'gb', name: 'United Kingdom', continent: 'europe' },
]

const PAGE_SIZE = 5

export const searchServices: SearchServiceRegistry = {
  countries: {
    // `params.continent` (fixed, from x-search.params) or `params.parent` (live sibling, from
    // x-search.dependsOn) scopes this one registered service to a continent subset.
    async search({ query, cursor, params }) {
      // `parent` is the live sibling value SearchSelectControl sends when the field has
      // x-search.dependsOn. Same filter as the fixed `params.continent` the params fixture uses.
      const continent =
        typeof params?.parent === 'string' && params.parent
          ? params.parent
          : typeof params?.continent === 'string'
            ? params.continent
            : undefined
      const scoped = continent ? COUNTRIES.filter((c) => c.continent === continent) : COUNTRIES
      const matches = query ? scoped.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())) : scoped

      // An empty query means "browse everything" — the only fetch small-list ever makes, and
      // large-searchable-list's initial one. Neither mode renders "Load more", so paging here would hide
      // items with no way to reach them. Only page once there's an actual query, like a real search API would.
      if (!query) return { options: matches, nextCursor: undefined }

      const offset = typeof cursor === 'number' ? cursor : 0
      const page = matches.slice(offset, offset + PAGE_SIZE)
      const nextOffset = offset + PAGE_SIZE
      return { options: page, nextCursor: nextOffset < matches.length ? nextOffset : undefined }
    },
    async resolve(value) {
      return COUNTRIES.find((c) => c.id === value)
    },
  },
}
