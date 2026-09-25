/**
 * Downscale a photo before it leaves the phone: faster upload, stays under the API's 4 MB cap, and
 * 1280 px is already more detail than the vision model uses. EXIF orientation is honoured by
 * createImageBitmap's default in current WebViews.
 */
export async function compressImage(src: Blob, maxSide = 1280, quality = 0.82): Promise<{ dataUrl: string; base64: string; mime: string }> {
  const bmp = await createImageBitmap(src)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  return { dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' }
}
