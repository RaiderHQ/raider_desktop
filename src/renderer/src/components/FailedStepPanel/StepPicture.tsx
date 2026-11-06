import React, { useEffect, useState } from 'react'
import { imageDataUrl } from '@foundation/imageDataUrl'

interface StepPictureProps {
  label: string
  /** The picture file; undefined while it's still being looked up, null when there is none */
  path: string | null | undefined
  /** Said in place of a missing picture */
  missing: string
  testId?: string
}

/** One labelled picture of the page, or a line saying there isn't one. */
const StepPicture: React.FC<StepPictureProps> = ({ label, path, missing, testId }) => {
  const [src, setSrc] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    setSrc(path === null ? null : undefined)
    if (path) {
      window.api
        .readImage(path)
        .then((res) => {
          if (active) setSrc(res.success ? imageDataUrl(res) : null)
        })
        .catch(() => {
          if (active) setSrc(null)
        })
    }
    return (): void => {
      active = false
    }
  }, [path])

  return (
    <figure data-testid={testId} className="min-w-0 flex-1">
      <figcaption className="text-xs font-medium text-neutral-md mb-1">{label}</figcaption>
      <div className="aspect-video rounded border border-neutral-bdr bg-neutral-50 flex items-center justify-center overflow-hidden">
        {src ? (
          <img src={src} alt={label} className="w-full h-full object-contain" />
        ) : (
          src === null && <p className="text-xs text-neutral-md px-3 text-center">{missing}</p>
        )}
      </div>
    </figure>
  )
}

export default StepPicture
