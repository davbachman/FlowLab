import { isRuntimeImage } from './runtimeValues'
import type { RuntimeImage, RuntimeValue } from './types'

export const IMAGE_LIBRARY_NAME = 'image'
export const MAX_IMAGE_PIXELS = 16_777_216

export const IMAGE_FUNCTION_NAMES = [
  'get_pixel',
  'image_from_pixels',
  'image_to_pixels',
  'imload',
  'imread',
  'imsave',
  'imshow',
  'imsize',
  'set_pixel',
] as const

export type ImageFunctionName = (typeof IMAGE_FUNCTION_NAMES)[number]

export interface RuntimeImageData {
  id: number
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export interface LoadedImageData {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export interface ImageSaveRequest {
  id: number
  fileName: string
  image: RuntimeImageData
}

export interface ImageRuntimeState {
  images: Record<number, RuntimeImageData>
  nextImageId: number
  displayedImage?: RuntimeImage
  saveRequests: ImageSaveRequest[]
  nextSaveRequestId: number
}

export interface ImageFunctionResult {
  state: ImageRuntimeState
  value: RuntimeValue
}

const IMAGE_FUNCTION_SET = new Set<string>(IMAGE_FUNCTION_NAMES)

export function initialImageRuntimeState(): ImageRuntimeState {
  return {
    images: {},
    nextImageId: 1,
    saveRequests: [],
    nextSaveRequestId: 1,
  }
}

export function isImageFunctionName(name: string): name is ImageFunctionName {
  return IMAGE_FUNCTION_SET.has(name)
}

export function validateImreadArguments(args: RuntimeValue[]): string {
  if (args.length !== 1 || typeof args[0] !== 'string' || !args[0].trim()) {
    throw new Error('imread requires exactly one non-empty string URL')
  }

  return args[0]
}

export function addLoadedImage(
  state: ImageRuntimeState,
  loaded: LoadedImageData,
): ImageFunctionResult {
  validateImageDimensions(loaded.width, loaded.height)

  const expectedLength = loaded.width * loaded.height * 4
  if (loaded.pixels.length !== expectedLength) {
    throw new Error(
      `Loaded image pixel buffer has length ${loaded.pixels.length}; expected ${expectedLength}.`,
    )
  }

  return addImage(state, {
    width: loaded.width,
    height: loaded.height,
    pixels: new Uint8ClampedArray(loaded.pixels),
  })
}

export function runImageFunction(
  state: ImageRuntimeState,
  name: string,
  args: RuntimeValue[],
): ImageFunctionResult {
  if (!isImageFunctionName(name)) {
    throw new Error(`Unknown image function "${name}"`)
  }

  switch (name) {
    case 'imload':
    case 'imread':
      throw new Error(`${name} must be completed by the browser image loader`)
    case 'image_from_pixels':
      return imageFromPixels(state, args)
    case 'image_to_pixels':
      return {
        state,
        value: imageToPixels(state, requireSingleImage(name, args)),
      }
    case 'imsize': {
      const image = requireSingleImage(name, args)
      requireImageData(state, image)
      return { state, value: [image.height, image.width] }
    }
    case 'get_pixel':
      return { state, value: getPixel(state, args) }
    case 'set_pixel':
      return setPixel(state, args)
    case 'imshow': {
      if (args.length === 1 && Array.isArray(args[0])) {
        const result = imageFromPixels(state, args, 'imshow')
        const image = result.value as RuntimeImage
        return { state: { ...result.state, displayedImage: image }, value: image }
      }
      if (args.length !== 1 || !isRuntimeImage(args[0])) {
        throw new Error('imshow requires exactly one image or list of pixel rows')
      }
      const image = requireSingleImage(name, args)
      requireImageData(state, image)
      return { state: { ...state, displayedImage: image }, value: image }
    }
    case 'imsave':
      return saveImage(state, args)
  }
}

export function requireImageData(
  state: ImageRuntimeState,
  image: RuntimeImage,
): RuntimeImageData {
  const data = state.images[image.id]

  if (!data) {
    throw new Error(`Image #${image.id} does not exist.`)
  }

  if (data.width !== image.width || data.height !== image.height) {
    throw new Error(`Image #${image.id} has inconsistent dimensions.`)
  }

  return data
}

export function displayedImageData(
  state: ImageRuntimeState,
): RuntimeImageData | undefined {
  return state.displayedImage
    ? requireImageData(state, state.displayedImage)
    : undefined
}

function imageFromPixels(
  state: ImageRuntimeState,
  args: RuntimeValue[],
  functionName = 'image_from_pixels',
): ImageFunctionResult {
  if (args.length !== 1 || !Array.isArray(args[0])) {
    throw new Error(`${functionName} requires exactly one list of pixel rows`)
  }

  const rows = args[0]
  if (!rows.length || !Array.isArray(rows[0]) || !rows[0].length) {
    throw new Error(`${functionName} requires at least one non-empty row`)
  }

  const width = rows[0].length
  const height = rows.length
  validateImageDimensions(width, height)
  const grayscale = typeof rows[0][0] === 'number'
  const pixels = new Uint8ClampedArray(width * height * 4)

  rows.forEach((pixelsInRow, row) => {
    if (!Array.isArray(pixelsInRow) || pixelsInRow.length !== width) {
      throw new Error(`${functionName} requires rows of equal length`)
    }

    pixelsInRow.forEach((pixel, col) => {
      const label = `Pixel at (row ${row}, col ${col})`
      if (grayscale !== (typeof pixel === 'number')) {
        throw new Error(`${functionName} cannot mix grayscale values and color pixels (${label})`)
      }
      let color: Uint8ClampedArray
      if (grayscale) {
        if (typeof pixel !== 'number' || !Number.isInteger(pixel) || pixel < 0 || pixel > 255) {
          throw new Error(`${label} grayscale value must be an integer from 0 through 255`)
        }
        color = new Uint8ClampedArray([pixel, pixel, pixel, 255])
      } else {
        color = requireColor(pixel, label)
      }
      pixels.set(color, (row * width + col) * 4)
    })
  })

  return addImage(state, { width, height, pixels })
}

function addImage(
  state: ImageRuntimeState,
  image: Omit<RuntimeImageData, 'id'>,
): ImageFunctionResult {
  const id = state.nextImageId
  const data: RuntimeImageData = { id, ...image }
  const value: RuntimeImage = {
    kind: 'image',
    id,
    width: image.width,
    height: image.height,
  }

  return {
    state: {
      ...state,
      images: { ...state.images, [id]: data },
      nextImageId: id + 1,
    },
    value,
  }
}

function imageToPixels(
  state: ImageRuntimeState,
  image: RuntimeImage,
): RuntimeValue[] {
  const data = requireImageData(state, image)
  const rows: RuntimeValue[] = []

  for (let row = 0; row < data.height; row += 1) {
    const pixelsInRow: RuntimeValue[] = []
    for (let col = 0; col < data.width; col += 1) {
      pixelsInRow.push(pixelAt(data, row, col))
    }
    rows.push(pixelsInRow)
  }

  return rows
}

function getPixel(
  state: ImageRuntimeState,
  args: RuntimeValue[],
): RuntimeValue[] {
  if (args.length !== 3 || !isRuntimeImage(args[0])) {
    throw new Error('get_pixel requires an image, row, and col')
  }

  const data = requireImageData(state, args[0])
  const row = requireCoordinate('get_pixel', 'row', args[1], data.height)
  const col = requireCoordinate('get_pixel', 'col', args[2], data.width)
  return pixelAt(data, row, col)
}

function setPixel(
  state: ImageRuntimeState,
  args: RuntimeValue[],
): ImageFunctionResult {
  if (args.length !== 4 || !isRuntimeImage(args[0])) {
    throw new Error('set_pixel requires an image, row, col, and color list')
  }

  const image = args[0]
  const data = requireImageData(state, image)
  const row = requireCoordinate('set_pixel', 'row', args[1], data.height)
  const col = requireCoordinate('set_pixel', 'col', args[2], data.width)
  const color = requireColor(args[3], 'set_pixel color')
  const pixels = new Uint8ClampedArray(data.pixels)
  pixels.set(color, (row * data.width + col) * 4)

  return {
    state: {
      ...state,
      images: {
        ...state.images,
        [image.id]: { ...data, pixels },
      },
    },
    value: image,
  }
}

function saveImage(
  state: ImageRuntimeState,
  args: RuntimeValue[],
): ImageFunctionResult {
  if (
    args.length !== 2 ||
    !isRuntimeImage(args[0]) ||
    typeof args[1] !== 'string' ||
    !args[1].trim()
  ) {
    throw new Error('imsave requires an image and a non-empty filename string')
  }

  const image = args[0]
  const data = requireImageData(state, image)
  const request: ImageSaveRequest = {
    id: state.nextSaveRequestId,
    fileName: pngFileName(args[1]),
    image: {
      ...data,
      pixels: new Uint8ClampedArray(data.pixels),
    },
  }

  return {
    state: {
      ...state,
      saveRequests: [...state.saveRequests, request],
      nextSaveRequestId: request.id + 1,
    },
    value: image,
  }
}

function requireSingleImage(
  name: string,
  args: RuntimeValue[],
): RuntimeImage {
  if (args.length !== 1 || !isRuntimeImage(args[0])) {
    throw new Error(`${name} requires exactly one image`)
  }

  return args[0]
}

function requireColor(value: RuntimeValue, label: string): Uint8ClampedArray {
  if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4)) {
    throw new Error(`${label} must be an RGB or RGBA list`)
  }

  if (
    !value.every(
      (channel) =>
        typeof channel === 'number' &&
        Number.isInteger(channel) &&
        channel >= 0 &&
        channel <= 255,
    )
  ) {
    throw new Error(`${label} channels must be integers from 0 through 255`)
  }

  return new Uint8ClampedArray([
    value[0] as number,
    value[1] as number,
    value[2] as number,
    value.length === 4 ? (value[3] as number) : 255,
  ])
}

function requireCoordinate(
  functionName: string,
  label: string,
  value: RuntimeValue,
  limit: number,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${functionName} ${label} must be an integer`)
  }

  if (value < 0 || value >= limit) {
    throw new Error(
      `${functionName} ${label} coordinate ${value} is outside 0 through ${limit - 1}`,
    )
  }

  return value
}

function pixelAt(data: RuntimeImageData, row: number, col: number): number[] {
  const offset = (row * data.width + col) * 4
  return Array.from(data.pixels.slice(offset, offset + 4))
}

function validateImageDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Image dimensions must be positive integers')
  }

  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      `Image contains more than the ${MAX_IMAGE_PIXELS} pixel limit.`,
    )
  }
}

function pngFileName(fileName: string): string {
  const trimmed = fileName.trim()
  return trimmed.toLowerCase().endsWith('.png') ? trimmed : `${trimmed}.png`
}

export async function loadImageFromUrl(url: string): Promise<LoadedImageData> {
  if (!globalThis.fetch) {
    throw new Error('This browser does not support URL image loading.')
  }

  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  const blob = await response.blob()
  return loadImageFromBlob(blob)
}

export async function loadImageFromBlob(blob: Blob): Promise<LoadedImageData> {
  const source = await decodeImageBlob(blob)

  try {
    validateImageDimensions(source.width, source.height)
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      throw new Error('The browser could not create an image canvas')
    }

    context.drawImage(source, 0, 0)
    const pixels = context.getImageData(0, 0, source.width, source.height).data
    return {
      width: source.width,
      height: source.height,
      pixels: new Uint8ClampedArray(pixels),
    }
  } finally {
    if ('close' in source && typeof source.close === 'function') {
      source.close()
    }
  }
}

export function paintImageCanvas(
  canvas: HTMLCanvasElement,
  image: RuntimeImageData,
): boolean {
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) {
    return false
  }

  const pixelData = context.createImageData(image.width, image.height)
  pixelData.data.set(image.pixels)
  context.putImageData(pixelData, 0, 0)
  return true
}

export async function downloadImage(
  image: RuntimeImageData,
  fileName: string,
): Promise<void> {
  const canvas = document.createElement('canvas')
  if (!paintImageCanvas(canvas, image)) {
    throw new Error('The browser could not create an image canvas')
  }
  const blob = await canvasToPngBlob(canvas)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = pngFileName(fileName)
  link.click()
  URL.revokeObjectURL(url)
}

async function decodeImageBlob(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof globalThis.createImageBitmap === 'function') {
    return globalThis.createImageBitmap(blob)
  }

  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new globalThis.Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('The file is not a readable image'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('The browser could not encode the image as PNG'))
      }
    }, 'image/png')
  })
}
