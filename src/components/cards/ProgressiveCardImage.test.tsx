import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CARD_IMAGE_ROOT_MARGIN,
  ProgressiveCardImage,
} from './ProgressiveCardImage'

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0]

const originalIntersectionObserver = globalThis.IntersectionObserver

afterEach(() => {
  vi.restoreAllMocks()
  if (originalIntersectionObserver === undefined) {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver')
  } else {
    globalThis.IntersectionObserver = originalIntersectionObserver
  }
})

function installObserver() {
  let callback: ObserverCallback | undefined
  const observe = vi.fn()
  const disconnect = vi.fn()
  class FakeIntersectionObserver {
    readonly root = null
    readonly rootMargin: string
    readonly thresholds = [0]

    constructor(
      nextCallback: ObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      callback = nextCallback
      this.rootMargin = options?.rootMargin ?? '0px'
    }

    observe = observe
    unobserve = vi.fn()
    disconnect = disconnect
    takeRecords = vi.fn(() => [])
  }
  globalThis.IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver
  return {
    observe,
    disconnect,
    intersect: (isIntersecting = true) => {
      callback?.(
        [{ isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    },
  }
}

describe('ProgressiveCardImage', () => {
  it('waits for intersection before assigning the real image source', () => {
    const observer = installObserver()
    render(
      <ProgressiveCardImage
        src="https://example.com/card.png"
        alt="テストカードの画像"
        className="frame"
      />,
    )

    expect(observer.observe).toHaveBeenCalledTimes(1)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('画像を準備しています')).toBeVisible()

    act(() => observer.intersect())
    const image = screen.getByRole('img', { name: 'テストカードの画像' })
    expect(image).toHaveAttribute('src', 'https://example.com/card.png')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('decoding', 'async')
    expect(image).toHaveAttribute('fetchpriority', 'low')
    expect(observer.disconnect).toHaveBeenCalled()
  })

  it('keeps the image after load and shows a readable failure fallback', () => {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver')
    const { rerender } = render(
      <ProgressiveCardImage
        src="https://example.com/card.png"
        alt="テストカードの画像"
        className="frame"
      />,
    )
    const image = screen.getByRole('img', { name: 'テストカードの画像' })
    fireEvent.load(image)
    expect(image.closest('[data-image-state]')).toHaveAttribute(
      'data-image-state',
      'loaded',
    )

    fireEvent.error(image)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('画像を読み込めませんでした')).toBeVisible()

    rerender(<ProgressiveCardImage alt="画像なしカード" className="frame" />)
    expect(screen.getByText('画像なし')).toBeVisible()
  })

  it('loads immediately when IntersectionObserver is unavailable', () => {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver')
    render(
      <ProgressiveCardImage
        src="https://example.com/card.png"
        alt="テストカードの画像"
        className="frame"
      />,
    )
    expect(
      screen.getByRole('img', { name: 'テストカードの画像' }),
    ).toHaveAttribute('src', 'https://example.com/card.png')
  })

  it('uses a small look-ahead margin and disconnects on cleanup', () => {
    const observer = installObserver()
    const { unmount } = render(
      <ProgressiveCardImage
        src="https://example.com/card.png"
        alt="テストカードの画像"
        className="frame"
      />,
    )
    expect(CARD_IMAGE_ROOT_MARGIN).toBe('200px 0px')
    unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })
})
