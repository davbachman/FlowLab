import { describe, expect, it } from 'vitest'
import {
  type EditorEdge,
  withoutReplacedOutgoingEdges,
} from './editorEdges'

function edge(
  id: string,
  source: string,
  target: string,
  label?: 'true' | 'false',
): EditorEdge {
  return { id, source, target, label }
}

describe('outgoing edge replacement', () => {
  it('removes every old outgoing edge from an ordinary block', () => {
    const edges = [
      edge('old-a', 'process', 'first'),
      edge('old-b', 'process', 'second'),
      edge('incoming', 'earlier', 'process'),
      edge('unrelated', 'other', 'later'),
    ]

    expect(
      withoutReplacedOutgoingEdges(edges, 'process', 'process'),
    ).toEqual([edges[2], edges[3]])
  })

  it('replaces only the matching logical branch output', () => {
    const edges = [
      edge('true', 'decision', 'yes', 'true'),
      edge('false', 'decision', 'no', 'false'),
      edge('incoming', 'earlier', 'decision'),
    ]

    expect(
      withoutReplacedOutgoingEdges(edges, 'decision', 'if', 'true'),
    ).toEqual([edges[1], edges[2]])
    expect(
      withoutReplacedOutgoingEdges(edges, 'decision', 'if', 'false'),
    ).toEqual([edges[0], edges[2]])
  })

  it('preserves multiple Method attachments from a Class', () => {
    const edges = [
      edge('first-method', 'class', 'method-a'),
      edge('second-method', 'class', 'method-b'),
    ]

    expect(withoutReplacedOutgoingEdges(edges, 'class', 'class')).toBe(edges)
  })
})
