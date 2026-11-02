import type { ExecutionState, ObjectHeap, RuntimeObjectInstance } from './interpreter'

// A persistent radix tree: 64 instances per leaf, 32 children per branch.
// Writes copy one leaf and its ancestor path, never the complete object table.
const PAGE_SIZE = 64
const BRANCH_SIZE = 32
const MAX_ARRAY_INDEX = 2 ** 32 - 2
type HeapNode = Array<HeapNode | RuntimeObjectInstance | undefined>
interface KeyOrder { key: PropertyKey; previous?: KeyOrder }
interface Store {
  root: HeapNode
  height: number
  extras: ObjectHeap
  order?: KeyOrder
  snapshot?: ObjectHeap
  source?: ObjectHeap
}

// Tokens are used only inside an interpreter/debugger API call. Public heaps
// are ordinary objects, with no Proxy, symbols, methods, or custom prototypes.
const stores = new WeakMap<ObjectHeap, Store>()
const publicStates = new WeakMap<ExecutionState, { heap: ObjectHeap; get: () => ObjectHeap }>()
const publishedStates = new WeakMap<ExecutionState, ExecutionState>()

function treeId(id: number): boolean {
  return Number.isSafeInteger(id) && id >= 0
}

function slot(id: number, height: number): number {
  return height === 0 ? id % PAGE_SIZE : Math.floor(id / (PAGE_SIZE * BRANCH_SIZE ** (height - 1))) % BRANCH_SIZE
}

function token(store: Store): ObjectHeap {
  const heap: ObjectHeap = {}
  stores.set(heap, store)
  return heap
}

export function heapInstance(heap: ObjectHeap, id: number): RuntimeObjectInstance | undefined {
  const store = stores.get(heap)
  if (!store) return heap[id]
  if (!treeId(id)) return store.extras[id] ?? store.source?.[id]
  if (id >= PAGE_SIZE * BRANCH_SIZE ** store.height) return store.source?.[id]
  let node: HeapNode | undefined = store.root
  for (let height = store.height; height > 0; height--) {
    node = node?.[slot(id, height)] as HeapNode | undefined
  }
  return (node?.[slot(id, 0)] as RuntimeObjectInstance | undefined) ?? store.source?.[id]
}

function copyPath(node: HeapNode | undefined, height: number, id: number, instance: RuntimeObjectInstance): HeapNode {
  const next = node ? node.slice() : []
  const index = slot(id, height)
  next[index] = height === 0 ? instance : copyPath(node?.[index] as HeapNode | undefined, height - 1, id, instance)
  return next
}

/** Import a plain/cloned/externally edited heap into private pages. */
function internalHeap(heap: ObjectHeap): ObjectHeap {
  if (stores.has(heap)) return heap
  const store: Store = { root: [], height: 0, extras: {}, snapshot: heap, source: heap }
  for (const key of Reflect.ownKeys(heap)) {
    if (!Object.prototype.propertyIsEnumerable.call(heap, key)) continue
    const id = typeof key === 'string' ? Number(key) : NaN
    const instance = Reflect.get(heap, key) as RuntimeObjectInstance
    if (typeof key === 'string' && String(id) === key && treeId(id)) {
      while (id >= PAGE_SIZE * BRANCH_SIZE ** store.height) {
        store.root = [store.root]
        store.height++
      }
      // This builder owns every node. Only later updates use copy-on-write.
      let node = store.root
      for (let height = store.height; height > 0; height--) {
        const index = slot(id, height)
        node = (node[index] ??= []) as HeapNode
      }
      node[slot(id, 0)] = instance
    } else {
      Object.defineProperty(store.extras, key, { value: instance, enumerable: true, writable: true, configurable: true })
    }
    if (!(typeof key === 'string' && String(id) === key && treeId(id) && id <= MAX_ARRAY_INDEX)) {
      store.order = { key, previous: store.order }
    }
  }
  return token(store)
}

export function withHeapInstance(heap: ObjectHeap, instance: RuntimeObjectInstance): ObjectHeap {
  heap = internalHeap(heap)
  const old = stores.get(heap)!
  const { id } = instance
  let { root, height, extras, order } = old
  if ((!treeId(id) || id > MAX_ARRAY_INDEX) && !heapInstance(heap, id)) {
    order = { key: String(id), previous: order }
  }
  if (treeId(id)) {
    while (id >= PAGE_SIZE * BRANCH_SIZE ** height) {
      root = [root]
      height++
    }
    root = copyPath(root, height, id, instance)
  } else {
    extras = { ...extras, [id]: instance }
  }
  return token({ root, height, extras, order })
}

function publicHeap(heap: ObjectHeap): ObjectHeap {
  const store = stores.get(heap)!
  if (store.snapshot) return store.snapshot
  const entries: Array<[PropertyKey, RuntimeObjectInstance]> = []
  function visit(node: HeapNode, height: number, offset: number): void {
    node.forEach((value, index) => {
      const id = offset + index * (height === 0 ? 1 : PAGE_SIZE * BRANCH_SIZE ** (height - 1))
      if (height) {
        if (value !== undefined) visit(value as HeapNode, height - 1, id)
      } else if (id <= MAX_ARRAY_INDEX) {
        entries.push([String(id), value as RuntimeObjectInstance])
      }
    })
  }
  visit(store.root, store.height, 0)
  const keys: PropertyKey[] = []
  for (let order = store.order; order; order = order.previous) keys.push(order.key)
  for (const key of keys.reverse()) {
    const value = typeof key === 'string' && String(Number(key)) === key && treeId(Number(key))
      ? heapInstance(heap, Number(key)) : Reflect.get(store.extras, key) as RuntimeObjectInstance
    entries.push([key, value!])
  }
  store.snapshot = Object.fromEntries(entries)
  return store.snapshot
}

/** Copy a state without observing/materializing its heap accessor. */
function stateWithHeap(state: ExecutionState, heap: ObjectHeap): ExecutionState {
  const next = {} as ExecutionState
  for (const key of Reflect.ownKeys(state)) {
    if (Object.prototype.propertyIsEnumerable.call(state, key)) {
      Object.defineProperty(next, key, {
        value: key === 'objectHeap' ? heap : Reflect.get(state, key),
        enumerable: true, writable: true, configurable: true,
      })
    }
  }
  return next
}

function internalState(state: ExecutionState): ExecutionState {
  const known = publicStates.get(state)
  const descriptor = Object.getOwnPropertyDescriptor(state, 'objectHeap')
  const heap = known && descriptor?.get === known.get ? known.heap : state.objectHeap
  if (stores.has(heap) && !known) return state
  // A previously observed public table may have been edited by its caller.
  // Reimport it rather than silently trusting cached private data.
  const observed = stores.get(heap)?.snapshot
  const next = stateWithHeap(state, internalHeap(observed ?? heap))
  if (state.stepOverCall) {
    next.stepOverCall = { ...state.stepOverCall, caller: internalState(state.stepOverCall.caller) }
  }
  return next
}

/** Publish every nested debugger caller too, so clone/JSON never sees tokens. */
export function exposeExecutionState(state: ExecutionState): ExecutionState {
  const cached = publishedStates.get(state)
  if (cached) return cached
  const heap = internalHeap(state.objectHeap)
  const next = stateWithHeap(state, heap)
  const get = () => publicHeap(heap)
  Object.defineProperty(next, 'objectHeap', {
    enumerable: true, configurable: true, get,
    set(value: ObjectHeap) {
      Object.defineProperty(next, 'objectHeap', { value, enumerable: true, writable: true, configurable: true })
    },
  })
  publicStates.set(next, { heap, get })
  publishedStates.set(state, next)
  if (state.stepOverCall) {
    next.stepOverCall = { ...state.stepOverCall, caller: exposeExecutionState(state.stepOverCall.caller) }
  }
  return next
}

/** Shared boundary for the one interpreter, raw Steps, and debugger chunks. */
export function withHeapSnapshot(state: ExecutionState, execute: (state: ExecutionState) => ExecutionState): ExecutionState {
  const known = publicStates.has(state)
  if (!known && stores.has(state.objectHeap)) return execute(state)
  const internal = internalState(state)
  const next = execute(internal)
  return next === internal ? state : exposeExecutionState(next)
}
