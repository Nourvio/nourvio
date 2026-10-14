/**
 * Scales a photo down to fit `maxSize` pixels and re-encodes it as JPEG
 * before upload. A 10 MB phone photo becomes a few hundred KB, which matters
 * on a slow connection. Anything the browser can't decode is sent as it is.
 */
export async function shrinkImage(file: File, maxSize = 2000): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    })
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    )
    if (!blob) return file
    const name = file.name.replace(/\.[^.]+$/, "") || "photo"
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" })
  } catch {
    return file
  }
}
