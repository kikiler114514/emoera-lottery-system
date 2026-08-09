'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

interface UserInfo {
  authenticated: boolean;
  user_id: string;
  user_name: string;
}

interface AuthContextType {
  user: UserInfo;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: { authenticated: false, user_id: '', user_name: '' },
  loading: true,
  login: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo>({
    authenticated: false,
    user_id: '',
    user_name: '',
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/login');
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '登录失败' }));
        throw new Error(err.detail || '登录失败');
      }
      const data = await res.json();
      // 跳转到通行证授权页
      window.location.href = data.authorization_url;
    } catch (e: unknown) {
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser({ authenticated: false, user_id: '', user_name: '' });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}