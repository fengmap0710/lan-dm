import { createContext, useContext } from 'react';
import type { IApiUser } from '@/lib/api';

export interface IAuthContextValue {
  user: IApiUser | null;
  ready: boolean;
  isLoggedIn: boolean;
  isAdmin: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const AuthContext = createContext<IAuthContextValue | null>(null);

export function useAuth(): IAuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
