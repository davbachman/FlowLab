import '@testing-library/jest-dom/vitest'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverStub,
})

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: () => 'blob:flowlab-test',
})

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: () => {},
})

const localStorageItems = new Map<string, string>()

Object.defineProperty(window, 'localStorage', {
  writable: true,
  configurable: true,
  value: {
    clear: () => localStorageItems.clear(),
    getItem: (key: string) => localStorageItems.get(key) ?? null,
    removeItem: (key: string) => {
      localStorageItems.delete(key)
    },
    setItem: (key: string, value: string) => {
      localStorageItems.set(key, value)
    },
  },
})
