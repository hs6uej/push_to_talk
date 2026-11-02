// AvatarEditor — เลือกรูป ลากจัดตำแหน่ง ซูม แล้วอัปโหลดเป็นรูปวงกลม
import React, { useEffect, useRef, useState } from 'react';
import { CameraIcon, ImagePlusIcon, Trash2Icon } from 'lucide-react';
import { cropSquare } from '../lib/image';
import { store } from '../lib/store';
import { Avatar, btnGhost, btnPrimary, Sheet } from './ui';

const VIEW = 224;

interface Props {
  name: string;
  id?: number;
  userId?: number;
  src: string | null;
  title: string;
  canEdit?: boolean;
  onSave: (blob: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
}

const AvatarEditor: React.FC<Props> = ({ name, id, userId, src, title, canEdit = true, onSave, onRemove }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState({ zoom: 1, x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setCrop({ zoom: 1, x: 0.5, y: 0.5 });
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const close = () => { setFile(null); setDims(null); };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      await onSave(await cropSquare(file, crop));
      store.toast('อัปเดตรูปแล้ว');
      close();
    } catch (e: any) {
      store.toast(e.message || 'อัปโหลดไม่สำเร็จ', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await onRemove();
      store.toast('ลบรูปแล้ว');
    } catch (e: any) {
      store.toast(e.message, 'error');
    }
  };

  // ตำแหน่งภาพในวงกลมพรีวิว (สอดคล้องกับ cropSquare)
  let imgStyle: React.CSSProperties = {};
  if (dims) {
    const side = Math.min(dims.w, dims.h) / crop.zoom;
    const scale = VIEW / side;
    const sx = Math.max(0, Math.min(dims.w - side, crop.x * dims.w - side / 2));
    const sy = Math.max(0, Math.min(dims.h - side, crop.y * dims.h - side / 2));
    imgStyle = { width: dims.w * scale, height: dims.h * scale, left: -sx * scale, top: -sy * scale };
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !dims) return;
    const side = Math.min(dims.w, dims.h) / crop.zoom;
    const k = side / VIEW;
    const half = side / 2;
    const x = Math.max(half / dims.w, Math.min(1 - half / dims.w, drag.current.x - ((e.clientX - drag.current.px) * k) / dims.w));
    const y = Math.max(half / dims.h, Math.min(1 - half / dims.h, drag.current.y - ((e.clientY - drag.current.py) * k) / dims.h));
    setCrop((c) => ({ ...c, x, y }));
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" disabled={!canEdit} onClick={() => fileRef.current?.click()} className="relative group" aria-label="เปลี่ยนรูป">
        <Avatar name={name} id={id} userId={userId} src={src} size="xl" />
        {canEdit && (
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
            <CameraIcon className="w-4 h-4" />
          </span>
        )}
      </button>
      {canEdit && (
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className={`${btnGhost} !py-1.5 !px-3`}>
            <ImagePlusIcon className="w-4 h-4" /> {src ? 'เปลี่ยนรูป' : 'ใส่รูป'}
          </button>
          {src && (
            <button type="button" onClick={remove} className={`${btnGhost} !py-1.5 !px-3 text-red-600`}>
              <Trash2Icon className="w-4 h-4" /> ลบรูป
            </button>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setFile(f);
          e.target.value = '';
        }}
      />

      {file && (
        <Sheet title={title} onClose={close}>
          <div className="flex flex-col items-center gap-4">
            <div
              className="relative rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 touch-none cursor-grab active:cursor-grabbing ring-4 ring-emerald-500/30"
              style={{ width: VIEW, height: VIEW }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => { drag.current = null; }}
            >
              {url && dims && <img src={url} alt="" draggable={false} className="absolute max-w-none select-none" style={imgStyle} />}
            </div>
            <p className="text-xs text-slate-500">ลากเพื่อจัดตำแหน่ง</p>
            <label className="w-full flex items-center gap-3 text-sm">
              ซูม
              <input type="range" min={1} max={4} step={0.05} value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} className="flex-1 accent-emerald-600" />
            </label>
            <div className="w-full grid grid-cols-2 gap-2">
              <button type="button" onClick={close} className={btnGhost}>ยกเลิก</button>
              <button type="button" onClick={save} disabled={busy || !dims} className={btnPrimary}>{busy ? 'กำลังอัปโหลด...' : 'บันทึกรูป'}</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
};

export default AvatarEditor;
