import { Fragment, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

interface OutputDrawerProps {
  runId: number | null
  lines: readonly string[]
  error?: string
  viewportHeight: number
}

const MIN_HEIGHT = 96
const DEFAULT_HEIGHT = 180

export function OutputDrawer({ runId, lines, error, viewportHeight }: OutputDrawerProps) {
  const entryCount = lines.length + (error ? 1 : 0)
  const [view, setView] = useState({ runId, expanded: false, dismissed: false, seen: 0 })
  const [preferredHeight, setPreferredHeight] = useState(DEFAULT_HEIGHT)
  const maxHeight = Math.max(MIN_HEIGHT, Math.min(520, Math.floor((viewportHeight - 150) / 2)))
  const height = Math.min(preferredHeight, maxHeight)
  const bodyRef = useRef<HTMLDivElement>(null)
  const followTailRef = useRef(true)
  const resizeRef = useRef<{ pointerId: number; startY: number; height: number } | null>(null)

  // New runs may open the drawer again; new messages within a dismissed run may not.
  if (view.runId !== runId) {
    const expanded = view.expanded || entryCount > 0
    setView({ runId, expanded, dismissed: false, seen: expanded ? entryCount : 0 })
  } else if (!view.expanded && !view.dismissed && entryCount > 0) {
    setView({ ...view, expanded: true, seen: entryCount })
  } else if (view.expanded && view.seen !== entryCount) {
    setView({ ...view, seen: entryCount })
  }

  useLayoutEffect(() => {
    followTailRef.current = true
  }, [runId])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body && view.expanded && followTailRef.current) {
      body.scrollTop = body.scrollHeight
    }
  }, [lines, error, view.expanded, height, runId])

  function toggleExpanded(): void {
    followTailRef.current = true
    setView({ runId, expanded: !view.expanded, dismissed: view.expanded, seen: entryCount })
  }

  function resizeTo(nextHeight: number): void {
    setPreferredHeight(Math.max(MIN_HEIGHT, Math.min(maxHeight, nextHeight)))
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowUp') resizeTo(height + 20)
    else if (event.key === 'ArrowDown') resizeTo(height - 20)
    else if (event.key === 'Home') resizeTo(MIN_HEIGHT)
    else if (event.key === 'End') resizeTo(maxHeight)
    else return
    event.preventDefault()
  }

  function finishResize(event: PointerEvent<HTMLDivElement>): void {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const unread = Math.max(0, entryCount - view.seen)

  return (
    <section
      className="output-drawer"
      aria-label="Output"
      data-expanded={view.expanded}
      style={{ height: view.expanded ? height : 36 }}
    >
      {view.expanded ? (
        <div
          className="output-resize-handle"
          role="separator"
          aria-label="Resize output drawer"
          aria-orientation="horizontal"
          aria-controls="output-drawer-body"
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={maxHeight}
          aria-valuenow={height}
          tabIndex={0}
          onKeyDown={resizeWithKeyboard}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
            resizeRef.current = { pointerId: event.pointerId, startY: event.clientY, height }
          }}
          onPointerMove={(event) => {
            const drag = resizeRef.current
            if (drag?.pointerId === event.pointerId) resizeTo(drag.height + drag.startY - event.clientY)
          }}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onLostPointerCapture={() => { resizeRef.current = null }}
        />
      ) : null}
      <div className="output-drawer-header">
        <button
          type="button"
          className="output-drawer-toggle"
          aria-label={view.expanded ? 'Collapse output' : 'Expand output'}
          aria-expanded={view.expanded}
          aria-controls="output-drawer-body"
          onClick={toggleExpanded}
        >
          <span aria-hidden="true">{view.expanded ? '▾' : '▸'}</span>
          Output
          {lines.length ? <span className="output-line-count">{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span> : null}
        </button>
        {!view.expanded && unread > 0 ? <span className="output-unread" role="status">{unread} new</span> : null}
      </div>
      <div
        id="output-drawer-body"
        className="output-drawer-body"
        hidden={!view.expanded}
        ref={bodyRef}
        tabIndex={0}
        role="log"
        aria-label="Program output"
        aria-live="off"
        onScroll={(event) => {
          const body = event.currentTarget
          followTailRef.current = body.scrollHeight - body.scrollTop - body.clientHeight <= 24
        }}
      >
        {lines.map((line, index) => (
          <div className="console-line" key={index}>
            {line.split('\n').map((part, partIndex, parts) => (
              <Fragment key={partIndex}>{part}{partIndex < parts.length - 1 ? <br /> : null}</Fragment>
            ))}
          </div>
        ))}
        {error ? <p className="runtime-error" role="alert">{error}</p> : null}
        {!lines.length && !error ? <p className="empty-output">No output yet</p> : null}
      </div>
    </section>
  )
}
