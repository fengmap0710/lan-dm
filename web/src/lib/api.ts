// API 客户端：统一 fetch 封装 + Bearer token 管理
// 生产同源 /api（nginx 反代到后端容器）；开发由 vite proxy 转发到 localhost:3001
const TOKEN_KEY = 'lan-dm-token';
const USER_KEY = 'lan-dm-user';

export interface IApiUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface ITrafficRecord {
  id: string;
  ip: string;
  mac?: string;
  owner?: string;
  category: TrafficCategory;
  label?: string;
  bytesDown: number;
  bytesUp: number;
  durationSec: number;
  recordedAt: string;
  source: 'manual' | 'import' | 'snapshot';
}

export type TrafficCategory = 'office' | 'download' | 'video' | 'game' | 'other';

export const TRAFFIC_CATEGORY_META: Record<TrafficCategory, { label: string; color: string }> = {
  office: { label: '办公/工作', color: 'hsl(221 83% 53%)' },
  download: { label: '下载', color: 'hsl(142 71% 45%)' },
  video: { label: '在线视频', color: 'hsl(262 83% 58%)' },
  game: { label: '游戏', color: 'hsl(16 91% 55%)' },
  other: { label: '其他', color: 'hsl(215 16% 47%)' },
};

export interface TrafficStats {
  total: { records: number; bytesDown: number; bytesUp: number; durationSec: number };
  byIp: Array<{ ip: string; mac?: string; owner?: string; bytesDown: number; bytesUp: number; durationSec: number; count: number }>;
  byCategory: Array<{ category: TrafficCategory; bytesDown: number; count: number }>;
  byDay: Array<{ day: string; bytesDown: number; bytesUp: number; durationSec: number }>;
}

export interface RouterDeviceStat {
  addr: string;
  tx_bps: number;
  rx_bps: number;
  tx_pps: number;
  rx_pps: number;
  tx_bytes: number;
  rx_bytes: number;
  tx_pkts: number;
  rx_pkts: number;
}

export interface RouterSnapshot {
  ts: number;
  receivedAt: string;
  count: number;
  devices: RouterDeviceStat[];
  /** NAS 内网探测时间（秒），在线状态由探测兜底时更新 */
  probeAt?: number;
  probeOnline?: number;
}

export function getToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function getStoredUser(): IApiUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as IApiUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: IApiUser): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // 隐私模式静默降级
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    // noop
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    clearSession();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('未登录或登录已过期');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `请求失败(${res.status})`);
  }
  return data as T;
}

export const api = {
  // 认证
  authStatus: () => request<{ initialized: boolean }>('GET', '/auth/status'),
  init: (username: string, password: string) =>
    request<{ token: string; user: IApiUser }>('POST', '/auth/init', { username, password }),
  login: (username: string, password: string) =>
    request<{ token: string; user: IApiUser }>('POST', '/auth/login', { username, password }),
  me: () => request<{ user: IApiUser }>('GET', '/auth/me'),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('PUT', '/auth/password', { oldPassword, newPassword }),
  // 用户管理（admin）
  users: {
    list: () => request<{ users: IApiUser[] }>('GET', '/users'),
    create: (username: string, password: string, role: 'admin' | 'user') =>
      request<{ user: IApiUser }>('POST', '/users', { username, password, role }),
    update: (id: string, patch: { username?: string; password?: string; role?: 'admin' | 'user' }) =>
      request<{ user: IApiUser }>('PUT', `/users/${id}`, patch),
    remove: (id: string) => request<{ ok: boolean }>('DELETE', `/users/${id}`),
  },
  // 资源 CRUD
  devices: {
    list: () => request<{ items: unknown[] }>('GET', '/devices'),
    create: (item: Record<string, unknown>) => request<{ item: Record<string, unknown> }>('POST', '/devices', item),
    update: (id: string, patch: Record<string, unknown>) =>
      request<{ item: Record<string, unknown> }>('PUT', `/devices/${id}`, patch),
    remove: (id: string) => request<{ ok: boolean }>('DELETE', `/devices/${id}`),
    batch: (ids: string[], patch: Record<string, unknown>) =>
      request<{ ok: boolean; updated: number }>('POST', '/devices/batch', { ids, patch }),
  },
  rules: {
    list: () => request<{ items: unknown[] }>('GET', '/rules'),
    create: (item: Record<string, unknown>) => request<{ item: Record<string, unknown> }>('POST', '/rules', item),
    update: (id: string, patch: Record<string, unknown>) =>
      request<{ item: Record<string, unknown> }>('PUT', `/rules/${id}`, patch),
    remove: (id: string) => request<{ ok: boolean }>('DELETE', `/rules/${id}`),
  },
  policies: {
    list: () => request<{ items: unknown[] }>('GET', '/policies'),
    create: (item: Record<string, unknown>) => request<{ item: Record<string, unknown> }>('POST', '/policies', item),
    update: (id: string, patch: Record<string, unknown>) =>
      request<{ item: Record<string, unknown> }>('PUT', `/policies/${id}`, patch),
    remove: (id: string) => request<{ ok: boolean }>('DELETE', `/policies/${id}`),
  },
  // 路由器凭据（admin）
  routerCredential: {
    get: () => request<{ credential: { url: string; username: string; password: string; updatedAt: string } | null }>('GET', '/router-credential'),
    put: (credential: { url: string; username: string; password: string }) =>
      request<{ credential: { url: string; username: string; password: string; updatedAt: string } }>('PUT', '/router-credential', credential),
  },
  // 流量记录
  traffic: {
    list: (query?: Record<string, string>) => {
      const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
      return request<{ items: ITrafficRecord[] }>('GET', `/traffic${qs}`);
    },
    create: (item: Partial<ITrafficRecord>) => request<{ item: ITrafficRecord }>('POST', '/traffic', item),
    importItems: (items: Array<Record<string, unknown>>) =>
      request<{ added: number }>('POST', '/traffic/import', { items }),
    remove: (id: string) => request<{ ok: boolean }>('DELETE', `/traffic/${id}`),
    stats: (range?: 'day' | 'week' | 'month' | 'all') =>
      request<TrafficStats>('GET', `/traffic/stats${range && range !== 'all' ? `?range=${range}` : ''}`),
  },
  // 路由器实时快照
  routerRealtime: {
    get: () =>
      request<{ snapshot: RouterSnapshot | null; history: RouterSnapshot[] }>('GET', '/router/realtime'),
  },
  // 即时抓取（点击刷新 → NAS 采集器立即抓一次路由器）
  collect: {
    trigger: () => request<{ ok: boolean; triggeredAt: number }>('POST', '/collect/trigger'),
    // 抓取总开关
    status: () => request<{ ok: boolean; enabled: boolean; resetAt?: string | null }>('GET', '/collect/status'),
    toggle: (enabled: boolean) => request<{ ok: boolean; enabled: boolean }>('POST', '/collect/toggle', { enabled }),
    // 重置：清空设备台账与流量数据重新开始（同时自动停止抓取）
    reset: () => request<{ ok: boolean; resetAt: string; enabled: boolean }>('POST', '/collect/reset'),
  },
  // 消息下发
  messages: {
    send: (payload: { content: string; mode?: 'all' | 'custom'; ips?: string[] }) =>
      request<{ ok: boolean; message: unknown }>('POST', '/message/send', payload),
    list: () => request<{ items: unknown[] }>('GET', '/messages'),
  },
};
