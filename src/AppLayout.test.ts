/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(`${process.cwd()}/src/App.css`, 'utf8')

function declarationsFor(selector: string): Record<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = appCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))

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

describe('app layout scrolling', () => {
  it('lets each sidebar scroll independently within the viewport workspace', () => {
    expect(declarationsFor('.app-shell')).toMatchObject({
      height: '100vh',
    })
    expect(declarationsFor('.workspace')).toMatchObject({
      overflow: 'hidden',
    })
    expect(declarationsFor('.palette,\n.console-panel')).toMatchObject({
      overflow: 'auto',
    })
  })
})
