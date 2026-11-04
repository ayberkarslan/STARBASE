import { HTTPException } from "hono/http-exception";

export const MAX_IMAGE_BYTES = 1048576;

function imageType(bytes: Uint8Array) {
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
    return "image/webp";
  return null;
}

export async function uploadedImage(request: Request) {
  const declaredType = request.headers.get("content-type")?.split(";")[0] ?? "";
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new HTTPException(400, { message: "invalid_logo_size" });
  const contentType = imageType(bytes);
  if (!contentType || contentType !== declaredType)
    throw new HTTPException(400, { message: "invalid_logo_file" });
  return { bytes, contentType };
}

type LogoOwner = "apps" | "teams" | "departments";

export async function saveImage(db: D1Database, owner: LogoOwner, id: string, bytes: Uint8Array, contentType: string) {
  await db.batch([
    db.prepare("INSERT INTO image_assets(key,content_type,content) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET content_type=excluded.content_type,content=excluded.content")
      .bind(`${owner}/${id}/logo`, contentType, bytes),
    db.prepare(`UPDATE ${owner} SET logo_url='uploaded' WHERE id=?`).bind(id),
  ]);
}

export async function removeImage(db: D1Database, owner: LogoOwner, id: string) {
  await db.batch([
    db.prepare("DELETE FROM image_assets WHERE key=?").bind(`${owner}/${id}/logo`),
    db.prepare(`UPDATE ${owner} SET logo_url='' WHERE id=?`).bind(id),
  ]);
}

export async function imageResponse(db: D1Database, owner: LogoOwner, id: string) {
  const image = await db.prepare("SELECT content_type,content FROM image_assets WHERE key=?")
    .bind(`${owner}/${id}/logo`)
    .first<{ content_type: string; content: number[] }>();
  if (!image) return null;
  return new Response(Uint8Array.from(image.content).buffer, { headers: {
    "Content-Type": image.content_type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
