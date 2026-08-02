import { createContext, useContext, useMemo, type ReactNode } from 'react'

export interface SearchOption {
  id: string
  name: string
}

export interface SearchResult {
  options: SearchOption[]
  nextCursor?: unknown // opaque pagination token — the control passes it back as `cursor` on "load more"; unknown intentionally so consumers don't need to inspect it
}

export interface SearchService {
  // `signal` aborts when the query changes or the dropdown closes — must be honored to avoid stale results
  search(args: { query: string; cursor?: unknown; signal: AbortSignal }): Promise<SearchResult>
  // `resolve` is optional — turns a single stored id to its display name for the selected option; if not provided, the control will use the raw id as the display name
  resolve?(value: string): Promise<SearchOption | undefined>
}

export type SearchServiceRegistry = Record<string, SearchService>

const SearchServiceContext = createContext<SearchServiceRegistry | null>(null)

export function SearchServiceProvider({
  children,
  services,
}: {
  children: ReactNode
  services: SearchServiceRegistry
}) {
  const value = useMemo(() => services, [services]) // memoized by reference — pass a stable object (module-scope const or useMemo) to avoid re-rendering all controls on every render
  return <SearchServiceContext.Provider value={value}>{children}</SearchServiceContext.Provider>
}

export function useSearchService(name: string | undefined): SearchService | null {
  const registry = useContext(SearchServiceContext)
  if (!registry || !name) return null
  return registry[name] ?? null
}
