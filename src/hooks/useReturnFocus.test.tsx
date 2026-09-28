import { render, waitFor } from '@testing-library/react'
import { StrictMode, useEffect, useRef, type RefObject } from 'react'
import { describe, expect, it } from 'vitest'

import { useReturnFocus } from './useReturnFocus'

/**
 * A dialog that closes without putting focus back drops it on `document.body`:
 * the next Tab starts from the top of the page, and a screen reader loses the
 * place the reporter was working in.
 */

function Dialog({ fallback }: { fallback?: RefObject<HTMLElement | null> }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useReturnFocus(fallback)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
  // Dialogs in this app move focus to their own heading on open, which is what
  // makes remembering the opener necessary.
  return (
    <h2 tabIndex={-1} ref={headingRef}>
      ダイアログ
    </h2>
  )
}

function Harness({
  open,
  withFallback = false,
  removeOpener = false,
  disableOpener = false,
}: {
  open: boolean
  withFallback?: boolean
  removeOpener?: boolean
  disableOpener?: boolean
}) {
  const fallbackRef = useRef<HTMLElement>(null)
  return (
    <>
      {!removeOpener && (
        <button type="button" data-testid="opener" disabled={disableOpener}>
          開く
        </button>
      )}
      <section tabIndex={-1} ref={fallbackRef} data-testid="fallback">
        一覧
      </section>
      <button type="button" data-testid="elsewhere">
        別の操作
      </button>
      {open && <Dialog fallback={withFallback ? fallbackRef : undefined} />}
    </>
  )
}

describe('putting focus back where a dialog was opened from', () => {
  it('returns it to the element that had it', async () => {
    const view = render(<Harness open={false} />)
    const opener = view.getByTestId('opener')
    opener.focus()

    view.rerender(<Harness open />)
    expect(document.activeElement).not.toBe(opener)

    view.rerender(<Harness open={false} />)

    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  /**
   * The row that held the button can be filtered away by the very change that
   * was just saved, and a re-render replaces the node with a new one. Focusing
   * a detached element silently does nothing, which looks exactly like the bug
   * this hook exists to fix.
   */
  it('uses the fallback when that element is gone', async () => {
    const view = render(<Harness open={false} withFallback />)
    view.getByTestId('opener').focus()

    view.rerender(<Harness open withFallback />)
    view.rerender(<Harness open={false} withFallback removeOpener />)

    await waitFor(() =>
      expect(document.activeElement).toBe(view.getByTestId('fallback')),
    )
  })

  it('uses the fallback when that element can no longer take focus', async () => {
    const view = render(<Harness open={false} withFallback />)
    view.getByTestId('opener').focus()

    view.rerender(<Harness open withFallback />)
    view.rerender(<Harness open={false} withFallback disableOpener />)

    await waitFor(() =>
      expect(document.activeElement).toBe(view.getByTestId('fallback')),
    )
  })

  it('keeps focus in the open dialog through StrictMode effect replay', async () => {
    const view = render(
      <StrictMode>
        <Harness open={false} />
      </StrictMode>,
    )
    view.getByTestId('opener').focus()

    view.rerender(
      <StrictMode>
        <Harness open />
      </StrictMode>,
    )
    const heading = view.getByRole('heading', { name: 'ダイアログ' })
    await nextAnimationFrame()

    expect(heading).toHaveFocus()
  })

  it('does not take focus back after it moved somewhere valid', async () => {
    const view = render(<Harness open={false} withFallback />)
    view.getByTestId('opener').focus()
    view.rerender(<Harness open withFallback />)

    view.rerender(<Harness open={false} withFallback />)
    const elsewhere = view.getByTestId('elsewhere')
    elsewhere.focus()
    await nextAnimationFrame()

    expect(elsewhere).toHaveFocus()
  })

  // Sending focus somewhere arbitrary would be worse than leaving it alone.
  it('leaves focus alone when neither is available', async () => {
    const view = render(<Harness open={false} />)
    view.getByTestId('opener').focus()

    view.rerender(<Harness open />)
    view.rerender(<Harness open={false} removeOpener />)

    await waitFor(() => expect(document.activeElement).toBe(document.body))
  })

  it('does not throw where there was nothing focused to begin with', async () => {
    const view = render(<Harness open={false} withFallback />)
    ;(document.activeElement as HTMLElement | null)?.blur()

    view.rerender(<Harness open withFallback />)

    expect(() =>
      view.rerender(<Harness open={false} withFallback />),
    ).not.toThrow()
  })
})

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
