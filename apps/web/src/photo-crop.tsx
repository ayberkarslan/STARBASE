import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@stardrop/ui";
import "./photo-crop.css";

type Props = { file: File; onClose: () => void; onSave: (image: Blob) => Promise<void> };

export function PhotoCrop({ file, onClose, onSave }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || !file.size || file.size > 6291456) {
      setError("PNG, JPEG veya WebP seç; dosya 6 MB'ı geçmesin.");
      return;
    }
    createImageBitmap(file).then((image) => {
      if (active) setBitmap(image);
      else image.close();
    }).catch(() => setError("Görsel açılamadı."));
    return () => { active = false; };
  }, [file]);
  useEffect(() => () => bitmap?.close(), [bitmap]);

  function geometry(size: number) {
    if (!bitmap) return null;
    const scale = Math.max(size / bitmap.width, size / bitmap.height) * zoom;
    return { width: bitmap.width * scale, height: bitmap.height * scale };
  }
  function draw(target: HTMLCanvasElement, size: number) {
    const context = target.getContext("2d");
    const area = geometry(size);
    if (!bitmap || !context || !area) return;
    target.width = target.height = size;
    context.clearRect(0, 0, size, size);
    context.drawImage(bitmap,
      -(area.width - size) * (offset.x + 1) / 2,
      -(area.height - size) * (offset.y + 1) / 2,
      area.width, area.height);
  }
  useEffect(() => { if (canvas.current) draw(canvas.current, 300); }, [bitmap, zoom, offset]);

  async function save() {
    if (!bitmap) return;
    setSaving(true);
    setError("");
    try {
      const output = document.createElement("canvas");
      draw(output, 512);
      const image = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/webp", 0.85));
      if (!image || image.size > 1048576) throw new Error("Fotoğraf işlenemedi.");
      await onSave(image);
      onClose();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }

  return <Dialog open onClose={onClose} title="Profil fotoğrafını kırp" description="Fotoğrafı sürükle ve yakınlaştır; daire içindeki alan profilinde görünür." className="photo-crop-dialog" actions={<>
    <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
    <Button onClick={() => void save()} disabled={!bitmap || saving}>{saving ? "Kaydediliyor…" : "Kırp ve kaydet"}</Button>
  </>}>
    <div className="photo-crop-preview">
      <canvas ref={canvas} width="300" height="300" aria-label="Fotoğraf kırpma önizlemesi"
        onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => {
          const area = geometry(300);
          if (!drag.current || !area) return;
          setOffset({
            x: Math.max(-1, Math.min(1, drag.current.ox - 2 * (event.clientX - drag.current.x) / Math.max(1, area.width - 300))),
            y: Math.max(-1, Math.min(1, drag.current.oy - 2 * (event.clientY - drag.current.y) / Math.max(1, area.height - 300))),
          });
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    </div>
    <label className="photo-crop-zoom">Yakınlaştır <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
    {error && <p className="member-form-feedback is-error" role="alert">{error}</p>}
  </Dialog>;
}
