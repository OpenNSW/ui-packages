import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'

type Listener = () => void

// A side channel scoped to one AutoFillGroup instance: lets a descendant control (e.g.
// SearchSelectControl) hand the group a richer value than what it writes to form data, without
// that richer value ever becoming part of the form's persisted/validated data. Keyed by the
// publishing control's own absolute form path.
export interface AutoFillSourceStore {
  publish(path: string, value: unknown): void
  getValue(path: string): unknown
  subscribe(path: string, listener: Listener): () => void
}

export function createAutoFillSourceStore(): AutoFillSourceStore {
  const values = new Map<string, unknown>()
  const listeners = new Map<string, Set<Listener>>()

  return {
    publish(path, value) {
      if (values.get(path) === value) return
      values.set(path, value)
      listeners.get(path)?.forEach((listener) => listener())
    },
    getValue(path) {
      return values.get(path)
    },
    subscribe(path, listener) {
      let set = listeners.get(path)
      if (!set) {
        set = new Set()
        listeners.set(path, set)
      }
      set.add(listener)
      return () => set.delete(listener)
    },
  }
}

const AutoFillSourceContext = createContext<AutoFillSourceStore | null>(null)

export function AutoFillSourceProvider({ store, children }: { store: AutoFillSourceStore; children: ReactNode }) {
  return <AutoFillSourceContext.Provider value={store}>{children}</AutoFillSourceContext.Provider>
}

// Used by a "source" control to hand its containing AutoFillGroup a richer value than what it
// writes to form data. A no-op when not rendered inside an AutoFillGroup, so any control can call
// this unconditionally without caring whether it's actually being used as a source right now.
export function usePublishAutoFillSource(path: string): (value: unknown) => void {
  const store = useContext(AutoFillSourceContext)
  return useMemo(() => (value: unknown) => store?.publish(path, value), [store, path])
}

// Used by AutoFillGroup to reactively read the current value published at an absolute path.
export function useAutoFillSourceValue(store: AutoFillSourceStore, path: string): unknown {
  return useSyncExternalStore(
    (listener) => store.subscribe(path, listener),
    () => store.getValue(path),
  )
}
