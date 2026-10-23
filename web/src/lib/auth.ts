// 认证状态：token + 当前用户（后端校验）。兼容旧调用点函数名。
import { api, clearSession, getStoredUser, getToken, setSession, type IApiUser } from '@/lib/api';

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function getUsername(): string {
  return getStoredUser()?.username || '';
}

export function getRole(): 'admin' | 'user' | '' {
  return getStoredUser()?.role || '';
}

export function logout(): void {
  clearSession();
}

export async function login(username: string, password: string): Promise<boolean> {
  try {
    const res = await api.login(username, password);
    setSession(res.token, res.user);
    return true;
  } catch {
    return false;
  }
}

export async function fetchMe(): Promise<IApiUser | null> {
  try {
    const res = await api.me();
    return res.user;
  } catch {
    return null;
  }
}
