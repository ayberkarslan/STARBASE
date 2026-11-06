const MAX_STORED_BYTES = 1048576;
const MAX_SOURCE_BYTES = 6291456;

export async function compactPatch(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || !file.size || file.size > MAX_SOURCE_BYTES)
    throw new Error("Görsel PNG, JPEG veya WebP olmalı ve 6 MB'ı geçmemeli.");
  if (file.size <= MAX_STORED_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Görsel işlenemedi.");
    let scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", Math.max(0.6, 0.86 - attempt * 0.05)),
      );
      if (result && result.size <= MAX_STORED_BYTES && /^image\/(png|jpeg|webp)$/.test(result.type))
        return result;
      scale *= 0.75;
    }
    throw new Error("Görsel 1 MB sınırına indirilemedi.");
  } finally {
    bitmap.close();
  }
}
