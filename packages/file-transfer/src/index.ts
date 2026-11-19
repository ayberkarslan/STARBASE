export type Signal =
  | { type: "offer" | "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

export type FileOffer = { id: string; name: string; size: number; mime: string };
export type TransferStatus = "offered" | "sending" | "receiving" | "sent" | "received" | "rejected" | "failed";
export type TransferProgress = { id: string; name: string; size: number; bytes: number; status: TransferStatus };
export type ReceivedFile = { id: string; name: string; size: number; blob?: Blob };

export type TransferEvents = {
  signal: (signal: Signal) => void;
  ready?: () => void;
  offer?: (offer: FileOffer) => void;
  progress?: (progress: TransferProgress) => void;
  received?: (file: ReceivedFile) => void;
  error?: (message: string) => void;
};

type Sender = { id: string; file: File; resolve: () => void; reject: (error: Error) => void; acknowledged: number; sent: number; started: boolean };
type Receiver = { offer: FileOffer; parts: ArrayBuffer[]; bytes: number; writer?: FileSystemWritableFileStream };
type SavePicker = Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle> };

/** A single ordered, encrypted WebRTC channel between two authenticated room sockets. */
export class TransferLink {
  private readonly peer: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private incomingOffer?: FileOffer;
  private receiver?: Receiver;
  private sender?: Sender;
  private receiveQueue = Promise.resolve();
  private drainWaiters: Array<() => void> = [];
  private closed = false;

  constructor(private readonly events: TransferEvents) {
    this.peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
    this.peer.onicecandidate = (event) => {
      if (event.candidate) this.events.signal({ type: "candidate", candidate: event.candidate.toJSON() });
    };
    this.peer.ondatachannel = (event) => this.attach(event.channel);
    this.peer.onconnectionstatechange = () => {
      if (this.peer.connectionState === "failed") this.events.error?.("Doğrudan bağlantı kurulamadı. Bu ağ eşler arası aktarımı engelliyor olabilir.");
    };
  }

  async initiate() {
    this.attach(this.peer.createDataChannel("files", { ordered: true }));
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    this.events.signal({ type: "offer", sdp: offer });
  }

  async handleSignal(signal: Signal) {
    if (signal.type === "candidate") {
      if (this.peer.remoteDescription) await this.peer.addIceCandidate(signal.candidate);
      else this.pendingCandidates.push(signal.candidate);
      return;
    }
    await this.peer.setRemoteDescription(signal.sdp);
    for (const candidate of this.pendingCandidates.splice(0)) await this.peer.addIceCandidate(candidate);
    if (signal.type === "offer") {
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      this.events.signal({ type: "answer", sdp: answer });
    }
  }
  private pendingCandidates: RTCIceCandidateInit[] = [];

  private attach(channel: RTCDataChannel) {
    this.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.onopen = () => this.events.ready?.();
    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        void this.handleControl(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        this.receiveQueue = this.receiveQueue.then(() => this.receiveChunk(event.data)).catch(() => this.fail("Dosya yazılamadı."));
      }
    };
    channel.onbufferedamountlow = () => this.wake();
    channel.onclose = () => { if (!this.closed) this.fail("Bağlantı kesildi."); };
  }

  get ready() { return this.channel?.readyState === "open"; }
  private send(value: object) {
    if (!this.ready) throw new Error("Bağlantı hazır değil.");
    this.channel!.send(JSON.stringify(value));
  }
  private progress(offer: FileOffer, bytes: number, status: TransferStatus) {
    this.events.progress?.({ id: offer.id, name: offer.name, size: offer.size, bytes, status });
  }

  sendFile(file: File): Promise<void> {
    if (!this.ready || this.sender) return Promise.reject(new Error("Aktarım bağlantısı meşgul veya hazır değil."));
    const id = crypto.randomUUID();
    const offer: FileOffer = { id, name: file.name, size: file.size, mime: file.type || "application/octet-stream" };
    return new Promise((resolve, reject) => {
      this.sender = { id, file, resolve, reject, acknowledged: 0, sent: 0, started: false };
      this.send({ type: "file-offer", offer });
      this.progress(offer, 0, "offered");
    });
  }

  async accept(id: string, temporary = false) {
    const offer = this.incomingOffer;
    if (!offer || offer.id !== id || this.receiver) return;
    let writer: FileSystemWritableFileStream | undefined;
    const picker = (window as SavePicker).showSaveFilePicker;
    if (picker && !temporary) {
      try { writer = await (await picker.call(window, { suggestedName: offer.name })).createWritable(); }
      catch { this.reject(id); return; }
    }
    this.receiver = { offer, parts: [], bytes: 0, writer };
    this.incomingOffer = undefined;
    this.send({ type: "file-accept", id });
    this.progress(offer, 0, "receiving");
  }

  reject(id: string) {
    if (this.incomingOffer?.id !== id) return;
    this.incomingOffer = undefined;
    this.send({ type: "file-reject", id });
  }

  private async handleControl(raw: string) {
    let data: Record<string, unknown>;
    try { data = JSON.parse(raw); } catch { return; }
    const sender = this.sender;
    if (data.type === "file-offer") {
      const offer = data.offer as FileOffer;
      if (!offer || typeof offer.id !== "string" || typeof offer.name !== "string" || offer.name.length > 255 || typeof offer.mime !== "string" || offer.mime.length > 128 || !Number.isSafeInteger(offer.size) || offer.size < 0 || this.receiver || this.incomingOffer) return;
      this.incomingOffer = offer;
      this.events.offer?.(offer);
      return;
    }
    if (data.type === "file-accept" && sender && sender.id === data.id && !sender.started) {
      sender.started = true;
      void this.pump(sender.file, sender.id);
      return;
    }
    if (data.type === "file-reject" && sender && sender.id === data.id) {
      sender.reject(new Error("Alıcı dosyayı reddetti."));
      this.sender = undefined;
      return;
    }
    if (data.type === "chunk-ack" && sender && sender.id === data.id && sender.acknowledged < sender.sent) {
      sender.acknowledged++;
      this.wake();
      return;
    }
    if (data.type === "file-done" && this.receiver) {
      await this.receiveQueue;
      if (!this.receiver) return;
      const { offer, bytes, writer, parts } = this.receiver;
      if (bytes !== offer.size) { this.fail("Aktarım eksik tamamlandı."); return; }
      if (writer) await writer.close();
      this.events.received?.({ id: offer.id, name: offer.name, size: bytes, blob: writer ? undefined : new Blob(parts, { type: offer.mime }) });
      this.progress(offer, bytes, "received");
      this.receiver = undefined;
      this.send({ type: "file-complete", id: offer.id });
      return;
    }
    if (data.type === "file-complete" && sender && sender.id === data.id) {
      const { file, resolve } = sender;
      this.progress({ id: String(data.id), name: file.name, size: file.size, mime: file.type }, file.size, "sent");
      this.sender = undefined;
      resolve();
    }
  }

  private async pump(file: File, id: string) {
    try {
      const offer: FileOffer = { id, name: file.name, size: file.size, mime: file.type };
      for (let offset = 0; offset < file.size; offset += 16 * 1024) {
        while (!this.closed && this.sender && (this.sender.sent - this.sender.acknowledged >= 32 || this.channel!.bufferedAmount > 1024 * 1024)) await new Promise<void>((resolve) => this.drainWaiters.push(resolve));
        if (this.closed || !this.sender) throw new Error("Aktarım durduruldu.");
        const chunk = await file.slice(offset, offset + 16 * 1024).arrayBuffer();
        this.channel!.send(chunk);
        this.sender.sent++;
        this.progress(offer, Math.min(offset + chunk.byteLength, file.size), "sending");
      }
      while (!this.closed && this.sender && this.sender.acknowledged < this.sender.sent) await new Promise<void>((resolve) => this.drainWaiters.push(resolve));
      if (!this.closed && this.sender) this.send({ type: "file-done", id });
    } catch (error) { this.fail(error instanceof Error ? error.message : "Aktarım kesildi."); }
  }

  private async receiveChunk(chunk: ArrayBuffer) {
    const receiver = this.receiver;
    if (!receiver) return;
    if (receiver.bytes + chunk.byteLength > receiver.offer.size) { this.fail("Dosya boyutu beklenenden büyük."); return; }
    if (receiver.writer) await receiver.writer.write(chunk);
    else receiver.parts.push(chunk);
    receiver.bytes += chunk.byteLength;
    this.progress(receiver.offer, receiver.bytes, "receiving");
    this.send({ type: "chunk-ack", id: receiver.offer.id });
  }

  private wake() { for (const resolve of this.drainWaiters.splice(0)) resolve(); }
  private fail(message: string, report = true) {
    if (this.sender) { this.sender.reject(new Error(message)); this.sender = undefined; }
    if (this.receiver?.writer) void this.receiver.writer.abort();
    this.receiver = undefined;
    this.wake();
    if (report) this.events.error?.(message);
  }
  close() { if (this.closed) return; this.closed = true; this.fail("Bağlantı kapatıldı.", false); this.channel?.close(); this.peer.close(); }
}
