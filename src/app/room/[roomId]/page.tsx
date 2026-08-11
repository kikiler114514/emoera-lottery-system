'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { App, Button } from 'antd';
import { useRouter, useParams } from 'next/navigation';
import confetti from 'canvas-confetti';
import type { User, DatabaseUser, LotteryWinnerResponse, RoomInfo, HistoryLotteryRecord } from '@/lib/types';
import ParticipantManager from '@/components/room/ParticipantManager';
import LotteryPanel from '@/components/room/LotteryPanel';
import WinnerResultModal from '@/components/room/WinnerResultModal';
import { useAuth } from '@/lib/auth-context';

export default function RoomPage() {
  const { modal, message } = App.useApp();
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;

  const [isSpinning, setIsSpinning] = useState(false);
  const [databaseUsers, setDatabaseUsers] = useState<DatabaseUser[]>([]);
  const [currentWinners, setCurrentWinners] = useState<User[]>([]);
  const [allWinners, setAllWinners] = useState<User[]>([]);
  const [drawCount, setDrawCount] = useState<number>(1);
  const [preventDuplicateWinners, setPreventDuplicateWinners] = useState(true);
  const [prizeName, setPrizeName] = useState('');
  const [wheelCandidates, setWheelCandidates] = useState<{ key: string; name: string; department?: string }[]>([]);
  const [wheelWinners, setWheelWinners] = useState<{ key: string; name: string; department?: string }[]>([]);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [roomCreatorId, setRoomCreatorId] = useState('');
  const [roomCreatorName, setRoomCreatorName] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const refreshAllDataRef = useRef<() => Promise<void>>(async () => {});
  const [winnerModalVisible, setWinnerModalVisible] = useState(false);
  const [modalWinners, setModalWinners] = useState<User[]>([]);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [generateUsersLoading, setGenerateUsersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastRoundRef = useRef<number>(0);
  // 远端 SSE 推过来的奖品名称：非创建者的浏览器收到 lottery_drawn 时，本地
  // 自己可能没填奖品，需要用服务端给的奖品名才能在转盘结束弹窗里正确显示。
  const remotePrizeNameRef = useRef<string>('');
  const [wheelKey, setWheelKey] = useState(0);
  const [remoteWheelKey, setRemoteWheelKey] = useState(0);

  const [roomError, setRoomError] = useState<string>('');

  const isOwner = user.authenticated && user.user_id === roomCreatorId;

  const fetchOrCreateRoom = useCallback(async () => {
    try {
      setRoomError('');
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
          current_winners: data.room.current_winners || 0,
        });
        setRoomCreatorId(data.room.creator_id || '');
        setRoomCreatorName(data.room.creator_name || '');
      } else {
        const err = await response.json().catch(() => ({ detail: '获取房间失败' }));
        // 401 未登录：本地模式下 auth-context 会自动登录，等待重试；生产模式提示用户登录
        if (response.status === 401) {
          setRoomError('请先登录后使用（本地模式正在自动登录，如持续显示请点右上角登录按钮）');
        } else if (response.status === 403) {
          setRoomError(err.detail || '没有权限创建房间');
        } else {
          setRoomError(err.detail || `房间错误 (${response.status})`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch room:', error);
      setRoomError('网络错误，请刷新重试');
    }
  }, [roomId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && roomId) {
      setQrCodeUrl(`${window.location.origin}/register?roomId=${roomId}`);
    }
  }, [roomId]);

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
      const ordered = [...records].reverse();
      const mapped: User[] = ordered.map((r) => ({
        key: `${r.id}-round${r.round_number}`,
        name: r.winner_name,
        department: r.winner_department || '',
        prizeName: r.prize_name || undefined,
      }));
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
      console.error('Failed to fetch winners:', error);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    try {
      const saved = localStorage.getItem(`preventDuplicateWinners_${roomId}`);
      if (saved !== null) setPreventDuplicateWinners(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [roomId]);

  useEffect(() => {
    if (roomId) {
      fetchOrCreateRoom();
      fetchDatabaseUsers();
      fetchWinnersFromServer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // 用户登录状态变化时（比如本地自动登录完成）重新获取房间信息
  useEffect(() => {
    if (roomId && user.authenticated && !roomCreatorId) {
      fetchOrCreateRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.authenticated, roomId]);

  // SSE
  useEffect(() => {
    if (!roomId || !autoRefresh) return;
    const url = `/api/events?roomId=${encodeURIComponent(roomId)}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (['users_updated', 'lottery_reset', 'room_created'].includes(data.type)) {
          refreshAllDataRef.current();
        }
        if (data.type === 'lottery_drawn' && !isOwner) {
          const candidates = (data.candidates || []).map((c: Record<string, unknown>) => ({
            key: String(c.id), name: String(c.name), department: String(c.department || ''),
          }));
          const winners = (data.winners || []).map((w: Record<string, unknown>) => ({
            key: String(w.id), name: String(w.name), department: String(w.department || ''),
          }));
          if (candidates.length > 0 && winners.length > 0) {
            // 同步远端的 roundNumber / prizeName，否则转盘结束会用旧值导致
            // 历史中奖名单关联错乱、奖品名变成本地自己填的（可能为空）。
            const r = Number(data.roundNumber);
            if (Number.isFinite(r) && r > 0) lastRoundRef.current = r;
            if (typeof data.prizeName === 'string') remotePrizeNameRef.current = data.prizeName;
            setIsSpinning(true);
            setWheelCandidates(candidates);
            setWheelWinners(winners);
            setRemoteWheelKey((prev) => prev + 1);
          }
        }
      } catch { /* ignore */ }
    };
    return () => { es.close(); esRef.current = null; };
  }, [roomId, autoRefresh, isOwner]);

  useEffect(() => {
    if (!roomId) return;
    try {
      localStorage.setItem(`preventDuplicateWinners_${roomId}`, JSON.stringify(preventDuplicateWinners));
    } catch { /* ignore */ }
  }, [preventDuplicateWinners, roomId]);

  const fetchDatabaseUsers = useCallback(async () => {
    try {
      const response = await fetch(`/api/users?roomId=${roomId}`);
      if (response.ok) {
        const data = await response.json();
        setDatabaseUsers(data.users || []);
        setLastRefreshTime(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  }, [roomId]);

  const refreshAllData = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchOrCreateRoom(), fetchDatabaseUsers(), fetchWinnersFromServer()]);
      message.success('已刷新');
    } catch {
      message.error('刷新失败，请重试');
    } finally {
      setRefreshing(false);
    }
  }, [fetchOrCreateRoom, fetchDatabaseUsers, fetchWinnersFromServer, message]);
  refreshAllDataRef.current = refreshAllData;

  const toggleAutoRefresh = useCallback(() => setAutoRefresh((prev) => !prev), []);

  const onAddUser = useCallback(async (values: { name: string; department?: string }) => {
    setAddUserLoading(true);
    try {
      const res = await fetch('/api/users/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, roomId }),
      });
      const data = await res.json();
      if (res.ok) {
        modal.success({ title: '添加成功', content: `用户 "${values.name}" 已添加到抽奖房间` });
        fetchDatabaseUsers();
        fetchOrCreateRoom();
      } else {
        modal.error({ title: '添加失败', content: data.detail || '添加用户失败' });
      }
    } catch {
      modal.error({ title: '添加失败', content: '网络错误，请重试' });
    } finally {
      setAddUserLoading(false);
    }
  }, [roomId, modal, fetchDatabaseUsers, fetchOrCreateRoom]);

  const onGenerateUsers = useCallback(async (values: { count: number; startFrom?: number }) => {
    setGenerateUsersLoading(true);
    try {
      const res = await fetch('/api/users/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, roomId }),
      });
      const data = await res.json();
      if (res.ok) {
        modal.success({
          title: '批量生成成功',
          content: `生成了 ${data.addedCount} 个序号用户${data.skippedCount > 0 ? `（跳过了 ${data.skippedCount} 个已存在的用户）` : ''}`,
        });
        fetchDatabaseUsers();
        fetchOrCreateRoom();
      } else {
        modal.error({ title: '生成失败', content: data.detail || '批量生成用户失败' });
      }
    } catch {
      modal.error({ title: '生成失败', content: '网络错误，请重试' });
    } finally {
      setGenerateUsersLoading(false);
    }
  }, [roomId, modal, fetchDatabaseUsers, fetchOrCreateRoom]);

  const getCurrentAvailableCount = () => {
    if (preventDuplicateWinners) return databaseUsers.filter((u) => !u.participated).length;
    return databaseUsers.length;
  };

  const showDrawConfirm = () => {
    const availableUsersCount = getCurrentAvailableCount();
    if (databaseUsers.length === 0) {
      modal.warning({ title: '提示', content: '当前房间还没有用户报名' });
      return;
    }
    if (availableUsersCount === 0) {
      modal.warning({ title: '提示', content: '没有可参与抽奖的用户了' });
      return;
    }
    if (drawCount > availableUsersCount) {
      modal.warning({ title: '提示', content: `当前只有 ${availableUsersCount} 人可以参与抽奖` });
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
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } }), 300);
  };

  const drawPrize = async () => {
    setIsSpinning(true);
    try {
      const response = await fetch('/api/lottery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: drawCount, roomId, prizeName: prizeName || undefined, preventDuplicateWinners }),
      });
      if (response.ok) {
        const data = await response.json();
        lastRoundRef.current = data.roundNumber;
        const winners = data.winners.map((w: LotteryWinnerResponse) => ({
          key: w.id.toString(), name: w.name, department: w.department || '',
        }));
        setWheelCandidates(databaseUsers.map((u) => ({ key: String(u.id), name: u.name, department: u.department || '' })));
        setWheelWinners(winners);
        setWheelKey((prev) => prev + 1);
      } else {
        const errorData = await response.json();
        modal.error({ title: '抽奖失败', content: errorData.detail || '服务器错误' });
        setIsSpinning(false);
      }
    } catch {
      modal.error({ title: '抽奖失败', content: '网络错误，请重试' });
      setIsSpinning(false);
    }
  };

  const saveToLocalHistory = useCallback((winners: User[], roundNumber: number) => {
    try {
      const existingRecords = JSON.parse(localStorage.getItem('lotteryRecords') || '[]');
      const newRecord = {
        id: `${roomId}-${roundNumber}-${Date.now()}`, timestamp: Date.now(), drawCount: winners.length,
        winners, roomId, roomName: roomInfo?.name || `房间 ${roomId}`, roundNumber,
      };
      localStorage.setItem('lotteryRecords', JSON.stringify([newRecord, ...existingRecords].slice(0, 100)));
    } catch { /* ignore */ }
  }, [roomId, roomInfo]);

  const handleWheelComplete = useCallback(() => {
    const round = lastRoundRef.current;
    const winners = wheelWinners;
    // 创建者侧用本地填写的奖品名；非创建者通过 SSE 收到的轮次/奖品来自 ref。
    // 这避免远端观众看到的中奖记录轮次对不上、奖品名变成空串。
    const effectivePrizeName = prizeName || remotePrizeNameRef.current || undefined;
    const winnersWithUniqueKeys = winners.map((winner, index) => ({
      key: `${winner.key}-round${round}-${index}`,
      name: winner.name, department: winner.department || '', prizeName: effectivePrizeName,
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
    remotePrizeNameRef.current = '';
    saveToLocalHistory(winnersWithUniqueKeys, round);
  }, [wheelWinners, allWinners, prizeName, saveToLocalHistory]);

  const resetDatabaseUsers = useCallback(() => {
    modal.confirm({
      title: '确认重置', content: '确定要重置该房间所有用户的参与状态吗？',
      okText: '确定', cancelText: '取消',
      onOk: async () => {
        try {
          const res = await fetch('/api/lottery', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId }),
          });
          if (res.ok) {
            modal.success({ title: '重置成功', content: '所有用户的参与状态已重置' });
            fetchDatabaseUsers(); setCurrentWinners([]); setAllWinners([]); lastRoundRef.current = 0;
          } else modal.error({ title: '重置失败', content: '服务器错误，请重试' });
        } catch { modal.error({ title: '重置失败', content: '网络错误，请重试' }); }
      },
    });
  }, [roomId, modal, fetchDatabaseUsers]);

  const clearWinners = useCallback(() => {
    modal.confirm({
      title: '确认清空', content: '确定要清空所有中奖记录吗？不可恢复。',
      okText: '确定', cancelText: '取消',
      onOk: async () => {
        try {
          const res = await fetch('/api/lottery', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId }),
          });
          if (res.ok) {
            setCurrentWinners([]); setAllWinners([]); lastRoundRef.current = 0;
            fetchDatabaseUsers(); fetchOrCreateRoom();
          } else modal.error({ title: '清空失败', content: '服务器错误，请重试' });
        } catch { modal.error({ title: '清空失败', content: '网络错误，请重试' }); }
      },
    });
  }, [roomId, modal, fetchDatabaseUsers, fetchOrCreateRoom]);

  const effectiveWheelKey = wheelKey + remoteWheelKey;

  return (
    <main style={{ padding: '24px', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {roomError && (
        <div style={{
          maxWidth: '1400px', margin: '0 auto 16px', padding: '12px 16px',
          background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, color: '#cf1322',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>⚠️ {roomError}</span>
          {roomError.includes('限额') || roomError.includes('最多') ? (
            <Button size="small" type="primary" danger onClick={() => router.push('/')}>
              返回首页
            </Button>
          ) : null}
        </div>
      )}
      {roomCreatorName && (
        <div style={{ maxWidth: '1400px', margin: '0 auto 12px', color: '#888', fontSize: 13 }}>
          创建者：<strong style={{ color: '#1890ff' }}>{roomCreatorName}</strong>
          {isOwner && <span style={{ marginLeft: 8, color: '#52c41a' }}>（你）</span>}
        </div>
      )}
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
            isOwner={isOwner}
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
            wheelKey={effectiveWheelKey}
            availableCount={getCurrentAvailableCount()}
            currentWinners={currentWinners}
            allWinners={allWinners}
            isOwner={isOwner}
            onDraw={showDrawConfirm}
            onClearWinners={clearWinners}
          />
        </div>
      </div>
      <WinnerResultModal
        open={winnerModalVisible}
        winners={modalWinners}
        onClose={() => setWinnerModalVisible(false)}
        onAfterClose={() => { fetchDatabaseUsers(); fetchOrCreateRoom(); fetchWinnersFromServer(); }}
      />
    </main>
  );
}