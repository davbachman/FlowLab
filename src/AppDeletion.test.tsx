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

  it.each(roots.flatMap(root => ['Delete', 'Backspace'].map(key => ({ ...root, key }))))(
    'deletes a collapsed $kind and its hidden contents with $key, with one Undo and Redo',
    async ({ kind, name, id, removed, key }) => {
      const user = userEvent.setup()
      render(<App />)
      await loadObjectExample(user)
      const save = saveGraph(user)

      // Keep an unrelated collapsed group, or a nested collapsed Method, in the graph.
      if (kind === 'function') {
        fireEvent.click(screen.getByLabelText('Collapse method move'))
        fireEvent.click(screen.getByLabelText('Collapse class Point'))
      } else if (kind === 'method') {
        fireEvent.click(screen.getByLabelText('Collapse method __repr__'))
      } else {
        fireEvent.click(screen.getByLabelText('Collapse method move'))
      }
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

  it.each(roots)('keeps an expanded $kind body when deleting only its root', async ({ kind, name, id }) => {
    const user = userEvent.setup()
    render(<App />)
    await loadObjectExample(user)
    expect(screen.getByLabelText(`Collapse ${kind} ${name}`)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId(`flow-node-${id}`))

    await user.keyboard('{Delete}')

    await waitFor(() => expect(screen.queryByTestId(`flow-node-${id}`)).not.toBeInTheDocument())
    const after = await saveGraph(user)()
    expect(after.nodes.map(node => node.id)).toEqual(objectSampleProgram.nodes.filter(node => node.id !== id).map(node => node.id))
    expect(after.edges).toEqual(objectSampleProgram.edges.filter(edge => edge.source !== id && edge.target !== id))
  })

  it('deletes multiple collapsed roots together and restores their nested settings with one Undo', async () => {
    const user = userEvent.setup()
    render(<App />)
    await loadObjectExample(user)
    fireEvent.click(screen.getByLabelText('Collapse method move'))
    fireEvent.click(screen.getByLabelText('Collapse class Point'))
    fireEvent.click(screen.getByLabelText('Collapse function main'))
    const save = saveGraph(user)
    const before = await save()
    fireEvent.click(screen.getByTestId('flow-node-point-class'))
    fireEvent.click(screen.getByTestId('flow-node-object-main'), { shiftKey: true })

    await user.keyboard('{Delete}')

    await waitFor(() => expect(screen.queryByTestId('flow-node-point-class')).not.toBeInTheDocument())
    const after = await save()
    expect(after.nodes).toEqual([])
    expect(after.edges).toEqual([])
    await menuAction(user, 'Edit', 'Undo')
    expect(await save()).toEqual(before)
    fireEvent.click(screen.getByLabelText('Expand class Point'))
    expect(screen.getByTestId('flow-node-point-move')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.queryByTestId('flow-node-move-dx')).not.toBeInTheDocument()
    expect(screen.getByTestId('flow-node-repr-return')).toBeInTheDocument()
    expect(screen.getByTestId('flow-node-object-main')).toHaveAttribute('data-collapsed', 'true')
  })
})
