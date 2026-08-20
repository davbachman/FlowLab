import { describe, expect, it } from 'vitest'
import {
  characterCode,
  characterFromCode,
  isTextFunctionName,
} from './text'

describe('text library', () => {
  it('recognizes chr and ord as text functions', () => {
    expect(isTextFunctionName('chr')).toBe(true)
    expect(isTextFunctionName('ord')).toBe(true)
    expect(isTextFunctionName('sqrt')).toBe(false)
  })

  it('converts Unicode code points and characters', () => {
    expect(characterFromCode([65])).toBe('A')
    expect(characterCode(['A'])).toBe(65)
    expect(characterFromCode([128578])).toBe('🙂')
    expect(characterCode(['🙂'])).toBe(128578)
  })

  it('rejects invalid chr arguments', () => {
    for (const args of [[], [65, 66], ['65'], [65.5], [-1], [1114112]]) {
      expect(() => characterFromCode(args)).toThrow(
        /chr requires exactly one integer from 0 through 1114111/,
      )
    }
  })

  it('rejects invalid ord arguments', () => {
    for (const args of [[], ['A', 'B'], [65], [''], ['AB'], ['e\u0301']]) {
      expect(() => characterCode(args)).toThrow(
        /ord requires exactly one string character/,
      )
    }
  })
})
