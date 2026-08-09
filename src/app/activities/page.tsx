'use client';

import { useState, useEffect, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spin, Modal, Input, App } from 'antd';
import { PlusOutlined, CalendarOutlined, DeleteOutlined } from '@ant-design/icons';
import styles from './activities.module.css';

interface ActivitySummary {
  id: number;
  activity_id: string;
  name: string;
  description: string;
  created_at: string;
  room_count: number;
  total_users: number;
  total_winners: number;
}

export default function ActivitiesPage() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchActivities = async () => {
    try {
      const res = await fetch('/api/activities');
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch (e) {
      console.error('Failed to fetch activities:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchActivities(); }, []);

  // 执行删除：后端 DELETE /api/activities/{activity_id} 需要管理员 token
  const doDelete = async (act: ActivitySummary) => {
    setDeletingId(act.activity_id);
    try {
      const res = await fetch(`/api/activities/${act.activity_id}`, { method: 'DELETE' });
      if (res.ok) {
        message.success('活动已删除');
        fetchActivities();
      } else {
        const d = await res.json().catch(() => ({}));
        message.error(d.detail || '删除失败');
      }
    } catch (e) {
      console.error('Failed to delete activity:', e);
      message.error('网络错误');
    } finally {
      setDeletingId(null);
    }
  };

  // 点击删除按钮：阻止冒泡（卡片本身会跳转详情）
  const handleDeleteClick = (e: MouseEvent, act: ActivitySummary) => {
    e.stopPropagation();
    askDelete(act);
  };

  // 二次确认删除，避免误触
  const askDelete = (act: ActivitySummary) => {
    modal.confirm({
      title: `删除活动「${act.name}」？`,
      content: '删除后该活动下的抽奖房间会解除关联（房间本身保留），此操作不可撤销。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => doDelete(act),
    });
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      message.warning('请输入活动名称');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: newDesc.trim() }),
      });
      if (res.ok) {
        message.success('活动创建成功');
        setCreateModalOpen(false);
        setNewName('');
        setNewDesc('');
        fetchActivities();
      } else {
        const d = await res.json();
        message.error(d.detail || '创建失败');
      }
    } catch (e) {
      console.error('Failed to create activity:', e);
      message.error('网络错误');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <main className={styles.page}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
          <Spin size="large" />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>
          <CalendarOutlined style={{ color: '#1890ff' }} />
          活动管理
        </h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
          size="large"
        >
          创建活动
        </Button>
      </div>

      {activities.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📋</div>
          <div className={styles.emptyTitle}>还没有活动</div>
          <div className={styles.emptyDesc}>创建活动来统一管理多轮抽奖</div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            创建第一个活动
          </Button>
        </div>
      ) : (
        <div className={styles.grid}>
          {activities.map((act) => (
            <div
              key={act.activity_id}
              className={styles.card}
              onClick={() => router.push(`/activities/${act.activity_id}`)}
            >
              <div className={styles.cardTop}>
                <div className={styles.cardName}>{act.name}</div>
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  loading={deletingId === act.activity_id}
                  onClick={(e) => handleDeleteClick(e, act)}
                >
                  删除
                </Button>
              </div>
              <div className={styles.cardDesc}>
                {act.description || '暂无描述'}
              </div>
              <div className={styles.stats}>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{act.room_count}</div>
                  <div className={styles.statLabel}>房间数</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{act.total_users}</div>
                  <div className={styles.statLabel}>参与人数</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{act.total_winners}</div>
                  <div className={styles.statLabel}>中奖人数</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="创建新活动"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)}
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>活动名称</div>
          <Input
            placeholder="例如：2026 年会"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onPressEnter={handleCreate}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>描述（可选）</div>
          <Input.TextArea
            placeholder="活动描述"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={3}
          />
        </div>
      </Modal>

    </main>
  );
}