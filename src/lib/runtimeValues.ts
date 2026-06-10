import type { DictionaryKey, RuntimeDictionary, RuntimeValue } from './types'

export function isRuntimeDictionary(
  value: RuntimeValue,
): value is RuntimeDictionary {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    value.kind === 'dictionary'
  )
}

export function isDictionaryKey(value: RuntimeValue): value is DictionaryKey {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

export function dictionaryKeysEqual(
  left: DictionaryKey,
  right: DictionaryKey,
): boolean {
  return typeof left === typeof right && left === right
}

export function findDictionaryEntryIndex(
  dictionary: RuntimeDictionary,
  key: DictionaryKey,
): number {
  return dictionary.entries.findIndex((entry) =>
    dictionaryKeysEqual(entry.key, key),
  )
}

export function getDictionaryValue(
  dictionary: RuntimeDictionary,
  key: DictionaryKey,
): RuntimeValue {
  const index = findDictionaryEntryIndex(dictionary, key)

  if (index === -1) {
    throw new Error(`Dictionary key ${stringifyDictionaryKey(key)} does not exist`)
  }

  return dictionary.entries[index].value
}

export function setDictionaryValue(
  dictionary: RuntimeDictionary,
  key: DictionaryKey,
  value: RuntimeValue,
): RuntimeDictionary {
  const index = findDictionaryEntryIndex(dictionary, key)

  if (index === -1) {
    return {
      kind: 'dictionary',
      entries: [...dictionary.entries, { key, value }],
    }
  }

  return {
    kind: 'dictionary',
    entries: dictionary.entries.map((entry, entryIndex) =>
      entryIndex === index ? { key: entry.key, value } : entry,
    ),
  }
}

export function toBoolean(value: RuntimeValue): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length > 0
  }

  return value.entries.length > 0
}

export function stringifyValue(value: RuntimeValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(stringifyNestedValue).join(', ')}]`
  }

  if (isRuntimeDictionary(value)) {
    return `{${value.entries
      .map(
        (entry) =>
          `${stringifyDictionaryKey(entry.key)}: ${stringifyNestedValue(entry.value)}`,
      )
      .join(', ')}}`
  }

  if (typeof value === 'boolean') {
    return value ? 'True' : 'False'
  }

  return String(value)
}

export function valuesEqual(left: RuntimeValue, right: RuntimeValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false
    }

    return (
      left.length === right.length &&
      left.every((leftItem, index) => valuesEqual(leftItem, right[index]))
    )
  }

  if (isRuntimeDictionary(left) || isRuntimeDictionary(right)) {
    if (!isRuntimeDictionary(left) || !isRuntimeDictionary(right)) {
      return false
    }

    return (
      left.entries.length === right.entries.length &&
      left.entries.every((leftEntry) => {
        const rightIndex = findDictionaryEntryIndex(right, leftEntry.key)
        return (
          rightIndex !== -1 &&
          valuesEqual(leftEntry.value, right.entries[rightIndex].value)
        )
      })
    )
  }

  return left === right
}

function stringifyNestedValue(value: RuntimeValue): string {
  if (typeof value === 'string') {
    return `"${value}"`
  }

  return stringifyValue(value)
}

function stringifyDictionaryKey(key: DictionaryKey): string {
  if (typeof key === 'string') {
    return `"${key}"`
  }

  if (typeof key === 'boolean') {
    return key ? 'True' : 'False'
  }

  return String(key)
}
