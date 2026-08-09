'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { App } from 'antd';
import { useRouter, useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import type { User, DatabaseUser, LotteryWinnerResponse, RoomInfo, HistoryLotteryRecord } from '@/lib/types';
import ParticipantManager from '@/components/room/ParticipantManager';
import LotteryPanel from '@/components/room/LotteryPanel';
import WinnerResultModal from '@/components/room/WinnerResultModal';
export default function RoomPage() {
  const { modal, message } = App.useApp();
  const [isSpinning, setIsSpinning] = useState(false);
  const [databaseUsers, setDatabaseUsers] = useState<DatabaseUser[]>([]);
  const [currentWinners, setCurrentWinners] = useState<User[]>([]);
  const [allWinners, setAllWinners] = useState<User[]>([]);
  const [drawCount, setDrawCount] = useState<number>(1);
  const [preventDuplicateWinners, setPreventDuplicateWinners] = useState(true);
  const [prizeName, setPrizeName] = useState('');
  const [wheelCandidates, setWheelCandidates] = useState<{ key: string; name: string; department?: string }[]>([]);
  const [wheelWinners, setWheelWinners] = useState<{ key: string; name: string; department?: string }[]>([]);
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);
  // 用 ref 持有最新的刷新函数，避免 SSE 订阅因函数重建而反复重连
  const refreshAllDataRef = useRef<() => Promise<void>>(async () => {});
  const [winnerModalVisible, setWinnerModalVisible] = useState(false);
  const [modalWinners, setModalWinners] = useState<User[]>([]);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [generateUsersLoading, setGenerateUsersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastRoundRef = useRef<number>(0);
  // 每次抽奖递增，作为 Wheel 的 key 强制重新挂载，避免 React 复用组件导致 effect 不触发
  const [wheelKey, setWheelKey] = useState(0);

  // 获取或创建房间
  const fetchOrCreateRoom = useCallback(async () => {
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });

      if (response.ok) {
        const data = await response.json();
        setRoomInfo({
          name: data.room.name,
          total_users: data.room.total_users || 0,
          current_winners: data.room.current_winners || 0
        });
      }
    } catch (error) {
      console.error('Failed to fetch room:', error);
    }
  }, [roomId]);

  // 生成二维码URL
  useEffect(() => {
    if (typeof window !== 'undefined' && roomId) {
      const baseUrl = window.location.origin;
      setQrCodeUrl(`${baseUrl}/register?roomId=${roomId}`);
    }
  }, [roomId]);

  // 从数据库拉取该房间的中奖记录（权威数据源，跨页面/跨设备均可恢复）
  // allWinners = 全部历史中奖者，currentWinners = 最新一轮中奖者
  const fetchWinnersFromServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/history?roomId=${encodeURIComponent(roomId)}&recordType=lottery`);
      if (!res.ok) return;
      const data = await res.json();
      const records: HistoryLotteryRecord[] = data.lotteryRecords || [];
      if (records.length === 0) {
        setCurrentWinners([]);
        setAllWinners([]);
        return;
      }

      // 后端按 won_at DESC, round_number DESC 排序，这里翻转成时间正序便于展示历史累积
      const ordered = [...records].reverse();
      const mapped: User[] = ordered.map((r) => ({
        key: `${r.id}-round${r.round_number}`,
        name: r.winner_name,
        department: r.winner_department || '',
        prizeName: r.prize_name || undefined,
      }));

      // 最新一轮 = round_number 最大的那一批
      const maxRound = Math.max(...records.map((r) => r.round_number));
      const latest = ordered
        .filter((r) => r.round_number === maxRound)
        .map((r) => ({
          key: `${r.id}-round${r.round_number}`,
          name: r.winner_name,
          department: r.winner_department || '',
          prizeName: r.prize_name || undefined,
        }));

      setAllWinners(mapped);
      setCurrentWinners(latest);
      lastRoundRef.current = maxRound;
    } catch (error) {
      console.error('Failed to fetch winners from server:', error);
    }
  }, [roomId]);

  // 仅恢复本地偏好项（防重复中奖开关），中奖名单一律以数据库为准
  useEffect(() => {
    if (!roomId) return;
    try {
      const savedPreventDuplicate = localStorage.getItem(`preventDuplicateWinners_${roomId}`);
      if (savedPreventDuplicate !== null) {
        setPreventDuplicateWinners(JSON.parse(savedPreventDuplicate));
      }
    } catch (error) {
      console.error('Failed to restore preference from localStorage:', error);
    }
  }, [roomId]);

  // 初始化
  useEffect(() => {
    if (roomId) {
      fetchOrCreateRoom();
      fetchDatabaseUsers();
      fetchWinnersFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // 实时推送（SSE，取代 5 秒轮询）：订阅房间事件，有变更即刷新
  useEffect(() => {
    if (!roomId || !autoRefresh) return;

    const url = `/api/events?roomId=${encodeURIComponent(roomId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // 加入新报名、重置、新建房间 → 自动刷新
        // 注意：lottery_drawn 不在此刷新，因为当前房间自己抽奖时已有转盘动画，
        // SSE 并发刷新会打断 CSS transition 导致转盘卡死。
        if (
          ['users_updated', 'lottery_reset', 'room_created'].includes(
            data.type
          )
        ) {
          refreshAllDataRef.current();
        }
      } catch {
        // 忽略无法解析的消息
      }
    };
    // EventSource 断线会自动重连，无需额外处理

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [roomId, autoRefresh]);

  // 持久化"防重复中奖"偏好。
  // 注意：这里绝不能再写中奖名单——该 effect 在挂载时就会执行一次，
  // 那时 currentWinners/allWinners 还是初始空数组，会把已有记录清空。
  useEffect(() => {
    if (!roomId) return;
    try {
      localStorage.setItem(
        `preventDuplicateWinners_${roomId}`,
        JSON.stringify(preventDuplicateWinners)
      );
    } catch (error) {
      console.error('Failed to save preference:', error);
    }
  }, [preventDuplicateWinners, roomId]);

  // 获取数据库用户
  const fetchDatabaseUsers = useCallback(async () => {
    try {
      const response = await fetch(`/api/users?roomId=${roomId}`);
      if (response.ok) {
        const data = await response.json();
        setDatabaseUsers(data.users || []);
        setLastRefreshTime(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch database users:', error);
    }
  }, [roomId]);

  // 刷新所有数据
  const refreshAllData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchOrCreateRoom(),
        fetchDatabaseUsers(),
        fetchWinnersFromServer()
      ]);
      message.success('已刷新');
    } catch {
      message.error('刷新失败，请重试');
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrCreateRoom, fetchDatabaseUsers, fetchWinnersFromServer, message]);

  // 保持 ref 指向最新的 refreshAllData（组件每次渲染都会重建该函数）
  refreshAllDataRef.current = refreshAllData;

  // 切换自动刷新
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  const onAddUser = useCallback(async (values: { name: string; department?: string }) => {
    setAddUserLoading(true);
    try {
      const response = await fetch('/api/users/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          roomId: roomId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        modal.success({
          title: '添加成功',
          content: `用户 "${values.name}" 已添加到抽奖房间`
        });
        fetchDatabaseUsers();
        fetchOrCreateRoom();
      } else {
        modal.error({
          title: '添加失败',
          content: data.detail || '添加用户失败'
        });
      }
    } catch (error) {
      console.error('Add user error:', error);
      modal.error({
        title: '添加失败',
        content: '网络错误，请重试'
      });
    } finally {
      setAddUserLoading(false);
    }
  }, [roomId, modal, fetchDatabaseUsers, fetchOrCreateRoom]);

  const onGenerateUsers = useCallback(async (values: { count: number; startFrom?: number }) => {
    setGenerateUsersLoading(true);
    try {
      const response = await fetch('/api/users/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          roomId: roomId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        modal.success({
          title: '批量生成成功',
          content: `生成了 ${data.addedCount} 个序号用户${data.skippedCount > 0 ? `（跳过了 ${data.skippedCount} 个已存在的用户）` : ''}`
        });
        fetchDatabaseUsers();
        fetchOrCreateRoom();
      } else {
        modal.error({
          title: '生成失败',
          content: data.detail || '批量生成用户失败'
        });
      }
    } catch (error) {
      console.error('Generate users error:', error);
      modal.error({
        title: '生成失败',
        content: '网络错误，请重试'
      });
    } finally {
      setGenerateUsersLoading(false);
    }
  }, [roomId, modal, fetchDatabaseUsers, fetchOrCreateRoom]);

  const showDrawConfirm = () => {
    const currentUsers = databaseUsers.map(u => ({
      key: u.id.toString(),
      name: u.name,
      department: u.department || ''
    }));

    // 使用与 getCurrentAvailableCount 相同的逻辑计算可用人数
    const availableUsersCount = getCurrentAvailableCount();

    if (currentUsers.length === 0) {
      modal.warning({
        title: '提示',
        content: '当前房间还没有用户报名',
      });
      return;
    }

    if (availableUsersCount === 0) {
      modal.warning({
        title: '提示',
        content: '没有可参与抽奖的用户了',
      });
      return;
    }

    if (drawCount > availableUsersCount) {
      modal.warning({
        title: '提示',
        content: `当前只有 ${availableUsersCount} 人可以参与抽奖`,
      });
      return;
    }

    modal.confirm({
      title: '确认抽奖',
      content: (
        <div>
          <p>即将开始抽奖，请确认以下信息：</p>
          <ul style={{ marginLeft: 20, marginTop: 16 }}>
            <li>本次抽取人数：{drawCount} 人</li>
            <li>当前可参与人数：{availableUsersCount} 人</li>
            <li>重复中奖：{preventDuplicateWinners ? '禁止' : '允许'}</li>
            {prizeName && <li>奖品名称：{prizeName}</li>}
          </ul>
        </div>
      ),
      onOk: drawPrize,
      okText: '开始抽奖',
      cancelText: '取消',
      width: 500,
    });
  };

  const fireConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 }
      });
    }, 300);
  };

  const drawPrize = async () => {
    // 先标记"正在抽奖"（显示 loading），等 API 返回后再设置转盘数据启动动画
    setIsSpinning(true);

    try {
      const response = await fetch('/api/lottery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count: drawCount,
          roomId: roomId,
          prizeName: prizeName || undefined,
          preventDuplicateWinners: preventDuplicateWinners
        }),
      });

      if (response.ok) {
        const data = await response.json();
        lastRoundRef.current = data.roundNumber;
        const winners = data.winners.map((w: LotteryWinnerResponse) => ({
          key: w.id.toString(),
          name: w.name,
          department: w.department || ''
        }));
        // 先设置转盘数据（此时 Wheel 才会挂载），再清除 loading 态
        // 注意：candidates 用当前数据库用户快照，避免 stale closure
        setWheelCandidates(
          databaseUsers.map((u) => ({ key: String(u.id), name: u.name, department: u.department || '' }))
        );
        setWheelWinners(winners);
        setWheelKey((prev) => prev + 1);
      } else {
        const errorData = await response.json();
        modal.error({
          title: '抽奖失败',
          content: errorData.detail || '服务器错误'
        });
        setIsSpinning(false);
      }
    } catch (error) {
      console.error('Draw error:', error);
      modal.error({
        title: '抽奖失败',
        content: '网络错误，请重试'
      });
      setIsSpinning(false);
    }
  };

  // 保存到本地历史记录（辅助展示用，非权威数据源；权威源始终是 lottery_winners 表）
  // 必须定义在 handleWheelComplete 之前：后者的依赖数组引用了它，函数声明顺序颠倒会触发 TDZ。
  const saveToLocalHistory = useCallback((winners: User[], roundNumber: number) => {
    try {
      const existingRecords = JSON.parse(localStorage.getItem('lotteryRecords') || '[]');
      const newRecord = {
        id: `${roomId}-${roundNumber}-${Date.now()}`,
        timestamp: Date.now(),
        drawCount: winners.length,
        winners: winners,
        roomId: roomId,
        roomName: roomInfo?.name || `房间 ${roomId}`,
        roundNumber: roundNumber,
      };

      const updatedRecords = [newRecord, ...existingRecords].slice(0, 100); // 保留最近100条记录
      localStorage.setItem('lotteryRecords', JSON.stringify(updatedRecords));
    } catch (error) {
      console.error('Failed to save to local history:', error);
    }
  }, [roomId, roomInfo]);

  // 大转盘转完所有中奖者后的收尾：更新名单、撒花、存档
  // 注意：不在此刷新数据，改由结果弹窗关闭后统一刷新，避免 SSE 并发打断动画
  const handleWheelComplete = useCallback(() => {
    const round = lastRoundRef.current;
    const winners = wheelWinners;
    const winnersWithUniqueKeys = winners.map((winner, index) => ({
      key: `${winner.key}-round${round}-${index}`,
      name: winner.name,
      department: winner.department || '',
      prizeName: prizeName || undefined
    }));
    const newAllWinners = [...allWinners, ...winnersWithUniqueKeys];

    setCurrentWinners(winnersWithUniqueKeys);
    setAllWinners(newAllWinners);
    setModalWinners(winnersWithUniqueKeys);
    setWinnerModalVisible(true);
    fireConfetti();
    setIsSpinning(false);
    setWheelCandidates([]);
    setWheelWinners([]);

    saveToLocalHistory(winnersWithUniqueKeys, round);
  }, [wheelWinners, allWinners, prizeName, saveToLocalHistory]);

  const resetDatabaseUsers = useCallback(() => {
    modal.confirm({
      title: '确认重置',
      content: '确定要重置该房间所有用户的参与状态吗？重置后所有用户都可以重新参与抽奖。',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await fetch('/api/lottery', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: roomId }),
          });

          if (response.ok) {
            modal.success({
              title: '重置成功',
              content: '所有用户的参与状态已重置'
            });
            fetchDatabaseUsers();
            setCurrentWinners([]);
            setAllWinners([]);
            lastRoundRef.current = 0;
          } else {
            modal.error({
              title: '重置失败',
              content: '服务器错误，请重试'
            });
          }
        } catch (error) {
          console.error('Reset error:', error);
          modal.error({
            title: '重置失败',
            content: '网络错误，请重试'
          });
        }
      },
    });
  }, [roomId, modal, fetchDatabaseUsers]);

  const getCurrentAvailableCount = () => {
    // 基于数据库用户数据计算可参与人数
    if (preventDuplicateWinners) {
      // 如果启用了防重复中奖，则返回未中奖的用户数
      return databaseUsers.filter(user => !user.participated).length;
    } else {
      // 如果允许重复中奖，则返回所有用户数
      return databaseUsers.length;
    }
  };

  // 清空中奖记录：必须同时清库，否则刷新后记录会从数据库"复活"
  const clearWinners = useCallback(() => {
    modal.confirm({
      title: '确认清空',
      content: '确定要清空该房间所有中奖记录吗？该操作会同时重置所有用户的参与状态，且不可恢复。',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          const response = await fetch('/api/lottery', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: roomId }),
          });

          if (response.ok) {
            setCurrentWinners([]);
            setAllWinners([]);
            lastRoundRef.current = 0;
            fetchDatabaseUsers();
            fetchOrCreateRoom();
          } else {
            modal.error({ title: '清空失败', content: '服务器错误，请重试' });
          }
        } catch (error) {
          console.error('Clear winners error:', error);
          modal.error({ title: '清空失败', content: '网络错误，请重试' });
        }
      },
    });
  }, [roomId, modal, fetchDatabaseUsers, fetchOrCreateRoom]);

  return (
    <main style={{ padding: '24px', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <div style={{ display: 'flex', gap: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ flex: 1 }}>
          <ParticipantManager
            roomId={roomId}
            roomInfo={roomInfo}
            qrCodeUrl={qrCodeUrl}
            databaseUsers={databaseUsers}
            autoRefresh={autoRefresh}
            lastRefreshTime={lastRefreshTime}
            addUserLoading={addUserLoading}
            generateUsersLoading={generateUsersLoading}
            refreshing={refreshing}
            onAddUser={onAddUser}
            onGenerateUsers={onGenerateUsers}
            onReset={resetDatabaseUsers}
            onRefresh={refreshAllData}
            onToggleAutoRefresh={toggleAutoRefresh}
            onOpenHistory={() => router.push(`/history?roomId=${roomId}`)}
          />
        </div>

        <div style={{ flex: 1 }}>
          <LotteryPanel
            drawCount={drawCount}
            setDrawCount={setDrawCount}
            preventDuplicateWinners={preventDuplicateWinners}
            setPreventDuplicateWinners={setPreventDuplicateWinners}
            prizeName={prizeName}
            setPrizeName={setPrizeName}
            isSpinning={isSpinning}
            wheelCandidates={wheelCandidates}
            wheelWinners={wheelWinners}
            onWheelComplete={handleWheelComplete}
            wheelKey={wheelKey}
            availableCount={getCurrentAvailableCount()}
            currentWinners={currentWinners}
            allWinners={allWinners}
            onDraw={showDrawConfirm}
            onClearWinners={clearWinners}
          />
        </div>
      </div>

      {/* 中奖结果弹窗 */}
      <WinnerResultModal
        open={winnerModalVisible}
        winners={modalWinners}
        onClose={() => setWinnerModalVisible(false)}
        onAfterClose={() => {
          fetchDatabaseUsers();
          fetchOrCreateRoom();
          fetchWinnersFromServer();
        }}
      />

    </main>
  );
}
