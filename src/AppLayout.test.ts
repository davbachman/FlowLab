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
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))

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
  })

  it('keeps the three-column editor layout at zoomed desktop widths', () => {
    const zoomedDesktop = mediaBlockFor('(max-width: 980px) and (min-width: 721px)')

    expect(declarationsFor('.workspace', zoomedDesktop)).toMatchObject({
      'grid-template-columns':
        '220px minmax(320px, 1fr) minmax(340px, var(--runtime-sidebar-width, 420px))',
    })
    expect(zoomedDesktop).not.toContain('grid-template-rows: auto 60vh auto')
    expect(zoomedDesktop).not.toContain('flex-direction: row')
  })

  it('only stacks the workspace for narrow mobile viewports', () => {
    const mobile = mediaBlockFor('(max-width: 720px)')

    expect(declarationsFor('.workspace', mobile)).toMatchObject({
      'grid-template-columns': '1fr',
      'grid-template-rows': 'auto minmax(360px, 60vh) minmax(320px, 50vh)',
    })
  })
})
