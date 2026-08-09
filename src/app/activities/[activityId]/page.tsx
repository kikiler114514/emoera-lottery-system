'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Spin, Modal, Input, InputNumber, App } from 'antd';
import {
  PlusOutlined, ShareAltOutlined, TrophyFilled, ArrowLeftOutlined,
} from '@ant-design/icons';
import { generateRoomId, saveRoomCreationRecord } from '@/lib/room-utils';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import styles from './activity.module.css';

interface ActivityDetail {
  id: number;
  activity_id: string;
  name: string;
  description: string;
  created_at: string;
  room_count: number;
  total_users: number;
  total_winners: number;
}

interface RoomSummary {
  id: number;
  room_id: string;
  name: string;
  total_users: number;
  current_winners: number;
}

interface HistoryRecord {
  id: number;
  round_number: number;
  won_at: string;
  prize_name: string;
  winner_name: string;
  winner_department: string;
  room_id: string;
  room_name: string;
}

export default function ActivityDetailPage() {
  const { message } = App.useApp();
  const params = useParams();
  const router = useRouter();
  const activityId = params.activityId as string;

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCount, setNewRoomCount] = useState(1);
  const [creating, setCreating] = useState(false);
  const [activityUrl, setActivityUrl] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && activityId) {
      setActivityUrl(`${window.location.origin}/activities/${activityId}`);
    }
  }, [activityId]);

  const fetchData = useCallback(async () => {
    try {
      const [actRes, histRes] = await Promise.all([
        fetch(`/api/activities/${activityId}`),
        fetch(`/api/activities/${activityId}/history`),
      ]);

      if (actRes.ok) {
        const data = await actRes.json();
        setActivity(data.activity);
        setRooms(data.rooms || []);
      }
      if (histRes.ok) {
        const data = await histRes.json();
        setHistory(data.records || []);
      }
    } catch (e) {
      console.error('Failed to fetch activity:', e);
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateRoom = async () => {
    const name = newRoomName.trim();
    if (!name) {
      message.warning('请输入房间名称');
      return;
    }
    setCreating(true);
    try {
      // 批量创建房间
      const created: string[] = [];
      for (let i = 0; i < newRoomCount; i++) {
        const roomId = generateRoomId();
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId,
            name: newRoomCount > 1 ? `${name} #${i + 1}` : name,
            activityId,
          }),
        });
        if (res.ok) {
          created.push(roomId);
          saveRoomCreationRecord(roomId);
        }
      }
      if (created.length > 0) {
        message.success(`成功创建 ${created.length} 个房间`);
        setCreateModalOpen(false);
        setNewRoomName('');
        setNewRoomCount(1);
        fetchData();
      } else {
        message.error('创建房间失败');
      }
    } catch (e) {
      console.error('Failed to create room:', e);
      message.error('网络错误');
    } finally {
      setCreating(false);
    }
  };

  // 注意：根节点必须是 <main>。全局 CSS 的 `main { margin-top: 64px }` 是给
  // fixed 定位的 Navbar 让位用的，用 <div> 会导致页面顶部内容被导航栏盖住。
  if (loading) {
    return (
      <main className={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
          <Spin size="large" />
        </div>
      </main>
    );
  }

  if (!activity) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🔍</div>
            <div className={styles.emptyTitle}>活动不存在</div>
            <div className={styles.emptyDesc}>该活动可能已被删除</div>
            <Button onClick={() => router.push('/activities')}>返回活动列表</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* 面包屑 */}
        <div className={styles.breadcrumb} onClick={() => router.push('/activities')}>
          <ArrowLeftOutlined style={{ marginRight: 6 }} />
          返回活动列表
        </div>

        {/* 活动头部 */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1 className={styles.headerTitle}>{activity.name}</h1>
            {activity.description && (
              <p className={styles.headerDesc}>{activity.description}</p>
            )}
          </div>
          <div className={styles.headerActions}>
            <Button
              icon={<ShareAltOutlined />}
              onClick={() => setShareModalOpen(true)}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontWeight: 500 }}
            >
              分享活动
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateModalOpen(true)}
              style={{ background: '#fff', color: '#667eea', border: 'none', fontWeight: 600 }}
            >
              创建房间
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{activity.room_count}</div>
            <div className={styles.statLabel}>房间数</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{activity.total_users}</div>
            <div className={styles.statLabel}>参与人数</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{activity.total_winners}</div>
            <div className={styles.statLabel}>中奖人数</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>
              {activity.total_users > 0
                ? Math.round((activity.total_winners / activity.total_users) * 100)
                : 0}%
            </div>
            <div className={styles.statLabel}>中奖率</div>
          </div>
        </div>

        {/* 房间列表 */}
        <div style={{ marginBottom: 24 }}>
          <div className={styles.sectionTitle}>
            <span>抽奖房间</span>
          </div>

          {rooms.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🎯</div>
              <div className={styles.emptyTitle}>还没有房间</div>
              <div className={styles.emptyDesc}>创建房间来开始抽奖</div>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
                创建第一个房间
              </Button>
            </div>
          ) : (
            <div className={styles.roomGrid}>
              {rooms.map((room) => (
                <div
                  key={room.room_id}
                  className={styles.roomCard}
                  onClick={() => router.push(`/room/${room.room_id}`)}
                >
                  <div className={styles.roomInfo}>
                    <div className={styles.roomName}>{room.name}</div>
                    <div className={styles.roomId}>{room.room_id}</div>
                  </div>
                  <div className={styles.roomStats}>
                    <div className={styles.roomStatItem}>
                      <div className={styles.roomStatNum}>{room.total_users}</div>
                      <div className={styles.roomStatLbl}>参与</div>
                    </div>
                    <div className={styles.roomStatItem}>
                      <div className={styles.roomStatNum}>{room.current_winners}</div>
                      <div className={styles.roomStatLbl}>中奖</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 抽奖历史 */}
        {history.length > 0 && (
          <div className={styles.historySection}>
            <div className={styles.sectionTitle}>
              <span>抽奖历史</span>
            </div>
            <div className={styles.historyList}>
              {history.map((item) => (
                <div key={item.id} className={styles.historyItem}>
                  <div className={styles.historyIcon}>
                    <TrophyFilled />
                  </div>
                  <div className={styles.historyBody}>
                    <div className={styles.historyWinner}>{item.winner_name}</div>
                    <div className={styles.historyMeta}>
                      <span className={styles.historyRoom} onClick={(e) => { e.stopPropagation(); router.push(`/room/${item.room_id}`); }}>
                        {item.room_name}
                      </span>
                      <span>第 {item.round_number} 轮</span>
                      {item.prize_name && <span className={styles.historyPrize}>{item.prize_name}</span>}
                      <span>{new Date(item.won_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 创建房间弹窗 */}
      <Modal
        title="创建抽奖房间"
        open={createModalOpen}
        onOk={handleCreateRoom}
        onCancel={() => setCreateModalOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
      >
        <div className={styles.roomFormItem}>
          <div className={styles.roomFormLabel}>房间名称</div>
          <Input
            placeholder="例如：第一轮抽奖"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            onPressEnter={handleCreateRoom}
          />
        </div>
        <div className={styles.roomFormItem}>
          <div className={styles.roomFormLabel}>创建数量</div>
          <InputNumber
            min={1}
            max={20}
            value={newRoomCount}
            onChange={(v) => setNewRoomCount(v || 1)}
            style={{ width: '100%' }}
          />
        </div>
      </Modal>

      {/* 分享弹窗 */}
      <Modal
        title="分享活动"
        open={shareModalOpen}
        onCancel={() => setShareModalOpen(false)}
        footer={null}
      >
        <div className={styles.qrContent}>
          <div className={styles.qrCode}>
            <QRCodeGenerator url={activityUrl} />
          </div>
          <div className={styles.qrInfo}>
            <div className={styles.qrTitle2}>{activity.name}</div>
            <div className={styles.qrDesc}>
              扫码查看活动详情，包含 {activity.room_count} 个抽奖房间
            </div>
            <div className={styles.qrUrl}>
              {activityUrl}
            </div>
          </div>
        </div>
      </Modal>
    </main>
  );
}