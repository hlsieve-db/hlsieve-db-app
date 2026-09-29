import { useEffect, useRef, useState } from 'react'

export const CARD_IMAGE_ROOT_MARGIN = '200px 0px'

type ProgressiveCardImageProps = {
  src?: string
  alt: string
  className: string
}

type ImageState = 'waiting' | 'loading' | 'loaded' | 'failed' | 'missing'

type SourceState = {
  src: string
  state: Exclude<ImageState, 'missing'>
}

export function ProgressiveCardImage({
  src,
  alt,
  className,
}: ProgressiveCardImageProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [sourceState, setSourceState] = useState<SourceState>()

  const observedState =
    sourceState && sourceState.src === src ? sourceState.state : 'waiting'
  const shouldLoad =
    Boolean(src) &&
    (typeof IntersectionObserver === 'undefined' || observedState !== 'waiting')

  useEffect(() => {
    if (!src || typeof IntersectionObserver === 'undefined') return

    let active = true
    const root = rootRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || !entries.some((entry) => entry.isIntersecting)) return
        setSourceState({ src, state: 'loading' })
        observer.disconnect()
      },
      { rootMargin: CARD_IMAGE_ROOT_MARGIN },
    )
    observer.observe(root)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [src])

  const state: ImageState = !src
    ? 'missing'
    : shouldLoad
      ? observedState === 'loaded' || observedState === 'failed'
        ? observedState
        : 'loading'
      : 'waiting'

  return (
    <div className={className} data-image-state={state} ref={rootRef}>
      {state === 'missing' && <span>画像なし</span>}
      {state === 'waiting' && <span>画像を準備しています</span>}
      {state === 'failed' && <span>画像を読み込めませんでした</span>}
      {shouldLoad && state !== 'failed' && src && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onLoad={() => setSourceState({ src, state: 'loaded' })}
          onError={() => setSourceState({ src, state: 'failed' })}
        />
      )}
    </div>
  )
}
