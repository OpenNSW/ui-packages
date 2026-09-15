import type { SearchOption, SearchServiceRegistry } from '../src'

// Richer records than a plain {id, name} — the extra fields are what AutoFillGroup matches
// against sibling scopes (firstName/lastName/department) once an employee is selected.
const EMPLOYEES: SearchOption[] = [
  { id: 'e1', name: 'Amara Perera', firstName: 'Amara', lastName: 'Perera', department: { name: 'Engineering' } },
  { id: 'e2', name: 'Nadeesha Silva', firstName: 'Nadeesha', lastName: 'Silva', department: { name: 'Design' } },
  { id: 'e3', name: 'Ruwan Fernando', firstName: 'Ruwan', lastName: 'Fernando', department: { name: 'Finance' } },
]

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
    // `params.continent`, when set, lets several fields reuse this one registered service to search the
    // same endpoint scoped to different fixed subsets (e.g. an "Asian country" field vs a "European country" field).
    async search({ query, cursor, params }) {
      const continent = (params as { continent?: string } | undefined)?.continent
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
  employees: {
    async search({ query }) {
      const matches = query ? EMPLOYEES.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) : EMPLOYEES
      return { options: matches, nextCursor: undefined }
    },
    async resolve(value) {
      return EMPLOYEES.find((e) => e.id === value)
    },
  },
}
