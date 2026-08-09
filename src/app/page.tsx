'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { generateRoomId, saveRoomCreationRecord, type LocalCreatedRoom } from '@/lib/room-utils';

// 获取最近创建的房间
function getLatestRoom(): string | null {
  try {
    const existingRooms: LocalCreatedRoom[] = JSON.parse(localStorage.getItem('myCreatedRooms') || '[]');
    if (existingRooms.length > 0) {
      const sortedRooms = existingRooms.sort((a, b) => b.createdAt - a.createdAt);
      return sortedRooms[0].roomId;
    }
    return null;
  } catch (error) {
    console.error('Failed to get latest room:', error);
    return null;
  }
}

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // 检查是否有已创建的房间
    const latestRoomId = getLatestRoom();
    
    if (latestRoomId) {
      // 如果有房间，进入最近创建的房间
      router.replace(`/room/${latestRoomId}`);
    } else {
      // 如果没有房间，创建新房间
      const newRoomId = generateRoomId();
      
      // 记录房间创建
      saveRoomCreationRecord(newRoomId);
      
      router.replace(`/room/${newRoomId}`);
    }
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
      <p style={{ marginTop: 16 }}>正在进入抽奖房间...</p>
    </div>
  );
}
