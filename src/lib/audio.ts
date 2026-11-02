// audio.ts — อัดเสียงไมค์เป็น PCM16 16kHz, เล่นเสียงสดแบบมี jitter buffer, และเสียงบี๊บแบบวิทยุ
export const SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = 1600; // 100ms ต่อแพ็กเก็ต
const JITTER_SEC = 0.15;

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

// ต้องเรียกจาก user gesture (คลิก/แตะ) เพื่อปลดล็อกเสียงในเบราว์เซอร์
export async function unlockAudio() {
  const c = audioContext();
  if (c.state !== 'running') await c.resume();
  return c.state === 'running';
}

// AudioWorklet: resample จาก sample rate ของเครื่องเป็น 16kHz แล้วส่งเป็น Int16 ทุก 100ms
const WORKLET_SRC = `
class PttCapture extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.ratio = sampleRate / ${SAMPLE_RATE};
    this.pos = 0;
    this.prev = 0;
    this.out = new Int16Array(${CHUNK_SAMPLES});
    this.n = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    // linear interpolation resampler
    while (this.pos < input.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = i === 0 ? this.prev : input[i - 1];
      const b = input[i];
      const s = Math.max(-1, Math.min(1, a + (b - a) * frac));
      this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.out.length) {
        this.port.postMessage(this.out.buffer, [this.out.buffer]);
        this.out = new Int16Array(${CHUNK_SAMPLES});
        this.n = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= input.length;
    this.prev = input[input.length - 1];
    return true;
  }
}
registerProcessor('ptt-capture', PttCapture);
`;

export class MicCapture {
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  onChunk: ((pcm: ArrayBuffer) => void) | null = null;

  get ready() {
    return !!this.node;
  }

  async start() {
    if (this.node) return;
    const c = audioContext();
    if (!window.isSecureContext || !navigator.mediaDevices) {
      throw new Error('เบราว์เซอร์อนุญาตไมโครโฟนเฉพาะ HTTPS หรือ localhost เท่านั้น');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    await c.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.source = c.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(c, 'ptt-capture');
    this.node.port.onmessage = (e) => this.onChunk?.(e.data as ArrayBuffer);
    // ต่อเข้า gain 0 เพื่อให้ worklet ทำงานโดยไม่มีเสียงตัวเองออกลำโพง
    const mute = c.createGain();
    mute.gain.value = 0;
    this.source.connect(this.node).connect(mute).connect(c.destination);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.node?.disconnect();
    this.stream = null;
    this.source = null;
    this.node = null;
  }
}

function pcm16ToBuffer(c: AudioContext, data: ArrayBuffer): AudioBuffer {
  const pcm = new Int16Array(data);
  const buf = c.createBuffer(1, pcm.length, SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
  return buf;
}

// เล่นเสียงสดที่ทยอยมาเป็นชิ้นๆ ต่อเนื่องกัน
export class LivePlayer {
  private nextTime = 0;
  private gain: GainNode | null = null;
  onLevel: ((level: number) => void) | null = null;

  setVolume(v: number) {
    this.output().gain.value = v;
  }

  private output() {
    if (!this.gain) {
      this.gain = audioContext().createGain();
      this.gain.connect(audioContext().destination);
    }
    return this.gain;
  }

  reset() {
    this.nextTime = 0;
  }

  push(data: ArrayBuffer) {
    const c = audioContext();
    if (c.state !== 'running') return;
    const buf = pcm16ToBuffer(c, data);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(this.output());
    const startAt = Math.max(this.nextTime, c.currentTime + JITTER_SEC);
    src.start(startAt);
    this.nextTime = startAt + buf.duration;
    if (this.onLevel) {
      const ch = buf.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < ch.length; i += 4) sum += ch[i] * ch[i];
      this.onLevel(Math.min(1, Math.sqrt(sum / (ch.length / 4)) * 4));
    }
  }
}

// เล่นไฟล์ WAV จากประวัติ
let clipSource: AudioBufferSourceNode | null = null;
export async function playClip(data: ArrayBuffer, onEnd: () => void) {
  stopClip();
  const c = audioContext();
  await unlockAudio();
  const buf = await c.decodeAudioData(data);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.onended = () => {
    if (clipSource === src) clipSource = null;
    onEnd();
  };
  clipSource = src;
  src.start();
}
export function stopClip() {
  if (clipSource) {
    const s = clipSource;
    clipSource = null;
    try { s.stop(); } catch { /* already stopped */ }
  }
}

// เสียงบี๊บแบบวิทยุสื่อสาร
type Tone = 'start' | 'end' | 'busy' | 'incoming';
const TONES: Record<Tone, [number, number][]> = {
  start: [[880, 0.06], [1320, 0.08]],
  end: [[1320, 0.06], [880, 0.08]],
  incoming: [[1046, 0.07]],
  busy: [[420, 0.12], [0, 0.06], [420, 0.12]],
};
export function beep(tone: Tone) {
  const c = audioContext();
  if (c.state !== 'running') return;
  let t = c.currentTime + 0.01;
  for (const [freq, dur] of TONES[tone]) {
    if (freq > 0) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    t += dur;
  }
}

// สัญญาณเตือน SOS (ไซเรนวนจนกว่าจะหยุด)
export function siren(): () => void {
  const c = audioContext();
  const osc = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 900;
  lfo.frequency.value = 1.5;
  lfoGain.gain.value = 350;
  g.gain.value = 0.18;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.connect(g).connect(c.destination);
  osc.start();
  lfo.start();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    g.gain.setTargetAtTime(0, c.currentTime, 0.05);
    osc.stop(c.currentTime + 0.3);
    lfo.stop(c.currentTime + 0.3);
  };
}

// WAV เงียบ 1 วินาที — ใช้เล่นวนเพื่อให้ปุ่มบนหูฟังบลูทูธส่ง media key มาที่หน้าเว็บ
export function silentWavUrl(): string {
  const rate = 8000;
  const bytes = rate; // 8-bit mono 1s
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, bytes, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
