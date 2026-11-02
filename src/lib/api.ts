// api.ts — เรียก REST API ของ backend พร้อมแนบ token
const TOKEN_KEY = 'ptt.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, contentType?: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    headers['Content-Type'] = contentType || body.type;
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `เกิดข้อผิดพลาด (HTTP ${res.status})`, res.status);
  return data as T;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('โหลดไฟล์ไม่สำเร็จ', res.status);
  return res.blob();
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  upload: <T>(url: string, file: Blob) => request<T>('POST', url, file),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  blob: fetchBlob,
  fileUrl: (messageId: number) => `/api/messages/${messageId}/file`,
  async download(url: string, filename: string) {
    const blob = await fetchBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

export type Role = 'superadmin' | 'user';
export type OrgRole = 'admin' | 'dispatcher' | 'member';
export type Status = 'available' | 'busy';
export type MemberRole = 'owner' | 'moderator' | 'member' | 'listener';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  status: Status;
  avatar: string | null;
  orgId: number | null;
  orgName: string | null;
  orgRole: OrgRole | null;
}

// ข้อมูลของตัวเอง
export interface Me extends User {
  friendCode: string;
  org: {
    id: number; name: string; status: 'pending' | 'active' | 'suspended' | 'rejected'; memberStatus: 'pending' | 'active' | null;
    role: OrgRole; allowExternal: boolean; avatar: string | null;
  } | null;
  staffScope: 'all' | number | null;
  external: boolean;
}

export interface JoinRequest {
  id: number;
  kind: 'org' | 'channel';
  orgId: number | null;
  orgName: string | null;
  channelId: number | null;
  channelName: string | null;
  createdAt: number;
  user: User;
}

export interface Org {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  allowExternal: boolean;
  avatar: string | null;
  code?: string;
  createdAt: number;
  members: number;
  pending: number;
  channels: number;
  createdBy?: User | null;
}

export interface DirectoryUser extends User {
  online: boolean;
  lastSeen: number | null;
  isFriend: boolean;
  sameOrg: boolean;
}

export interface Message {
  id: number;
  channelId: number;
  userId: number | null;
  username: string;
  kind: 'audio' | 'text' | 'image' | 'location' | 'sos' | 'system';
  text: string | null;
  transcript: string | null;
  hasFile: boolean;
  durationMs: number | null;
  lat: number | null;
  lng: number | null;
  createdAt: number;
  channelName?: string;
}

export interface Channel {
  id: number;
  name: string;
  description: string;
  type: 'channel' | 'direct';
  visibility: 'public' | 'private' | 'org';
  emergency: boolean;
  avatar: string | null;
  orgId: number | null;
  orgName: string | null;
  isDefault: boolean;
  joinMode: 'join' | 'request' | null;
  requests: number;
  historyFrom: number; // 0 = เห็นประวัติทั้งหมด, >0 = เห็นตั้งแต่เวลาที่เข้าร่วม, -1 = ยังไม่ได้เข้าร่วม
  role: MemberRole | null;
  members: number;
  online: number;
  unread: number;
  lastMessage: Message | null;
  speaker: User | null;
  peer: User | null;
}

export interface ChannelMember extends User {
  memberRole: MemberRole;
  online: boolean;
}

export interface ChannelDetail {
  channel: Pick<Channel, 'id' | 'name' | 'description' | 'type' | 'visibility' | 'emergency' | 'avatar' | 'orgId' | 'orgName' | 'isDefault'> & { createdAt: number };
  canManage: boolean;
  canTalk: boolean;
  isOrgAdmin: boolean;
  inviteCode: string | null;
  requests: { id: number; createdAt: number; user: User }[];
  members: ChannelMember[];
}

export interface Location {
  userId: number;
  username: string;
  displayName: string;
  avatar: string | null;
  lat: number;
  lng: number;
  acc: number | null;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  charging: boolean | null;
  at: number;
}

export interface Alert {
  id: number;
  userId: number | null;
  username: string;
  channelId: number | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  createdAt: number;
  ackedBy: string | null;
  ackedAt: number | null;
  resolvedBy: string | null;
  resolvedAt: number | null;
}

export const isSuper = (u: User | Me | null) => !!u && u.role === 'superadmin';
// เจ้าหน้าที่ (ศูนย์สั่งการ/คลังข้อความ): superadmin หรือ admin/dispatcher ขององค์กรที่ใช้งานอยู่
export const isStaff = (u: Me | null) => !!u && u.staffScope != null;
export const isOrgAdmin = (u: Me | null) => !!u && (u.role === 'superadmin' || (u.org?.status === 'active' && u.org.memberStatus === 'active' && u.org.role === 'admin'));
export const inviteUrl = (code: string) => `${location.origin}/i/${code}`;
