'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Menu, Button, Space, App, message } from 'antd';
import { FileTextOutlined, PlusOutlined, ArrowLeftOutlined, HomeOutlined, UserOutlined, LogoutOutlined } from '@ant-design/icons';
import styles from './styles.module.css';
import Image from 'next/image';
import { generateRoomId, saveRoomCreationRecord } from '@/lib/room-utils';
import { useAuth } from '@/lib/auth-context';

export function Navbar() {
  const { modal } = App.useApp();
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, login, logout } = useAuth();

  const isRegisterPage = pathname.startsWith('/register');

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  if (isRegisterPage) {
    return (
      <nav className={styles.navbar} aria-label="报名页导航">
        <div className={styles.registerContainer}>
          <button className={styles.registerNavBtn} onClick={goBack} aria-label="返回上一页">
            <ArrowLeftOutlined />
          </button>
          <span className={styles.registerNavTitle}>参与抽奖</span>
          <button className={styles.registerNavBtn} onClick={() => router.push('/')} aria-label="返回首页">
            <HomeOutlined />
          </button>
        </div>
      </nav>
    );
  }

  const menuItems = [
    { key: '/', label: '抽奖首页' },
    { key: '/history', label: '历史记录' },
    { key: '/activities', label: '活动' },
  ];

  const createNewRoom = () => {
    if (!user.authenticated) {
      message.warning('请先登录后再创建房间');
      return;
    }
    modal.confirm({
      title: '创建新房间',
      content: (
        <div>
          <p>确定要创建一个新的抽奖房间吗？</p>
          <div style={{ marginTop: '12px', fontSize: '14px', color: '#666' }}>
            <p>• 新房间将生成随机房间号</p>
            <p>• 您可以邀请用户扫码参与抽奖</p>
            <p>• 房间信息将保存到您的历史记录中</p>
          </div>
        </div>
      ),
      okText: '确定创建',
      cancelText: '取消',
      icon: <PlusOutlined style={{ color: '#1890ff' }} />,
      onOk: () => {
        const newRoomId = generateRoomId();
        saveRoomCreationRecord(newRoomId);
        router.push(`/room/${newRoomId}`);
      },
    });
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch (e: unknown) {
      message.error((e as Error).message || '登录失败');
    }
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.container}>
        <div
          className={styles.logo}
          role="button" tabIndex={0} aria-label="返回首页"
          onClick={() => router.push('/')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/'); } }}
        >
          <Image src="/choujiang.png" alt="E时代抽奖" width={32} height={32} className={styles.logoImage} priority />
          <span className={styles.logoText}>E时代抽奖</span>
        </div>
        <Menu mode="horizontal" selectedKeys={[pathname]} items={menuItems} onClick={({ key }) => router.push(key)} className={styles.menu} />
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={createNewRoom} size="small">
            创建新房间
          </Button>
          <Button
            type="link" icon={<FileTextOutlined />}
            href="https://docs.qq.com/aio/DVHZpRFFTdUVIYlV2?p=1DpcFCoxfrdnDemGI2ze7F"
            target="_blank" rel="noopener noreferrer" className={styles.changelogButton}
          >
            更新日志
          </Button>
          {loading ? null : user.authenticated ? (
            <>
              <Button type="text" icon={<UserOutlined />} size="small" style={{ color: '#1890ff' }}>
                {user.user_name}
              </Button>
              <Button type="text" icon={<LogoutOutlined />} size="small" onClick={logout} danger>
                退出
              </Button>
            </>
          ) : (
            <Button type="dashed" icon={<UserOutlined />} size="small" onClick={handleLogin}>
              登录
            </Button>
          )}
        </Space>
      </div>
    </nav>
  );
}