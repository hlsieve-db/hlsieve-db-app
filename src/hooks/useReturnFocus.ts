import { useEffect, useRef, type RefObject } from 'react'

/**
 * Puts focus back where it was when a dialog opened.
 *
 * A dialog that closes without doing this drops focus on `document.body`: the
 * next Tab starts from the top of the page and a screen reader loses the place
 * the reporter was working in. Restoring is the dialog's job rather than each
 * caller's, so every close path — a button, Escape, the backdrop, a successful
 * save — behaves the same way.
 *
 * The element is remembered rather than looked up again. The thing that opened
 * the dialog can be gone by the time it closes: the row it belonged to may have
 * been filtered away by the very change that was just saved, or the list may
 * have been re-rendered into new nodes. That is what `fallback` is for. Searching
 * the document for something that looks like the old trigger would be worse: it
 * would sometimes find the wrong one.
 */
export function useReturnFocus(fallback?: RefObject<HTMLElement | null>): void {
  // Read during the first render rather than in an effect: by the time effects
  // run, the dialog has already moved focus to its own heading.
  const opener = useRef<HTMLElement | null>(
    typeof document === 'undefined'
      ? null
      : (document.activeElement as HTMLElement | null),
  )
  const fallbackRef = useRef(fallback)
  const pendingFrameRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    fallbackRef.current = fallback
  }, [fallback])

  useEffect(() => {
    // StrictMode immediately cleans up and sets effects up again in development.
    // Cancel the first cleanup's restore so an open dialog keeps focus.
    if (pendingFrameRef.current !== undefined) {
      cancelAnimationFrame(pendingFrameRef.current)
      pendingFrameRef.current = undefined
    }
    const previous = opener.current
    return () => {
      const activeAtCleanup = activeHtmlElement()
      // One frame later: the dialog's own nodes are still being removed as this
      // cleanup runs, and a focus call now can be undone by that removal.
      pendingFrameRef.current = requestAnimationFrame(() => {
        pendingFrameRef.current = undefined
        const activeNow = activeHtmlElement()
        // A real focus target reached after cleanup belongs to the reporter (or
        // to the next UI that opened). Body/html merely mean focus was lost.
        if (
          activeNow !== activeAtCleanup &&
          meaningfulActiveElement(activeNow)
        ) {
          return
        }

        const fallbackElement = fallbackRef.current?.current ?? null
        const target = focusable(previous)
          ? previous
          : focusable(fallbackElement)
            ? fallbackElement
            : null
        if (!target) return
        // Checked again: a frame is long enough for the target to go too.
        if (focusable(target)) target.focus()
      })
    }
  }, [])
}

/**
 * Whether focusing this element would do anything.
 *
 * `isConnected` is the part that matters: an element detached by a re-render is
 * still a perfectly good object, and focusing it silently does nothing, which
 * looks exactly like the bug this hook exists to fix.
 */
function focusable(element: HTMLElement | null): element is HTMLElement {
  if (!element || !element.isConnected) return false
  if (element.hasAttribute('disabled')) return false
  return typeof element.focus === 'function'
}

function activeHtmlElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null
}

function meaningfulActiveElement(
  element: HTMLElement | null,
): element is HTMLElement {
  return (
    focusable(element) &&
    element !== document.body &&
    element !== document.documentElement
  )
}
