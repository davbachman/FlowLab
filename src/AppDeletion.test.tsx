import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { objectSampleProgram } from './lib/objectSampleProgram'
import type { Program } from './lib/types'

type User = ReturnType<typeof userEvent.setup>
type SaveWindow = Window & {
  showSaveFilePicker?: () => Promise<{
    name: string
    createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }>
  }>
}

const roots = [
  {
    kind: 'function', name: 'main', id: 'object-main',
    removed: ['object-main', 'make-point', 'move-point', 'show-point', 'show-x', 'show-y', 'object-return'],
  },
  {
    kind: 'method', name: 'move', id: 'point-move',
    removed: ['point-move', 'move-dx', 'move-dy', 'move-x', 'move-return'],
  },
  {
    kind: 'class', name: 'Point', id: 'point-class',
    removed: ['point-class', 'point-init', 'point-move', 'move-dx', 'move-dy', 'move-x', 'move-return', 'point-repr', 'repr-return'],
  },
]

async function menuAction(user: User, menu: string, action: string) {
  await user.click(screen.getByRole('button', { name: menu }))
  await user.click(screen.getByRole('menuitem', { name: action }))
}

async function loadObjectExample(user: User) {
  await menuAction(user, 'Examples', 'Object')
  await screen.findByTestId('flow-node-point-class')
}

function saveGraph(user: User) {
  const write = vi.fn<(blob: Blob) => Promise<void>>().mockResolvedValue(undefined)
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  ;(window as SaveWindow).showSaveFilePicker = async () => ({
    name: 'deletion.json', createWritable: async () => ({ write, close }),
  })
  return async (): Promise<Program> => {
    const expectedCount = close.mock.calls.length + 1
    await menuAction(user, 'File', 'Save')
    await waitFor(() => expect(close).toHaveBeenCalledTimes(expectedCount))
    return JSON.parse(await write.mock.calls.at(-1)![0].text()) as Program
  }
}

describe('deleting collapsed blocks', () => {
  afterEach(() => {
    delete (window as SaveWindow).showSaveFilePicker
  })

  it.each(['Delete', 'Backspace'].map(key => ({ ...roots[0], key })))(
    'deletes a collapsed $kind and its hidden contents with $key, with one Undo and Redo',
    async ({ kind, name, id, removed, key }) => {
      const user = userEvent.setup()
      render(<App />)
      await loadObjectExample(user)
      const save = saveGraph(user)

      // Keep an unrelated collapsed Method and its Class in the graph.
      fireEvent.click(screen.getByLabelText('Collapse method move'))
      fireEvent.click(screen.getByLabelText(`Collapse ${kind} ${name}`))
      const before = await save()
      fireEvent.click(screen.getByTestId(`flow-node-${id}`))

      await user.keyboard(`{${key}}`)

      await waitFor(() => expect(screen.queryByTestId(`flow-node-${id}`)).not.toBeInTheDocument())
      for (const deletedId of removed) expect(screen.queryByTestId(`flow-node-${deletedId}`)).not.toBeInTheDocument()
      const after = await save()
      expect(after.nodes).toEqual(before.nodes.filter(node => !removed.includes(node.id)))
      expect(after.edges).toEqual(before.edges.filter(edge => !removed.includes(edge.source) && !removed.includes(edge.target)))

      await menuAction(user, 'Edit', 'Undo')
      expect(await save()).toEqual(before)
      expect(screen.getByTestId(`flow-node-${id}`)).toHaveAttribute('data-collapsed', 'true')
      for (const hiddenId of removed.filter(deletedId => deletedId !== id)) {
        expect(screen.queryByTestId(`flow-node-${hiddenId}`)).not.toBeInTheDocument()
      }
      await menuAction(user, 'Edit', 'Redo')
      expect(await save()).toEqual(after)
    },
  )

  it.each(roots)('keeps an expanded $kind body when deleting only its root', async ({ id }) => {
    const user = userEvent.setup()
    render(<App />)
    await loadObjectExample(user)
    fireEvent.click(screen.getByTestId(`flow-node-${id}`))

    await user.keyboard('{Delete}')

    await waitFor(() => expect(screen.queryByTestId(`flow-node-${id}`)).not.toBeInTheDocument())
    const after = await saveGraph(user)()
    expect(after.nodes.map(node => node.id)).toEqual(objectSampleProgram.nodes.filter(node => node.id !== id).map(node => node.id))
    expect(after.edges).toEqual(objectSampleProgram.edges.filter(edge => edge.source !== id && edge.target !== id))
  })

  it('reveals collapsed init Inputs and Methods when their Class is deleted and restores their settings with Undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadObjectExample(user)
    fireEvent.click(screen.getByLabelText('Collapse method move'))
    fireEvent.click(screen.getByLabelText('Collapse method __repr__'))
    fireEvent.click(screen.getByLabelText('Collapse init Point'))
    fireEvent.click(screen.getByLabelText('Collapse function main'))
    const save = saveGraph(user)
    const before = await save()
    fireEvent.click(screen.getByTestId('flow-node-point-class'))
    fireEvent.click(screen.getByTestId('flow-node-object-main'), { shiftKey: true })

    await user.keyboard('{Delete}')

    await waitFor(() => expect(screen.queryByTestId('flow-node-point-class')).not.toBeInTheDocument())
    const after = await save()
    const removed = new Set(['point-class', ...roots[0].removed])
    expect(after.nodes).toEqual(before.nodes.filter(node => !removed.has(node.id)))
    expect(after.edges).toEqual(before.edges.filter(edge => !removed.has(edge.source) && !removed.has(edge.target)))
    for (const id of ['point-move', 'move-dx', 'move-return', 'point-repr', 'repr-return', 'point-init']) {
      expect(screen.getByTestId(`flow-node-${id}`)).toBeInTheDocument()
    }
    await menuAction(user, 'Edit', 'Undo')
    expect(await save()).toEqual(before)
    expect(screen.queryByTestId('flow-node-point-move')).not.toBeInTheDocument()
    expect(screen.queryByTestId('flow-node-move-dx')).not.toBeInTheDocument()
    expect(screen.queryByTestId('flow-node-repr-return')).not.toBeInTheDocument()
    expect(screen.queryByTestId('flow-node-point-init')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Expand init Point')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Expand method move')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByLabelText('Expand method __repr__')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('flow-node-object-main')).toHaveAttribute('data-collapsed', 'true')
  })
})
