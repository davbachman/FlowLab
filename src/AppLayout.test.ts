/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(`${process.cwd()}/src/App.css`, 'utf8')
const indexCss = readFileSync(`${process.cwd()}/src/index.css`, 'utf8')

function declarationsFor(
  selector: string,
  css = appCss,
): Record<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(
    new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`),
  )

  if (!match) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }

  return Object.fromEntries(
    match[1]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const [property, ...valueParts] = declaration.split(':')
        return [property.trim(), valueParts.join(':').trim()]
      }),
  )
}

function mediaBlockFor(query: string): string {
  const marker = `@media ${query} {`
  const start = appCss.indexOf(marker)

  if (start === -1) {
    throw new Error(`Missing media query: ${query}`)
  }

  let depth = 0
  for (let index = start; index < appCss.length; index += 1) {
    const character = appCss[index]

    if (character === '{') {
      depth += 1
    }

    if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return appCss.slice(start + marker.length, index)
      }
    }
  }

  throw new Error(`Unclosed media query: ${query}`)
}

describe('app layout scrolling', () => {
  it('anchors the app shell to the full browser viewport', () => {
    expect(declarationsFor('html,\nbody,\n#root', indexCss)).toMatchObject({
      width: '100%',
      height: '100%',
    })
    expect(declarationsFor('body', indexCss)).toMatchObject({
      overflow: 'hidden',
    })
    expect(declarationsFor('.app-shell')).toMatchObject({
      position: 'fixed',
      top: '0',
      left: '0',
      width: 'var(--app-viewport-width, 100vw)',
      height: 'var(--app-viewport-height, 100vh)',
    })
  })

  it('lets sidebars scroll independently and keeps overflowed columns reachable', () => {
    expect(declarationsFor('.app-shell')).toMatchObject({
      overflow: 'hidden',
    })
    expect(declarationsFor('.workspace')).toMatchObject({
      width: '100%',
      'min-width': '0',
      overflow: 'auto',
    })
    expect(declarationsFor('.palette,\n.console-panel')).toMatchObject({
      'box-sizing': 'border-box',
      overflow: 'auto',
    })
    expect(declarationsFor('.palette')).toMatchObject({
      'overflow-x': 'hidden',
    })
    expect(declarationsFor('.sidebar-resize-handle-left')).toMatchObject({
      right: '0',
    })
  })

  it('avoids filtered compositor trails on the moving block preview', () => {
    const preview = declarationsFor('.placement-preview')

    expect(preview).toMatchObject({
      position: 'absolute',
      'pointer-events': 'none',
      opacity: '0.72',
    })
    expect(preview).not.toHaveProperty('filter')
  })

  it('keeps current branch-node highlighting clipped to the diamond shape', () => {
    expect(
      declarationsFor(
        ".flow-node-if[data-current='true'],\n.flow-node-while[data-current='true'],\n.flow-node-for[data-current='true']",
      ),
    ).toMatchObject({
      background: 'transparent',
      'box-shadow': 'none',
    })
    expect(
      declarationsFor(
        ".react-flow__node.selected .flow-node-if[data-current='true'],\n.react-flow__node.selected .flow-node-while[data-current='true'],\n.react-flow__node.selected .flow-node-for[data-current='true']",
      ),
    ).toMatchObject({
      background: 'transparent',
      'box-shadow': 'none',
    })
    expect(
      declarationsFor(
        ".flow-node-if[data-current='true']::before,\n.flow-node-while[data-current='true']::before,\n.flow-node-for[data-current='true']::before",
      ),
    ).toMatchObject({
      background: '#fffbeb',
      'border-color': '#d97706',
    })
  })

  it('renders the resized branch outline separately from its halo', () => {
    const shapeWrapper = declarationsFor('.flow-node-custom-diamond')

    expect(shapeWrapper).toMatchObject({
      position: 'absolute',
      inset: '0 15px',
      'pointer-events': 'none',
    })
    expect(shapeWrapper).not.toHaveProperty('clip-path')
    expect(
      declarationsFor('.flow-node-custom-diamond-svg'),
    ).toMatchObject({
      display: 'block',
      width: '100%',
      height: '100%',
      overflow: 'visible',
    })

    const diamondShape = declarationsFor('.flow-node-custom-diamond-shape')
    expect(diamondShape).toMatchObject({
      fill: '#f7fbff',
      stroke: '#2f6fd6',
      'stroke-linejoin': 'round',
      'stroke-width': '2px',
      'vector-effect': 'non-scaling-stroke',
    })
    expect(diamondShape).not.toHaveProperty('filter')

    const currentShapeWrapper = declarationsFor(
      ".flow-node-width-custom[data-current='true'] > .flow-node-custom-diamond,\n.react-flow__node.selected\n  .flow-node-width-custom[data-current='true']\n  > .flow-node-custom-diamond",
    )
    expect(currentShapeWrapper.filter.replace(/\s+/g, ' ')).toBe(
      'drop-shadow(0 0 2px #ffffff) drop-shadow(0 0 6px rgba(245, 158, 11, 0.72)) drop-shadow(0 12px 12px rgba(146, 64, 14, 0.22))',
    )
    expect(currentShapeWrapper).not.toHaveProperty('clip-path')
    const currentDiamondShape = declarationsFor(
      ".flow-node-width-custom[data-current='true']\n  > .flow-node-custom-diamond\n  .flow-node-custom-diamond-shape,\n.react-flow__node.selected\n  .flow-node-width-custom[data-current='true']\n  > .flow-node-custom-diamond\n  .flow-node-custom-diamond-shape",
    )
    expect(currentDiamondShape).toMatchObject({
      fill: '#fffbeb',
      stroke: '#d97706',
    })
    expect(currentDiamondShape).not.toHaveProperty('filter')
  })

  it('stretches custom block widths and limits resize grips to the horizontal axis', () => {
    expect(declarationsFor('.flow-node-width-custom')).toMatchObject({
      'box-sizing': 'border-box',
      width: '100%',
    })
    expect(
      declarationsFor(
        '.node-width-resizer.react-flow__resize-control.handle',
      ),
    ).toMatchObject({
      width: '9px',
      height: '30px',
      background: '#2f6fd6',
    })
    expect(
      declarationsFor(
        '.flow-node-width-custom.flow-node-if::before,\n.flow-node-width-custom.flow-node-while::before,\n.flow-node-width-custom.flow-node-for::before,\n.flow-node-width-custom.flow-node-if::after,\n.flow-node-width-custom.flow-node-while::after,\n.flow-node-width-custom.flow-node-for::after',
      ),
    ).toMatchObject({
      content: 'none',
    })
    expect(
      declarationsFor(
        '.flow-node-width-custom.flow-node-if .node-content,\n.flow-node-width-custom.flow-node-while .node-content,\n.flow-node-width-custom.flow-node-for .node-content',
      ),
    ).toMatchObject({
      width: 'min(calc(100% - 64px), 540px)',
    })
  })

  it('draws Input and Output as unskewed-content parallelograms', () => {
    expect(
      declarationsFor('.flow-node-input,\n.flow-node-output'),
    ).toMatchObject({
      isolation: 'isolate',
      'border-color': 'transparent',
      background: 'transparent',
      'box-shadow': 'none',
    })
    expect(
      declarationsFor('.flow-node-input::before,\n.flow-node-output::before'),
    ).toMatchObject({
      inset: '-2px 6px',
      border: '2px solid var(--io-node-border)',
      background: 'var(--io-node-background)',
      transform: 'skewX(-11deg)',
    })
    expect(
      declarationsFor(
        '.flow-node-input .node-content,\n.flow-node-output .node-content',
      ),
    ).toMatchObject({
      position: 'relative',
      'z-index': '1',
    })
    expect(
      declarationsFor(
        '.flow-node-input .node-input,\n.flow-node-output .node-input',
      ),
    ).toMatchObject({
      width: 'calc(100% - 16px)',
      display: 'block',
      'margin-inline': 'auto',
    })
    expect(
      declarationsFor(
        ".flow-node-input[data-current='true']::before,\n.flow-node-output[data-current='true']::before,\n.react-flow__node.selected .flow-node-input[data-current='true']::before,\n.react-flow__node.selected .flow-node-output[data-current='true']::before",
      ),
    ).toMatchObject({
      'border-color': '#d97706',
      background: '#fffbeb',
    })
  })

  it('expands class method slots while keeping methods function-shaped', () => {
    expect(declarationsFor('.flow-node-class')).toMatchObject({
      width: 'var(--class-node-width, 200px)',
      'border-color': '#7c3aed',
      background: '#f4f0ff',
    })
    expect(declarationsFor('.class-method-handles')).toMatchObject({
      display: 'grid',
      'grid-template-columns':
        'repeat(var(--class-method-slot-count, 1), minmax(54px, 1fr))',
    })
    expect(
      declarationsFor(
        '.flow-node-function,\n.flow-node-method,\n.flow-node-return',
      ),
    ).toMatchObject({
      'border-radius': '999px',
    })
    expect(appCss).not.toMatch(/\n\.flow-node-method\s*\{/)
  })

  it('keeps the three-column editor layout at zoomed desktop widths', () => {
    const zoomedDesktop = mediaBlockFor('(max-width: 980px) and (min-width: 721px)')

    expect(declarationsFor('.workspace', zoomedDesktop)).toMatchObject({
      'grid-template-columns':
        'var(--palette-sidebar-width, 220px) minmax(320px, 1fr) var(--runtime-sidebar-width, 420px)',
    })
    expect(zoomedDesktop).not.toContain('grid-template-rows: auto 60vh auto')
    expect(zoomedDesktop).not.toContain('flex-direction: row')
  })

  it('only stacks the workspace for narrow mobile viewports', () => {
    const mobile = mediaBlockFor('(max-width: 720px)')

    expect(declarationsFor('.workspace', mobile)).toMatchObject({
      'grid-template-columns': '1fr',
      'grid-template-rows':
        'var(--palette-sidebar-row, max-content) var(--canvas-sidebar-row, minmax(360px, 60vh)) var(--runtime-sidebar-row, minmax(320px, 50vh))',
    })
    expect(declarationsFor('.palette', mobile)).toMatchObject({
      'min-height': 'max-content',
      overflow: 'visible',
    })
  })

  it('keeps toolbar menus visible and compact across viewport sizes', () => {
    expect(declarationsFor('.topbar')).toMatchObject({
      position: 'relative',
      'z-index': '10',
      overflow: 'visible',
    })
    expect(
      declarationsFor(
        '.app-menu-bar,\n.execution-buttons,\n.palette-buttons',
      ),
    ).toMatchObject({
      display: 'flex',
    })
    expect(declarationsFor('.app-menu-bar')).toMatchObject({
      'flex-wrap': 'nowrap',
    })
    expect(declarationsFor('.toolbar-menu-panel')).toMatchObject({
      position: 'absolute',
      'z-index': '12',
    })
    expect(declarationsFor('.modal-backdrop')).toMatchObject({
      'overflow-y': 'auto',
    })
    expect(
      declarationsFor(
        '.filename-modal,\n.about-modal,\n.function-reference-modal',
      ),
    ).toMatchObject({
      'box-sizing': 'border-box',
      'max-height': '100%',
      'overflow-y': 'auto',
    })

    const mobile = mediaBlockFor('(max-width: 720px)')
    expect(declarationsFor('.topbar', mobile)).toMatchObject({
      'flex-direction': 'row',
      'flex-wrap': 'wrap',
    })
    expect(declarationsFor('.topbar-actions', mobile)).toMatchObject({
      width: '100%',
      'justify-content': 'space-between',
    })
    expect(
      declarationsFor('.toolbar-menu:last-child .toolbar-menu-panel', mobile),
    ).toMatchObject({
      right: '0',
      left: 'auto',
    })
  })
})
