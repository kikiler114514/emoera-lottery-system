'use client';

import { App, ConfigProvider } from 'antd';
import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          borderRadius: 6,
        },
      }}
    >
      <App>
        <AuthProvider>
          {children}
        </AuthProvider>
      </App>
    </ConfigProvider>
  );
} 