import { createDraftId, DRAFT_QUERY_PARAM, readRecoveryDraft, type DraftStorage } from './drafts'

export function recoveryStorage(): DraftStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function initialRecoveryState() {
  const requestedId = new URL(window.location.href).searchParams.get(DRAFT_QUERY_PARAM)
  const id = requestedId || createDraftId()
  const result = requestedId ? readRecoveryDraft(recoveryStorage(), id) : null
  return {
    id: result && !result.ok ? createDraftId() : id,
    draft: result?.ok ? result.value : null,
    error: result && !result.ok ? result.error : '',
  }
}
