import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  displayedImageData,
  initialImageRuntimeState,
  loadImageFromUrl,
  requireImageData,
  runImageFunction,
} from './image'
import { stringifyValue, toBoolean, valuesEqual } from './runtimeValues'
import type { RuntimeImage } from './types'

describe('image native library', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates images from RGB and RGBA rows and converts them back to RGBA', () => {
    const created = runImageFunction(
      initialImageRuntimeState(),
      'image_from_pixels',
      [
        [
          [
            [255, 0, 0],
            [0, 255, 0, 128],
          ],
          [
            [0, 0, 255, 255],
            [255, 255, 255],
          ],
        ],
      ],
    )
    const image = created.value as RuntimeImage

    expect(image).toEqual({
      kind: 'image',
      id: 1,
      width: 2,
      height: 2,
    })
    expect(
      runImageFunction(created.state, 'imsize', [image]).value,
    ).toEqual([2, 2])
    expect(
      runImageFunction(created.state, 'image_to_pixels', [image]).value,
    ).toEqual([
      [
        [255, 0, 0, 255],
        [0, 255, 0, 128],
      ],
      [
        [0, 0, 255, 255],
        [255, 255, 255, 255],
      ],
    ])
  })

  it('gets and sets pixels while preserving image identity for aliases', () => {
    const created = runImageFunction(
      initialImageRuntimeState(),
      'image_from_pixels',
      [[[[10, 20, 30, 40]]]],
    )
    const image = created.value as RuntimeImage
    const updated = runImageFunction(created.state, 'set_pixel', [
      image,
      0,
      0,
      [90, 80, 70],
    ])

    expect(updated.value).toBe(image)
    expect(
      runImageFunction(updated.state, 'get_pixel', [image, 0, 0]).value,
    ).toEqual([90, 80, 70, 255])
    expect(
      runImageFunction(created.state, 'get_pixel', [image, 0, 0]).value,
    ).toEqual([10, 20, 30, 40])
    expect(stringifyValue(image)).toBe('Image #1 (1 × 1)')
    expect(toBoolean(image)).toBe(true)
    expect(valuesEqual(image, image)).toBe(true)
    expect(
      valuesEqual(image, { ...image, id: image.id + 1 }),
    ).toBe(false)
  })

  it('selects an image for display and snapshots PNG save requests', () => {
    const created = runImageFunction(
      initialImageRuntimeState(),
      'image_from_pixels',
      [[[[1, 2, 3, 4]]]],
    )
    const image = created.value as RuntimeImage
    const shown = runImageFunction(created.state, 'imshow', [image])
    const saved = runImageFunction(shown.state, 'imsave', [image, 'sample'])
    const edited = runImageFunction(saved.state, 'set_pixel', [
      image,
      0,
      0,
      [9, 9, 9, 9],
    ])

    expect(displayedImageData(shown.state)?.id).toBe(image.id)
    expect(saved.state.saveRequests).toHaveLength(1)
    expect(saved.state.saveRequests[0].fileName).toBe('sample.png')
    expect(Array.from(saved.state.saveRequests[0].image.pixels)).toEqual([
      1, 2, 3, 4,
    ])
    expect(Array.from(requireImageData(edited.state, image).pixels)).toEqual([
      9, 9, 9, 9,
    ])
  })

  it('rejects malformed rows, colors, and coordinates clearly', () => {
    expect(() =>
      runImageFunction(initialImageRuntimeState(), 'image_from_pixels', [
        [
          [[0, 0, 0]],
          [[0, 0, 0], [1, 1, 1]],
        ],
      ]),
    ).toThrow(/rows of equal length/i)

    expect(() =>
      runImageFunction(initialImageRuntimeState(), 'image_from_pixels', [
        [[[256, 0, 0]]],
      ]),
    ).toThrow(/0 through 255/i)

    const created = runImageFunction(
      initialImageRuntimeState(),
      'image_from_pixels',
      [[[[0, 0, 0]]]],
    )
    expect(() =>
      runImageFunction(created.state, 'get_pixel', [created.value, 1, 0]),
    ).toThrow(/outside 0 through 0/i)
  })

  it('fetches and decodes URL images into RGBA buffers', async () => {
    const close = vi.fn()
    const drawImage = vi.fn()
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]),
    }))
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob(['image'])),
        }),
      ),
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve({ width: 2, height: 1, close })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      getImageData,
    } as unknown as CanvasRenderingContext2D)

    const loaded = await loadImageFromUrl('https://example.edu/picture.png')

    expect(fetch).toHaveBeenCalledWith('https://example.edu/picture.png', {
      cache: 'no-store',
    })
    expect(drawImage).toHaveBeenCalled()
    expect(loaded).toEqual({
      width: 2,
      height: 1,
      pixels: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]),
    })
    expect(close).toHaveBeenCalled()
  })
})
