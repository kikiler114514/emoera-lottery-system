'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Form, Input, Button, Typography, Spin, App } from 'antd';
import { UserOutlined, TeamOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import styles from './register.module.css';

const { Title, Text } = Typography;

interface RoomInfo {
  id: number;
  room_id: string;
  name: string;
  description?: string;
  total_users: number;
  current_winners: number;
}

// 浮动装饰元素
function FloatingElements() {
  return (
    <div className={styles.floatingElements} aria-hidden="true">
      <div className={styles.floatingElement} style={{ top: '10%', left: '10%', animationDelay: '0s' }}>
        🎉
      </div>
      <div className={styles.floatingElement} style={{ top: '20%', right: '10%', animationDelay: '2s' }}>
        🎊
      </div>
      <div className={styles.floatingElement} style={{ bottom: '30%', left: '5%', animationDelay: '4s' }}>
        ✨
      </div>
      <div className={styles.floatingElement} style={{ bottom: '10%', right: '15%', animationDelay: '1s' }}>
        🎁
      </div>
      <div className={styles.floatingElement} style={{ top: '60%', left: '85%', animationDelay: '3s' }}>
        🌟
      </div>
    </div>
  );
}

// 创建一个使用 useSearchParams 的子组件
function RegisterForm() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);

  const searchParams = useSearchParams();
  const roomId = searchParams.get('roomId');

  useEffect(() => {
    const fetchRoomInfo = async () => {
      if (!roomId) {
        setInfoLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/rooms/${roomId}`);
        if (response.ok) {
          const data = await response.json();
          setRoomInfo(data.room);
        } else {
          console.error('Failed to fetch room info');
        }
      } catch (error) {
        console.error('Error fetching room info:', error);
      } finally {
        setInfoLoading(false);
      }
    };

    fetchRoomInfo();
  }, [roomId]);

  const onFinish = async (values: { name: string; department?: string }) => {
    if (!roomId) {
      message.error('缺少房间信息');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...values,
          roomId: roomId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        message.success('注册成功！您现在可以参与抽奖了');
        setSubmitted(true);
        form.resetFields();
      } else {
        message.error(data.detail || '注册失败，请重试');
      }
    } catch (error) {
      console.error('Registration error:', error);
      message.error('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (infoLoading) {
    return (
      <div className={styles.container}>
        <FloatingElements />
        <Card className={styles.loadingCard}>
          <div style={{ padding: '40px 20px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '20px' }}>
              <Text type="secondary">加载房间信息中...</Text>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!roomId || !roomInfo) {
    return (
      <div className={styles.container}>
        <FloatingElements />
        <Card className={styles.loadingCard}>
          <div style={{ padding: '40px 20px' }}>
            <div className={styles.errorIcon}>
              <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
            </div>
            <Title level={2} style={{ color: '#ff4d4f', marginBottom: '10px' }}>
              房间无效
            </Title>
            <Text type="secondary" style={{ fontSize: '16px' }}>
              抽奖房间不存在或已关闭
            </Text>
          </div>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className={styles.container}>
        <FloatingElements />
        <Card className={styles.loadingCard}>
          <div style={{ padding: '40px 20px' }}>
            <div className={styles.successIcon}>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
            </div>
            <Title level={2} style={{ color: '#52c41a', marginBottom: '10px' }}>
              注册成功！
            </Title>
            <Text type="secondary" style={{ fontSize: '16px', marginBottom: '20px' }}>
              您已成功报名参与抽奖活动
            </Text>
            <Button
              className={styles.continueButton}
              onClick={() => setSubmitted(false)}
              size="large"
            >
              继续注册其他用户
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <FloatingElements />
      <Card
        title={
          <div style={{ textAlign: 'center', color: '#1f1f1f' }}>
            <Title level={2} style={{ margin: 0, color: 'inherit', fontWeight: 700 }}>
              🎯 参与抽奖
            </Title>
            <Text type="secondary" style={{ fontSize: '16px' }}>
              {roomInfo.name}
            </Text>
          </div>
        }
        className={styles.card}
        styles={{
          body: { padding: '30px' }
        }}
      >
        <div style={{
          textAlign: 'center',
          marginBottom: '24px',
          padding: '16px',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          borderRadius: '12px',
          border: '1px solid #e1f5fe'
        }}>
          <Text style={{ color: '#0277bd', fontWeight: 500 }}>
            📊 当前报名人数：<strong>{roomInfo.total_users}</strong> | 🏆 已中奖：<strong>{roomInfo.current_winners}</strong>
          </Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
          size="large"
        >
          <Form.Item
            label={
              <span style={{ fontWeight: 600, color: '#262626' }}>
                <UserOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                姓名
              </span>
            }
            name="name"
            rules={[
              { required: true, message: '请输入您的姓名' },
              { min: 2, message: '姓名至少需要2个字符' },
              { max: 20, message: '姓名不能超过20个字符' }
            ]}
          >
            <Input
              placeholder="请输入您的姓名"
              className={styles.formInput}
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ fontWeight: 600, color: '#262626' }}>
                <TeamOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                部门（可选）
              </span>
            }
            name="department"
            rules={[
              { max: 50, message: '部门名称不能超过50个字符' }
            ]}
          >
            <Input
              placeholder="请输入您的部门"
              className={styles.formInput}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: '32px' }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              className={styles.submitButton}
            >
              {loading ? '提交中...' : '🎊 立即报名'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

// 页面入口：用 Suspense 包裹 useSearchParams 调用
export default function RegisterPage() {
  const fallback = (
    <div className={styles.container}>
      <div className={styles.loadingCard}>
        <div style={{ padding: '40px 20px' }}>
          <Spin size="large" />
        </div>
      </div>
    </div>
  );

  return (
    <Suspense fallback={fallback}>
      <RegisterForm />
    </Suspense>
  );
}