import type { SearchOption, SearchServiceRegistry } from '../src'

// Richer records than a plain {id, name} — the extra fields are what AutoFillGroup matches
// against sibling scopes (firstName/lastName/department) once an employee is selected.
const EMPLOYEES: SearchOption[] = [
  { id: 'e1', name: 'Amara Perera', firstName: 'Amara', lastName: 'Perera', department: { name: 'Engineering' } },
  { id: 'e2', name: 'Nadeesha Silva', firstName: 'Nadeesha', lastName: 'Silva', department: { name: 'Design' } },
  { id: 'e3', name: 'Ruwan Fernando', firstName: 'Ruwan', lastName: 'Fernando', department: { name: 'Finance' } },
]

// Small fixed list so pagination (5/page) and search filtering are both easy to exercise by hand.
const COUNTRIES: SearchOption[] = [
  { id: 'au', name: 'Australia' },
  { id: 'lk', name: 'Sri Lanka' },
  { id: 'in', name: 'India' },
  { id: 'mv', name: 'Maldives' },
  { id: 'sg', name: 'Singapore' },
  { id: 'my', name: 'Malaysia' },
  { id: 'th', name: 'Thailand' },
  { id: 'jp', name: 'Japan' },
  { id: 'kr', name: 'South Korea' },
  { id: 'cn', name: 'China' },
  { id: 'us', name: 'United States' },
  { id: 'gb', name: 'United Kingdom' },
]

const PAGE_SIZE = 5

export const searchServices: SearchServiceRegistry = {
  countries: {
    async search({ query, cursor }) {
      const matches = query ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())) : COUNTRIES

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
