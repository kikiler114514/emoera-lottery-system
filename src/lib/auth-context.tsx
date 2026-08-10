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
        return data;
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  // 本地模式自动登录：PASSPORT_ENABLED=false 时，POST /api/auth/login 会直接签发 cookie
  const autoLocalLogin = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.local) {
        // 本地登录成功，刷新用户信息
        await refresh();
        return true;
      }
      // 生产模式：返回了 authorization_url，不需要自动跳（让用户手动点登录）
      return false;
    } catch {
      return false;
    }
  }, [refresh]);

  useEffect(() => {
    // 首次加载：先尝试 refresh，如果未登录则自动尝试本地登录
    refresh().then((data) => {
      if (data && !data.authenticated) {
        autoLocalLogin();
      }
    });
  }, [refresh, autoLocalLogin]);

  const login = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: '登录失败' }));
        throw new Error(err.detail || '登录失败');
      }
      const data = await res.json();
      // 本地模式（PASSPORT_ENABLED=false）：已直接签发 cookie，刷新即可生效
      if (data.local) {
        await refresh();
        return;
      }
      // 生产模式：跳转到通行证授权页
      window.location.href = data.authorization_url;
    } catch (e: unknown) {
      throw e;
    }
  }, [refresh]);

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