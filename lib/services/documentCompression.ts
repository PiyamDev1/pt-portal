import {
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MAX_FILE_SIZE_LABEL,
} from '@/lib/documentConstraints'

const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const OUTPUT_IMAGE_TYPE = 'image/jpeg'
const OUTPUT_EXTENSION = '.jpg'
const MIN_QUALITY = 0.35
const MAX_QUALITY = 0.92
const MIN_DIMENSION = 32

export type DocumentCompressionResult = {
  file: File
  compressed: boolean
  originalSize: number
  targetSize: number
}

export function isCompressibleDocumentFile(file: File): boolean {
  return COMPRESSIBLE_IMAGE_TYPES.has(file.type)
}

export async function prepareDocumentUploadFile(
  file: File,
  targetSize = DOCUMENT_MAX_FILE_SIZE_BYTES,
): Promise<DocumentCompressionResult> {
  if (file.size <= targetSize) {
    return {
      file,
      compressed: false,
      originalSize: file.size,
      targetSize,
    }
  }

  if (!isCompressibleDocumentFile(file)) {
    throw new Error(
      `Files over ${DOCUMENT_MAX_FILE_SIZE_LABEL} must be compressed before upload. Automatic compression currently supports JPG, PNG, and WEBP files.`,
    )
  }

  return compressImageFile(file, targetSize)
}

async function compressImageFile(
  file: File,
  targetSize: number,
): Promise<DocumentCompressionResult> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Image compression is only available in the browser')
  }

  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Image compression is not supported in this browser')
  }

  let bestBlob: Blob | null = null
  let scale = 1

  for (let resizeAttempt = 0; resizeAttempt < 7; resizeAttempt += 1) {
    const width = Math.max(MIN_DIMENSION, Math.round(image.naturalWidth * scale))
    const height = Math.max(MIN_DIMENSION, Math.round(image.naturalHeight * scale))

    canvas.width = width
    canvas.height = height
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    let low = MIN_QUALITY
    let high = MAX_QUALITY

    for (let qualityAttempt = 0; qualityAttempt < 7; qualityAttempt += 1) {
      const quality = (low + high) / 2
      const blob = await canvasToBlob(canvas, quality)

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob
      }

      if (blob.size <= targetSize) {
        low = quality
      } else {
        high = quality
      }
    }

    const candidate = await canvasToBlob(canvas, low)
    if (candidate.size <= targetSize) {
      return {
        file: blobToFile(candidate, file),
        compressed: true,
        originalSize: file.size,
        targetSize,
      }
    }

    scale *= 0.82
  }

  if (bestBlob && bestBlob.size <= targetSize) {
    return {
      file: blobToFile(bestBlob, file),
      compressed: true,
      originalSize: file.size,
      targetSize,
    }
  }

  throw new Error(`Could not compress "${file.name}" below ${DOCUMENT_MAX_FILE_SIZE_LABEL}`)
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error(`Could not read "${file.name}" for compression`))
    }

    image.src = objectUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image compression failed'))
          return
        }

        resolve(blob)
      },
      OUTPUT_IMAGE_TYPE,
      quality,
    )
  })
}

function blobToFile(blob: Blob, originalFile: File): File {
  const compressedName = originalFile.name.replace(/\.[^.]+$/, OUTPUT_EXTENSION)
  const fileName = compressedName.endsWith(OUTPUT_EXTENSION)
    ? compressedName
    : `${originalFile.name}${OUTPUT_EXTENSION}`

  return new File([blob], fileName, {
    type: OUTPUT_IMAGE_TYPE,
    lastModified: originalFile.lastModified,
  })
}
