// store.ts — สถานะ realtime ทั้งแอป: WebSocket, ช่อง, ข้อความ, เสียงสด, PTT, ตำแหน่ง, SOS
import { useSyncExternalStore } from 'react';
import { Alert, api, Channel, DirectoryUser, getToken, JoinRequest, Location, Me, Message, Status, User } from './api';
import { beep, LivePlayer, MicCapture, siren, silentWavUrl, unlockAudio } from './audio';
import { AppConfig, applyConfig, DEFAULT_CONFIG } from './theme';

export type PttPhase = 'idle' | 'requesting' | 'talking';

export interface Settings {
  pttMode: 'hold' | 'toggle';
  headsetPtt: boolean;
  shareLocation: boolean;
  transcribe: boolean;
  notifications: boolean;
  keepAwake: boolean;
  mutedChannels: number[];
}

export interface LiveTalk {
  user: User;
  level: number;
  sos: boolean;
}

export interface ChannelMessages {
  items: Message[];
  hasMore: boolean;
  loading: boolean;
}

export interface State {
  connected: boolean;
  me: Me | null;
  requests: JoinRequest[]; // คำขอที่ฉันกดรับ/ปฏิเสธได้
  friendsVersion: number;
  channels: Channel[];
  online: Record<number, Status>;
  users: Record<number, User>; // สมุดรายชื่อ (ชื่อ/รูป) ใช้แสดง avatar
  messages: Record<number, ChannelMessages>;
  live: Record<number, LiveTalk>;
  locations: Record<number, Location>;
  alerts: Alert[];
  activity: Message[]; // ข้อความล่าสุดทุกช่อง (ใช้ใน dispatch)
  activeChannelId: number | null;
  ptt: { phase: PttPhase; channelId: number | null; startedAt: number; maxMs: number; interim: string };
  settings: Settings;
  toast: { id: number; text: string; tone: 'info' | 'error' } | null;
  config: AppConfig;
  profileId: number | null; // ผู้ใช้ที่เปิดดูโปรไฟล์อยู่
  sirenOn: boolean;
}

const SpeechRecognitionImpl: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
export const speechSupported = !!SpeechRecognitionImpl;

const SETTINGS_KEY = 'ptt.settings';
const defaultSettings: Settings = {
  pttMode: 'hold',
  headsetPtt: false,
  shareLocation: false,
  transcribe: speechSupported,
  notifications: false,
  keepAwake: false,
  mutedChannels: [],
};

function loadSettings(): Settings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return defaultSettings;
  }
}

const initialState = (): State => ({
  connected: false,
  me: null,
  requests: [],
  friendsVersion: 0,
  channels: [],
  online: {},
  users: {},
  messages: {},
  live: {},
  locations: {},
  alerts: [],
  activity: [],
  activeChannelId: null,
  ptt: { phase: 'idle', channelId: null, startedAt: 0, maxMs: 60000, interim: '' },
  settings: loadSettings(),
  toast: null,
  config: DEFAULT_CONFIG,
  profileId: null,
  sirenOn: false,
});

class Store {
  state: State = initialState();
  private listeners = new Set<() => void>();
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private players = new Map<number, LivePlayer>();
  private mic = new MicCapture();
  private pressed = false;
  private sosStopTimer: ReturnType<typeof setTimeout> | null = null;
  private rec: any = null;
  private recFinal = '';
  private pendingTranscript: { messageId?: number | null; recDone?: boolean } | null = null;
  private geoWatch: number | null = null;
  private lastGeoSent = 0;
  private battery: any = null;
  private stopSiren: (() => void) | null = null;
  private headsetAudio: HTMLAudioElement | null = null;
  private readTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private toastSeq = 0;

  constructor() {
    this.mic.onChunk = (pcm) => {
      if (this.state.ptt.phase === 'talking' && this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
    };
  }

  // ---------- store plumbing ----------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getState = () => this.state;
  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  toast(text: string, tone: 'info' | 'error' = 'info') {
    const id = ++this.toastSeq;
    this.set({ toast: { id, text, tone } });
    setTimeout(() => { if (this.state.toast?.id === id) this.set({ toast: null }); }, 3500);
  }

  async loadConfig() {
    try {
      const config = { ...DEFAULT_CONFIG, ...(await api.get<Partial<AppConfig>>('/api/config')) };
      this.setConfig(config);
    } catch { /* ใช้ค่าเริ่มต้น */ }
  }

  setConfig(config: AppConfig) {
    applyConfig(config);
    this.set({ config });
  }

  openProfile(userId: number | null) {
    this.set({ profileId: userId });
  }

  dismissToast() {
    this.set({ toast: null });
  }

  updateSettings(patch: Partial<Settings>) {
    const settings = { ...this.state.settings, ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    this.set({ settings });
    if ('shareLocation' in patch) this.applyLocationSharing();
    if ('headsetPtt' in patch) this.applyHeadset();
  }

  isMuted(channelId: number) {
    return this.state.settings.mutedChannels.includes(channelId);
  }

  toggleMute(channelId: number) {
    const muted = this.state.settings.mutedChannels;
    this.updateSettings({
      mutedChannels: muted.includes(channelId) ? muted.filter((id) => id !== channelId) : [...muted, channelId],
    });
  }

  // ---------- connection ----------
  start(me: Me) {
    this.set({ me });
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.applyLocationSharing();
    this.applyHeadset();
    this.loadAlerts();
    this.loadUsers();
    this.loadRequests();
    api.get<{ locations: Location[] }>('/api/locations').then(({ locations }) => {
      this.set({ locations: Object.fromEntries(locations.map((l) => [l.userId, l])) });
    }).catch(() => {});
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close();
    this.ws = null;
    this.releaseTalk();
    this.mic.stop();
    if (this.geoWatch != null) navigator.geolocation.clearWatch(this.geoWatch);
    this.geoWatch = null;
    this.stopAlarm();
    const { settings, config } = this.state;
    this.state = { ...initialState(), settings, config };
    this.listeners.forEach((fn) => fn());
  }

  private connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(getToken() || '')}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      this.set({ connected: true });
      if (this.state.activeChannelId != null) this.send({ type: 'watch', channelId: this.state.activeChannelId });
      if (this.monitorAll) this.send({ type: 'monitor', on: true });
      // ข้อความที่พลาดไประหว่างหลุด
      for (const id of Object.keys(this.state.messages)) this.refreshMessages(Number(id));
    };
    ws.onmessage = (e) => (e.data instanceof ArrayBuffer ? this.onAudio(e.data) : this.onEvent(JSON.parse(e.data)));
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.set({ connected: false, live: {} });
      if (this.state.ptt.phase !== 'idle') this.endLocalTalk(false);
      if (e.code === 4001) {
        window.dispatchEvent(new Event('ptt:logout'));
        return;
      }
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), 2000);
    };
  }

  send(msg: object) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private monitorAll = false;
  setMonitorAll(on: boolean) {
    this.monitorAll = on;
    this.send({ type: 'monitor', on });
  }

  setActiveChannel(channelId: number | null) {
    this.set({ activeChannelId: channelId });
    this.send({ type: 'watch', channelId });
    if (channelId != null) this.markRead(channelId);
  }

  setStatus(status: Status) {
    if (!this.state.me) return;
    this.set({ me: { ...this.state.me, status } });
    this.send({ type: 'status', status });
  }

  async loadUsers() {
    try {
      const { users } = await api.get<{ users: DirectoryUser[] }>('/api/users');
      this.set({ users: Object.fromEntries(users.map((u) => [u.id, u])) });
    } catch { /* ignore */ }
  }

  setMe(user: Me) {
    this.set({ me: { ...user, status: this.state.me?.status ?? user.status }, users: { ...this.state.users, [user.id]: user } });
  }

  async loadRequests() {
    try {
      const { requests } = await api.get<{ requests: JoinRequest[] }>('/api/requests');
      this.set({ requests });
    } catch { /* ignore */ }
  }

  // ดึงชื่อ/รูปของผู้ใช้ที่ยังไม่รู้จัก (เช่น ผู้ส่งในกลุ่มสาธารณะ)
  private pendingLookup = new Set<number>();
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;
  ensureUsers(ids: (number | null)[]) {
    for (const id of ids) if (id && !this.state.users[id]) this.pendingLookup.add(id);
    if (!this.pendingLookup.size || this.lookupTimer) return;
    this.lookupTimer = setTimeout(async () => {
      const list = [...this.pendingLookup];
      this.pendingLookup.clear();
      this.lookupTimer = null;
      try {
        const { users } = await api.get<{ users: User[] }>(`/api/users/lookup?ids=${list.join(',')}`);
        this.set({ users: { ...this.state.users, ...Object.fromEntries(users.map((u) => [u.id, u])) } });
      } catch { /* ignore */ }
    }, 150);
  }

  // ---------- server events ----------
  private onEvent(msg: any) {
    switch (msg.type) {
      case 'hello':
        this.set({ me: msg.user, channels: msg.channels, online: msg.online });
        break;
      case 'channels':
        this.set({ channels: msg.channels });
        break;
      case 'presence':
        this.set({ online: msg.online });
        if (Object.keys(msg.online).some((id) => !this.state.users[Number(id)])) this.loadUsers();
        break;
      case 'me':
        this.set({ me: { ...msg.user, status: this.state.me?.status ?? msg.user.status } });
        window.dispatchEvent(new CustomEvent('ptt:me', { detail: msg.user }));
        break;
      case 'config':
        this.setConfig({ ...DEFAULT_CONFIG, ...msg.config });
        break;
      case 'requests':
        this.loadRequests();
        break;
      case 'org-request':
        this.loadRequests();
        this.toast('มีคำขอเปิดองค์กรใหม่รออนุมัติ');
        break;
      case 'friends':
        this.set({ friendsVersion: this.state.friendsVersion + 1 });
        this.loadUsers();
        break;
      case 'request-decided':
        this.toast(msg.approved
          ? msg.kind === 'org' ? 'ได้รับอนุมัติเข้าองค์กรแล้ว 🎉' : 'ได้รับอนุมัติเข้ากลุ่มแล้ว'
          : msg.kind === 'org' ? 'คำขอเข้าองค์กรถูกปฏิเสธ' : 'คำขอเข้ากลุ่มถูกปฏิเสธ', msg.approved ? 'info' : 'error');
        break;
      case 'user':
        this.set({ users: { ...this.state.users, [msg.user.id]: msg.user } });
        if (msg.user.id === this.state.me?.id) this.set({ me: { ...msg.user, status: this.state.me!.status } });
        break;
      case 'message':
        this.onMessage(msg.message);
        break;
      case 'message-update':
        this.patchMessage(msg.message.channelId, (items) => items.map((m) => (m.id === msg.message.id ? msg.message : m)));
        break;
      case 'messages-delete': {
        const ids = new Set<number>(msg.ids);
        this.patchMessage(msg.channelId, (items) => items.filter((m) => !ids.has(m.id)));
        break;
      }
      case 'message-delete':
        this.patchMessage(msg.channelId, (items) => items.filter((m) => m.id !== msg.messageId));
        break;
      case 'talk-start': {
        this.players.get(msg.channelId)?.reset();
        this.set({ live: { ...this.state.live, [msg.channelId]: { user: msg.user, level: 0, sos: msg.sos } } });
        if (this.shouldPlay(msg.channelId)) beep('incoming');
        break;
      }
      case 'talk-end': {
        const live = { ...this.state.live };
        const had = !!live[msg.channelId];
        delete live[msg.channelId];
        this.set({ live });
        if (had && this.shouldPlay(msg.channelId)) setTimeout(() => beep('end'), 200);
        break;
      }
      case 'talk-granted':
        this.onTalkGranted(msg.channelId, msg.maxMs);
        break;
      case 'talk-denied':
        this.pressed = false;
        this.set({ ptt: { ...this.state.ptt, phase: 'idle', channelId: null } });
        beep('busy');
        this.toast(msg.reason || 'ช่องไม่ว่าง', 'error');
        break;
      case 'talk-saved':
        if (this.state.ptt.phase === 'talking') this.endLocalTalk(true); // ถูกตัดเพราะพูดนานเกิน
        if (this.pendingTranscript) {
          this.pendingTranscript.messageId = msg.messageId;
          this.flushTranscript();
        }
        break;
      case 'location':
        this.set({ locations: { ...this.state.locations, [msg.location.userId]: msg.location } });
        break;
      case 'sos':
        this.onSos(msg.alert);
        break;
      case 'alert-update':
        this.set({
          alerts: msg.alert.resolvedAt
            ? this.state.alerts.filter((a) => a.id !== msg.alert.id)
            : this.state.alerts.map((a) => (a.id === msg.alert.id ? msg.alert : a)),
        });
        if (!this.state.alerts.some((a) => !a.ackedAt)) this.stopAlarm();
        break;
      case 'channel-removed': {
        const messages = { ...this.state.messages };
        delete messages[msg.channelId];
        this.set({ messages });
        if (this.state.activeChannelId === msg.channelId) window.dispatchEvent(new CustomEvent('ptt:channel-removed'));
        break;
      }
    }
  }

  private shouldPlay(channelId: number) {
    if (this.state.me?.status === 'busy' && this.state.activeChannelId !== channelId) return false;
    return !this.isMuted(channelId);
  }

  private onAudio(data: ArrayBuffer) {
    const channelId = new DataView(data).getUint32(0, true);
    if (!this.shouldPlay(channelId)) return;
    let p = this.players.get(channelId);
    if (!p) {
      p = new LivePlayer();
      p.onLevel = (level) => {
        const cur = this.state.live[channelId];
        if (cur && Math.abs(cur.level - level) > 0.05) this.set({ live: { ...this.state.live, [channelId]: { ...cur, level } } });
      };
      this.players.set(channelId, p);
    }
    p.push(data.slice(4));
  }

  // ---------- messages ----------
  private patchMessage(channelId: number, fn: (items: Message[]) => Message[]) {
    const cur = this.state.messages[channelId];
    if (cur) this.set({ messages: { ...this.state.messages, [channelId]: { ...cur, items: fn(cur.items) } } });
    this.set({ activity: fn(this.state.activity) });
  }

  private onMessage(m: Message) {
    const cur = this.state.messages[m.channelId];
    if (cur && !cur.items.some((x) => x.id === m.id)) {
      this.set({ messages: { ...this.state.messages, [m.channelId]: { ...cur, items: [...cur.items, m] } } });
    }
    this.set({ activity: [m, ...this.state.activity.filter((x) => x.id !== m.id)].slice(0, 100) });
    if (m.channelId === this.state.activeChannelId && !document.hidden) this.markRead(m.channelId);
    if (m.userId !== this.state.me?.id && document.hidden && m.kind !== 'sos') {
      const ch = this.state.channels.find((c) => c.id === m.channelId);
      if (ch && !this.isMuted(ch.id)) {
        this.notify(ch.type === 'direct' ? m.username : `${m.username} • ${ch.name}`, previewText(m), `ch-${ch.id}`);
      }
    }
  }

  async loadMessages(channelId: number) {
    const cur = this.state.messages[channelId];
    if (cur && (cur.items.length || cur.loading)) return;
    await this.refreshMessages(channelId);
  }

  private async refreshMessages(channelId: number) {
    const prev = this.state.messages[channelId];
    this.set({ messages: { ...this.state.messages, [channelId]: { items: prev?.items || [], hasMore: prev?.hasMore ?? false, loading: true } } });
    try {
      const { messages, hasMore } = await api.get<{ messages: Message[]; hasMore: boolean }>(`/api/channels/${channelId}/messages?limit=50`);
      this.set({ messages: { ...this.state.messages, [channelId]: { items: messages, hasMore, loading: false } } });
    } catch {
      this.set({ messages: { ...this.state.messages, [channelId]: { items: prev?.items || [], hasMore: false, loading: false } } });
    }
  }

  async loadOlder(channelId: number) {
    const cur = this.state.messages[channelId];
    if (!cur || !cur.hasMore || cur.loading || !cur.items.length) return;
    this.set({ messages: { ...this.state.messages, [channelId]: { ...cur, loading: true } } });
    const { messages, hasMore } = await api.get<{ messages: Message[]; hasMore: boolean }>(
      `/api/channels/${channelId}/messages?limit=50&before=${cur.items[0].id}`
    );
    const now = this.state.messages[channelId];
    this.set({ messages: { ...this.state.messages, [channelId]: { items: [...messages, ...now.items], hasMore, loading: false } } });
  }

  markRead(channelId: number) {
    const ch = this.state.channels.find((c) => c.id === channelId);
    if (!ch?.role) return;
    if (ch.unread) this.set({ channels: this.state.channels.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c)) });
    clearTimeout(this.readTimers.get(channelId));
    this.readTimers.set(channelId, setTimeout(() => {
      const items = this.state.messages[channelId]?.items;
      const lastId = items?.length ? items[items.length - 1].id : ch.lastMessage?.id;
      if (lastId) api.post(`/api/channels/${channelId}/read`, { lastId }).catch(() => {});
    }, 400));
  }

  // ---------- PTT ----------
  get speechOn() {
    return this.state.settings.transcribe && speechSupported;
  }

  // กดปุ่มพูด (ทั้งโหมดกดค้างและโหมดแตะเปิด/ปิด)
  async pressTalk(channelId: number, opts: { sos?: boolean } = {}) {
    if (this.state.settings.pttMode === 'toggle' && !opts.sos && this.state.ptt.phase !== 'idle') {
      this.releaseTalk(true);
      return;
    }
    if (this.pressed || this.state.ptt.phase !== 'idle') return;
    this.pressed = true;
    try {
      await unlockAudio();
      if (!this.mic.ready) await this.mic.start();
    } catch (err: any) {
      this.pressed = false;
      this.toast(err?.name === 'NotAllowedError' ? 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน' : err?.message || 'เปิดไมโครโฟนไม่ได้', 'error');
      return;
    }
    if (!this.pressed) return;
    if (this.send({ type: 'talk-start', channelId, sos: !!opts.sos })) {
      this.set({ ptt: { ...this.state.ptt, phase: 'requesting', channelId } });
    } else {
      this.pressed = false;
      this.toast('ยังไม่ได้เชื่อมต่อกับเซิร์ฟเวอร์', 'error');
    }
  }

  // ปล่อยปุ่ม — โหมด toggle จะไม่ปล่อยจนกว่าจะแตะอีกครั้ง (force)
  releaseTalk(force = false) {
    if (this.state.settings.pttMode === 'toggle' && !force) return;
    if (!this.pressed) return;
    this.pressed = false;
    if (this.state.ptt.phase === 'talking') {
      this.send({ type: 'talk-stop' });
      this.endLocalTalk(true);
    }
  }

  private onTalkGranted(channelId: number, maxMs: number) {
    if (!this.pressed) {
      this.send({ type: 'talk-stop' });
      this.set({ ptt: { ...this.state.ptt, phase: 'idle', channelId: null } });
      return;
    }
    this.set({ ptt: { phase: 'talking', channelId, startedAt: Date.now(), maxMs, interim: '' } });
    beep('start');
    this.startRecognition();
  }

  private endLocalTalk(withBeep: boolean) {
    this.pressed = false;
    if (this.sosStopTimer) clearTimeout(this.sosStopTimer);
    this.sosStopTimer = null;
    this.stopRecognition();
    this.set({ ptt: { ...this.state.ptt, phase: 'idle', channelId: null } });
    if (withBeep) beep('end');
  }

  private startRecognition() {
    if (!this.speechOn) return;
    try {
      const rec = new SpeechRecognitionImpl();
      rec.lang = 'th-TH';
      rec.continuous = true;
      rec.interimResults = true;
      this.recFinal = '';
      rec.onresult = (e: any) => {
        let fin = '';
        let tmp = '';
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) fin += e.results[i][0].transcript;
          else tmp += e.results[i][0].transcript;
        }
        this.recFinal = fin;
        this.set({ ptt: { ...this.state.ptt, interim: fin + tmp } });
      };
      rec.onend = () => {
        this.rec = null;
        if (this.pendingTranscript) {
          this.pendingTranscript.recDone = true;
          this.flushTranscript();
        }
      };
      rec.start();
      this.rec = rec;
      this.pendingTranscript = {};
    } catch {
      this.rec = null;
    }
  }

  private stopRecognition() {
    if (this.rec) this.rec.stop();
    else if (this.pendingTranscript) this.pendingTranscript.recDone = true;
  }

  private flushTranscript() {
    const p = this.pendingTranscript;
    if (!p || p.messageId === undefined || !p.recDone) return;
    const text = this.recFinal.trim();
    if (p.messageId && text) this.send({ type: 'transcript', messageId: p.messageId, text });
    this.pendingTranscript = null;
    this.recFinal = '';
  }

  // ---------- ปุ่ม PTT บนหูฟังบลูทูธ (media key) ----------
  private applyHeadset() {
    const ms = (navigator as any).mediaSession;
    if (!ms) return;
    if (!this.state.settings.headsetPtt) {
      this.headsetAudio?.pause();
      this.headsetAudio = null;
      ['play', 'pause', 'stop'].forEach((a) => { try { ms.setActionHandler(a, null); } catch { /* unsupported */ } });
      return;
    }
    if (!this.headsetAudio) {
      this.headsetAudio = new Audio(silentWavUrl());
      this.headsetAudio.loop = true;
    }
    this.headsetAudio.play().catch(() => {});
    const toggle = () => {
      const ch = this.state.activeChannelId;
      if (this.state.ptt.phase !== 'idle') {
        this.pressed = true;
        this.releaseTalk(true);
      } else if (ch != null) {
        this.pressTalk(ch); // กดครั้งถัดไปจึงหยุด (releaseTalk(true) ด้านบน)
      }
      this.headsetAudio?.play().catch(() => {});
    };
    ['play', 'pause', 'stop'].forEach((a) => { try { ms.setActionHandler(a, toggle); } catch { /* unsupported */ } });
    ms.metadata = new (window as any).MediaMetadata({ title: 'PTT พร้อมใช้งาน', artist: 'กดปุ่มบนหูฟังเพื่อพูด' });
  }

  // ---------- ตำแหน่ง ----------
  private applyLocationSharing() {
    if (!('geolocation' in navigator)) return;
    if (this.state.settings.shareLocation && this.geoWatch == null && !this.stopped) {
      (navigator as any).getBattery?.().then((b: any) => { this.battery = b; }).catch(() => {});
      this.geoWatch = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - this.lastGeoSent < 5000) return;
          this.lastGeoSent = now;
          const c = pos.coords;
          this.send({
            type: 'location', lat: c.latitude, lng: c.longitude, acc: c.accuracy,
            speed: c.speed ?? undefined, heading: c.heading ?? undefined,
            battery: this.battery?.level, charging: this.battery?.charging,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            this.toast('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง', 'error');
            this.updateSettings({ shareLocation: false });
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
      );
    } else if (!this.state.settings.shareLocation && this.geoWatch != null) {
      navigator.geolocation.clearWatch(this.geoWatch);
      this.geoWatch = null;
    }
  }

  getPosition(timeout = 8000): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 30000 });
    });
  }

  // ---------- SOS ----------
  async loadAlerts() {
    try {
      const { alerts } = await api.get<{ alerts: Alert[] }>('/api/alerts?open=1');
      this.set({ alerts });
    } catch { /* ignore */ }
  }

  async triggerSos(note?: string) {
    await unlockAudio();
    const pos = await this.getPosition(5000);
    const { channelId } = await api.post<{ alert: Alert; channelId: number | null }>('/api/sos', {
      lat: pos?.coords.latitude, lng: pos?.coords.longitude, note,
    });
    // ส่งเสียงสดเข้าช่องฉุกเฉินอัตโนมัติตามเวลาที่ Super admin ตั้ง
    if (channelId != null) {
      if (this.state.ptt.phase !== 'idle') { this.pressed = true; this.releaseTalk(true); }
      await this.pressTalk(channelId, { sos: true });
      const secs = this.state.config.sosTalkSeconds;
      if (secs > 0) this.sosStopTimer = setTimeout(() => { this.pressed = true; this.releaseTalk(true); }, secs * 1000);
      else { this.pressed = true; this.releaseTalk(true); }
    }
    return channelId;
  }

  private onSos(alert: Alert) {
    if (!this.state.alerts.some((a) => a.id === alert.id)) this.set({ alerts: [alert, ...this.state.alerts] });
    if (alert.userId === this.state.me?.id) return;
    this.startAlarm();
    this.notify(`🚨 SOS จาก ${alert.username}`, alert.note || 'แจ้งเหตุฉุกเฉิน', `sos-${alert.id}`, true);
    navigator.vibrate?.([400, 200, 400, 200, 400]);
  }

  startAlarm() {
    if (this.stopSiren) return;
    unlockAudio().then(() => {
      if (this.stopSiren) return;
      this.stopSiren = siren();
      this.set({ sirenOn: true });
    });
  }

  stopAlarm() {
    this.stopSiren?.();
    this.stopSiren = null;
    if (this.state.sirenOn) this.set({ sirenOn: false });
  }

  async alertAction(id: number, action: 'ack' | 'resolve') {
    const { alert } = await api.post<{ alert: Alert }>(`/api/alerts/${id}/${action}`);
    this.onEvent({ type: 'alert-update', alert });
  }

  // ---------- notifications ----------
  private notify(title: string, body: string, tag: string, urgent = false) {
    if (!this.state.settings.notifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!urgent && !document.hidden) return;
    try {
      const n = new Notification(title, { body, tag, requireInteraction: urgent } as NotificationOptions);
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* ignore */ }
  }
}

export function previewText(m: Message | null): string {
  if (!m) return '';
  switch (m.kind) {
    case 'audio': return m.transcript ? `🎙️ ${m.transcript}` : `🎙️ ข้อความเสียง ${Math.round((m.durationMs || 0) / 1000)} วิ`;
    case 'image': return m.text ? `🖼️ ${m.text}` : '🖼️ รูปภาพ';
    case 'location': return '📍 แชร์ตำแหน่ง';
    case 'sos': return `🚨 SOS${m.text ? ` — ${m.text}` : ''}`;
    default: return m.text || '';
  }
}

export const store = new Store();

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
