import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, File as FileIcon, Image as ImageIcon, Plus, Send, Users, X } from "lucide-react";
import { Button } from "@stardrop/ui";

type Member = { connectionId: string; userId: string; name: string };
type StagedFile = { id: string; file: File };
type TransferRow = { id: string; name: string; peer: string; status: string; percent: number };
type Point = { x: number; y: number };
type Drag = { kind: "file" | "member" | "zone"; id: string; pointerId: number; startX: number; startY: number; origin: Point; moved: boolean };
type Zone = { id: string; width: number; height: number };
type Resize = { id: string; pointerId: number; startX: number; startY: number; width: number };

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt="" /> : file.type.startsWith("image/") ? <ImageIcon size={31} /> : <FileIcon size={31} />;
}

export function ShareCanvas({ files, members, currentUserId, readyPeers, transfers, onAddFiles, onRemoveFile, onSend, onChooseFiles }: {
  files: StagedFile[];
  members: Member[];
  currentUserId: string;
  readyPeers: string[];
  transfers: TransferRow[];
  onAddFiles: (files: FileList) => void;
  onRemoveFile: (id: string) => void;
  onSend: (peerId: string, file: File) => void;
  onChooseFiles: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const resize = useRef<Resize | null>(null);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeTarget, setActiveTarget] = useState("");
  const [draggingFile, setDraggingFile] = useState("");
  const [draggingNode, setDraggingNode] = useState("");
  const [preview, setPreview] = useState<StagedFile | null>(null);
  const [hint, setHint] = useState("");
  useEffect(() => { if (!hint) return; const timer = setTimeout(() => setHint(""), 4500); return () => clearTimeout(timer); }, [hint]);
  const peers = members.filter((member) => member.userId !== currentUserId);
  const me = members.find((member) => member.userId === currentUserId);
  const ready = new Set(readyPeers);
  const pointFor = (kind: Drag["kind"], id: string, index: number): Point => {
    const key = `${kind}:${id}`;
    if (positions[key]) return positions[key];
    if (kind === "file") return { x: 20 + (index % 5) * 15, y: 77 - Math.floor(index / 5) * 18 };
    if (kind === "zone") return { x: (surface.current?.clientWidth ?? 800) < 500 ? 24 + (index % 3) * 6 : 62 - (index % 3) * 8, y: 18 + (index % 3) * 7 };
    const angle = -Math.PI / 2 + (index * 2 * Math.PI / Math.max(peers.length, 1));
    return { x: 50 + 33 * Math.cos(angle), y: 39 + 25 * Math.sin(angle) };
  };
  const begin = (event: PointerEvent<HTMLElement>, kind: Drag["kind"], id: string, index: number) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: pointFor(kind, id, index), moved: false };
    if (kind === "file") setDraggingFile(id);
    else setDraggingNode(`${kind}:${id}`);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    const bounds = surface.current?.getBoundingClientRect();
    if (!current || current.pointerId !== event.pointerId || !bounds) return;
    const dx = event.clientX - current.startX, dy = event.clientY - current.startY;
    if (Math.hypot(dx, dy) > 5) current.moved = true;
    if (!current.moved) return;
    const key = `${current.kind}:${current.id}`;
    const zone = current.kind === "zone" ? zones.find((item) => item.id === current.id) : null;
    const maxX = zone ? 100 - zone.width / bounds.width * 100 - 1 : 92;
    const maxY = zone ? 100 - zone.height / bounds.height * 100 - 1 : 90;
    setPositions((before) => ({ ...before, [key]: { x: Math.max(zone ? 1 : 8, Math.min(maxX, current.origin.x + dx / bounds.width * 100)), y: Math.max(zone ? 1 : 10, Math.min(maxY, current.origin.y + dy / bounds.height * 100)) } }));
    if (current.kind === "file") {
      const elements = document.elementsFromPoint(event.clientX, event.clientY);
      const target = elements.find((element) => element.hasAttribute("data-share-peer") || element.hasAttribute("data-share-zone"));
      setActiveTarget(target?.getAttribute("data-share-peer") ?? target?.getAttribute("data-share-zone") ?? "");
    }
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDraggingFile("");
    setDraggingNode("");
    setActiveTarget("");
    const entry = current.kind === "file" ? files.find((item) => item.id === current.id) : null;
    if (!current.moved) { if (entry) setPreview(entry); return; }
    if (!entry) return;
    const elements = document.elementsFromPoint(event.clientX, event.clientY);
    const peer = elements.find((element) => element.hasAttribute("data-share-peer"))?.getAttribute("data-share-peer");
    if (peer) {
      const index = files.findIndex((item) => item.id === entry.id);
      setPositions((before) => ({ ...before, [`file:${entry.id}`]: { x: 20 + (index % 5) * 15, y: 77 - Math.floor(index / 5) * 18 } }));
      onSend(peer, entry.file);
      setHint(ready.has(peer) ? "Dosya teklifi gönderildi. Alıcının onayı bekleniyor." : "Bağlantı kurulunca teklif otomatik gönderilecek.");
      return;
    }
    const zone = elements.find((element) => element.hasAttribute("data-share-zone"));
    if (!zone) return;
    const bounds = zone.getBoundingClientRect();
    const targets = peers.filter((member) => {
      const node = Array.from(surface.current?.querySelectorAll<HTMLElement>("[data-share-peer]") ?? []).find((item) => item.dataset.sharePeer === member.connectionId);
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom && ready.has(member.connectionId);
    });
    if (!targets.length) { setHint("Alanın içinde bağlı bir kişi yok."); return; }
    const index = files.findIndex((item) => item.id === entry.id);
    setPositions((before) => ({ ...before, [`file:${entry.id}`]: { x: 20 + (index % 5) * 15, y: 77 - Math.floor(index / 5) * 18 } }));
    for (const target of targets) onSend(target.connectionId, entry.file);
    setHint(`${targets.length} kişiye gönderim başlatıldı.`);
  };
  const beginResize = (event: PointerEvent<HTMLButtonElement>, zone: Zone) => {
    event.stopPropagation(); event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { id: zone.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: zone.width };
  };
  const moveResize = (event: PointerEvent<HTMLButtonElement>) => {
    const current = resize.current;
    const bounds = surface.current?.getBoundingClientRect();
    if (!current || current.pointerId !== event.pointerId || !bounds) return;
    const point = pointFor("zone", current.id, zones.findIndex((item) => item.id === current.id));
    const maxWidth = bounds.width * (1 - point.x / 100) - 10;
    const maxHeight = bounds.height * (1 - point.y / 100) - 10;
    const size = Math.max(140, Math.min(maxWidth, maxHeight, current.width + Math.max(event.clientX - current.startX, event.clientY - current.startY)));
    setZones((items) => items.map((item) => item.id === current.id ? { ...item, width: size, height: size } : item));
  };
  return <div className="share-canvas-shell">
    <div className="share-canvas-head"><div><span className="eyebrow">CANLI PAYLAŞIM ALANI</span><p>Dosyayı kişiye sürükle ve bırak. Kişileri de alanda taşıyabilirsin.</p></div><div><Button variant="bare" onClick={() => setZones((items) => [...items, { id: crypto.randomUUID(), width: 190, height: 190 }])}><Plus size={14} /> Toplu alan</Button><Button variant="primary" onClick={onChooseFiles}><Plus size={14} /> Dosya ekle</Button></div></div>
    <div ref={surface} className="share-canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) onAddFiles(event.dataTransfer.files); }}>
      <div className="share-canvas-axis" aria-hidden="true" />
      {zones.map((zone, index) => { const point = pointFor("zone", zone.id, index); return <div key={zone.id} className={`share-canvas-zone ${activeTarget === zone.id ? "is-target" : ""} ${draggingNode === `zone:${zone.id}` ? "is-dragging" : ""}`} data-share-zone={zone.id} style={{ left: `${point.x}%`, top: `${point.y}%`, width: zone.width, height: zone.height }} onPointerDown={(event) => begin(event, "zone", zone.id, index)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><span><Users size={17} /> TOPLU ALAN</span><small>Kişileri buraya taşı, dosyayı alana bırak.</small><button type="button" className="share-zone-remove" aria-label="Alanı kaldır" onClick={() => setZones((items) => items.filter((item) => item.id !== zone.id))}><X size={13} /></button><button type="button" className="share-zone-resize" aria-label="Toplu alanı yeniden boyutlandır" title="Boyutlandır" onPointerDown={(event) => beginResize(event, zone)} onPointerMove={moveResize} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }}><span /></button></div>; })}
      <div className="share-canvas-self" style={{ left: "50%", top: "39%" }}><span>{me?.name.slice(0, 1) ?? "Y"}</span><strong>Sen</strong></div>
      {peers.map((member, index) => { const point = pointFor("member", member.connectionId, index); return <div key={member.connectionId} className={`share-canvas-peer ${ready.has(member.connectionId) ? "is-ready" : ""} ${activeTarget === member.connectionId ? "is-target" : ""} ${draggingNode === `member:${member.connectionId}` ? "is-dragging" : ""}`} data-share-peer={member.connectionId} style={{ left: `${point.x}%`, top: `${point.y}%` }} onPointerDown={(event) => begin(event, "member", member.connectionId, index)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><span>{member.name.slice(0, 1)}</span><strong>{member.name}</strong><small>{ready.has(member.connectionId) ? "DOSYA ALABİLİR" : "BAĞLANIYOR"}</small></div>; })}
      {files.map((entry, index) => { const point = pointFor("file", entry.id, index); return <div key={entry.id} className={`share-canvas-file ${draggingFile === entry.id ? "is-dragging" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onPointerDown={(event) => begin(event, "file", entry.id, index)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}><div className="share-canvas-file-preview"><FilePreview file={entry.file} /></div><strong title={entry.file.name}>{entry.file.name}</strong><small>{(entry.file.size / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MB</small><button type="button" aria-label={`${entry.file.name} dosyasını kaldır`} onClick={() => onRemoveFile(entry.id)}><X size={13} /></button></div>; })}
      {!files.length && <button type="button" className="share-canvas-empty" onClick={onChooseFiles}><Plus size={24} /><span>Dosya ekle veya buraya bırak</span><small>Eklediğin dosyalar bu alanda serbestçe taşınır.</small></button>}
      {hint && <div className="share-canvas-hint" role="status" onClick={() => setHint("")}>{hint}</div>}
      {transfers.length > 0 && <div className="share-canvas-transfers" aria-live="polite"><span className="eyebrow">AKTARIM DURUMU</span>{transfers.slice(0, 3).map((item) => <div key={item.id}><strong title={item.name}>{item.name}</strong><small>{item.peer} · {item.status}{item.percent > 0 && item.percent < 100 ? ` %${item.percent}` : ""}</small></div>)}</div>}
    </div>
    {preview && <div className="share-modal-backdrop" role="presentation" onClick={() => setPreview(null)}><div className="share-modal share-preview-modal" role="dialog" aria-modal="true" aria-label="Dosya önizlemesi" onClick={(event) => event.stopPropagation()}><div className="share-modal-head"><span className="eyebrow">DOSYA ÖNİZLEMESİ</span><button type="button" aria-label="Kapat" onClick={() => setPreview(null)}><X size={17} /></button></div><div className="share-preview-image"><FilePreview file={preview.file} /></div><h2>{preview.file.name}</h2><p>{(preview.file.size / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MB · {preview.file.type || "Dosya"}</p><div className="share-preview-targets">{peers.map((peer) => <button type="button" key={peer.connectionId} onClick={() => { onSend(peer.connectionId, preview.file); setPreview(null); }}><span>{peer.name}</span><span>{ready.has(peer.connectionId) ? <Send size={14} /> : "Bağlanıyor"}</span></button>)}</div><div className="share-modal-actions"><Button variant="bare" onClick={() => { onRemoveFile(preview.id); setPreview(null); }}>Kaldır</Button><Button variant="primary" disabled={!peers.length} onClick={() => { for (const peer of peers) onSend(peer.connectionId, preview.file); setPreview(null); }}><Send size={14} /> Herkese gönder <ArrowUpRight size={14} /></Button></div></div></div>}
  </div>;
}
