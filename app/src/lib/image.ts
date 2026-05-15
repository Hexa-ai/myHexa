// Client-side image compression for upload.
// Resizes the longest dimension to `maxSize`, re-encodes as JPEG `quality`,
// returns a base64 payload (without the data: prefix) plus metadata.

export interface CompressedImage {
  dataBase64: string
  contentType: string
  name: string
  sizeBytes: number
}

export async function compressImage(
  file: File,
  opts: { maxSize?: number; quality?: number } = {},
): Promise<CompressedImage> {
  const maxSize = opts.maxSize ?? 1600
  const quality = opts.quality ?? 0.85

  const bitmap = await readBitmap(file)
  try {
    const { width, height } = bitmap
    const scale = Math.min(1, maxSize / Math.max(width, height))
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D non disponible')
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Échec encodage JPEG'))),
        'image/jpeg',
        quality,
      )
    })
    const buf = await blob.arrayBuffer()
    return {
      dataBase64: arrayBufferToBase64(buf),
      contentType: 'image/jpeg',
      name: file.name.replace(/\.[^.]+$/, '.jpg'),
      sizeBytes: buf.byteLength,
    }
  } finally {
    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      ;(bitmap as ImageBitmap).close()
    }
  }
}

async function readBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fallback to HTMLImageElement
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossible de décoder l\'image'))
    }
    img.src = url
  })
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}
