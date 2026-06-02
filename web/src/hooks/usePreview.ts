import { useEffect, useState } from 'react'

export type PreviewMeta = {
  url: string
  width?: number
  height?: number
  duration?: number
}

export function usePreview(file: File): PreviewMeta | null {
  const [meta, setMeta] = useState<PreviewMeta | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)

    if (file.type.startsWith('image/')) {
      const img = new Image()
      img.onload = () => setMeta({ url, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => setMeta({ url })
      img.src = url
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () =>
        setMeta({ url, width: video.videoWidth, height: video.videoHeight, duration: video.duration })
      video.onerror = () => setMeta({ url })
      video.src = url
    }

    return () => URL.revokeObjectURL(url)
  }, [file])

  return meta
}
