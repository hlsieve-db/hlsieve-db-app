import { useEffect, useRef, useState } from 'react'

export type TournamentReportImagePreview = {
  url: string
  fileName: string
  pageNumber: number
  totalPages: number
  width: number
  height: number
}

type TournamentReportImageDialogProps = {
  images: readonly TournamentReportImagePreview[]
  onClose: () => void
  onSave: (image: TournamentReportImagePreview) => void
}

export function TournamentReportImageDialog({
  images,
  onClose,
  onSave,
}: TournamentReportImageDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>(
          'button:not([disabled])',
        ) ?? [],
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [onClose])

  const image = images[currentIndex]
  if (!image) return null

  return (
    <div className="report-image-dialog-backdrop">
      <section
        ref={dialogRef}
        className="report-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-image-dialog-title"
      >
        <div className="report-image-dialog__heading">
          <div>
            <p>PNG PREVIEW</p>
            <h2 id="report-image-dialog-title">大会結果画像</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="button"
            type="button"
            onClick={onClose}
            aria-label="画像プレビューを閉じる"
          >
            閉じる
          </button>
        </div>

        <div className="report-image-dialog__preview">
          <img
            src={image.url}
            alt={`大会結果画像 ${image.pageNumber} / ${image.totalPages}`}
            width={image.width}
            height={image.height}
          />
        </div>

        {images.length > 1 && (
          <div
            className="report-image-dialog__pagination"
            aria-label="画像ページ切り替え"
          >
            <button
              className="button"
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => index - 1)}
              aria-label="前の画像"
            >
              前へ
            </button>
            <span aria-live="polite">
              {currentIndex + 1} / {images.length}
            </span>
            <button
              className="button"
              type="button"
              disabled={currentIndex === images.length - 1}
              onClick={() => setCurrentIndex((index) => index + 1)}
              aria-label="次の画像"
            >
              次へ
            </button>
          </div>
        )}

        <button
          className="button report-image-dialog__save"
          type="button"
          onClick={() => onSave(image)}
          aria-label={`${image.pageNumber}ページ目の大会結果画像を保存`}
        >
          画像を保存
        </button>
      </section>
    </div>
  )
}
