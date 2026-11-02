// image.ts — ย่อ/ครอปรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด
export const MAX_CHAT_IMAGES = 10;

async function load(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    return createImageBitmap(file).catch(() => null);
  }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

// รูปในแชท: ด้านยาวสุด 1600px, JPEG (GIF ส่งตามเดิมเพื่อคงภาพเคลื่อนไหว)
export async function shrinkImage(file: Blob): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bmp = await load(file);
  if (!bmp) return file;
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return (await toJpeg(canvas, 0.85)) || file;
}

// รูปโปรไฟล์: ครอปเป็นสี่เหลี่ยมจัตุรัสตามจุดกึ่งกลาง/ซูมที่เลือก แล้วย่อเหลือ 320px
export async function cropSquare(file: Blob, opts: { zoom: number; x: number; y: number } = { zoom: 1, x: 0.5, y: 0.5 }, size = 320): Promise<Blob> {
  const bmp = await load(file);
  if (!bmp) throw new Error('เปิดรูปนี้ไม่ได้');
  const side = Math.min(bmp.width, bmp.height) / opts.zoom;
  const sx = Math.max(0, Math.min(bmp.width - side, opts.x * bmp.width - side / 2));
  const sy = Math.max(0, Math.min(bmp.height - side, opts.y * bmp.height - side / 2));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
  const blob = await toJpeg(canvas, 0.88);
  if (!blob) throw new Error('แปลงรูปไม่สำเร็จ');
  return blob;
}

export const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

// ดึงไฟล์รูปจาก drag & drop / paste
export function imagesFrom(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const item of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const f = item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null;
    if (f && f.type.startsWith('image/')) out.push(f);
  }
  return out;
}
