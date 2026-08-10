'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spin, message } from 'antd';
import { generateRoomId, saveRoomCreationRecord, getCreatedRooms, removeRoomCreationRecord, type LocalCreatedRoom } from '@/lib/room-utils';

// 获取最近一个"有效"的房间：验证房间在后端存在
async function findValidRoom(): Promise<string | null> {
  try {
    const existingRooms: LocalCreatedRoom[] = getCreatedRooms();
    for (const r of existingRooms) {
      try {
        const res = await fetch(`/api/rooms/${r.roomId}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.room) return r.roomId;
        }
      } catch { /* ignore, try next */ }
      // 房间不存在，清理本地记录
      removeRoomCreationRecord(r.roomId);
    }
  } catch (error) {
    console.error('Failed to validate rooms:', error);
  }
  return null;
}

export default function HomePage() {
  const router = useRouter();
  const [status, setStatus] = useState('正在加载...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. 尝试找一个有效的旧房间
      setStatus('正在检查最近房间...');
      const validRoom = await findValidRoom();
      if (cancelled) return;
      if (validRoom) {
        router.replace(`/room/${validRoom}`);
        return;
      }

      // 2. 没有有效房间，创建新房间（后端要求登录；本地模式下 auth-context 会自动登录）
      setStatus('正在创建新房间...');
      const newRoomId = generateRoomId();

      // 等待一下让 auth-context 完成自动登录（本地模式）
      const tryCreate = async (attempt = 0): Promise<boolean> => {
        if (cancelled) return false;
        try {
          const res = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: newRoomId }),
          });
          if (res.ok) {
            saveRoomCreationRecord(newRoomId);
            router.replace(`/room/${newRoomId}`);
            return true;
          }
          if (res.status === 401 && attempt < 5) {
            // 等待登录完成，500ms 后重试
            await new Promise((r) => setTimeout(r, 600));
            return tryCreate(attempt + 1);
          }
          if (res.status === 403) {
            const err = await res.json().catch(() => ({}));
            message.warning(err.detail || '已达房间数上限，请先删除旧房间');
            return false;
          }
        } catch (e) {
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 500));
            return tryCreate(attempt + 1);
          }
        }
        return false;
      };

      const ok = await tryCreate();
      if (!ok && !cancelled) {
        setStatus('创建房间失败，请点击右上角登录后重试，或刷新页面');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column'
    }}>
      <Spin size="large" />
      <p style={{ marginTop: 16 }}>{status}</p>
    </div>
  );
}
