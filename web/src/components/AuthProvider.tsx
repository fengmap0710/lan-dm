import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, clearSession, setSession, type IApiUser } from '@/lib/api';
import { AuthContext, type IAuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<IApiUser | null>(null);
  const [ready, setReady] = useState(false);

  // 启动时校验本地 token 是否仍有效（会话恢复）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasToken = !!sessionStorage.getItem('lan-dm-token');
      if (!hasToken) {
        if (!cancelled) setReady(true);
        return;
      }
      try {
        const res = await api.me();
        if (cancelled) return;
        setUser(res.user);
      } catch {
        if (cancelled) return;
        clearSession();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await api.login(username, password);
      setSession(res.token, res.user);
      setUser(res.user);
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value: IAuthContextValue = {
    user,
    ready,
    isLoggedIn: !!user,
    isAdmin: user?.role === 'admin',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
