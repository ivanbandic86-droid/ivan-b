// Smanjuje fotografiju prije spremanja: najdulja stranica 1600 px, JPEG.
// Slika s mobitela ima više megabajta, a na slabom signalu bi se slala minutama.
export async function compressImage(file, maxSide = 1600, quality = 0.7) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Fotografija se ne može obraditi.')
  return blob
}
