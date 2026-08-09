'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Typography, Tag, Button, Space, Input, message, Tabs, Popconfirm } from 'antd';
import { useRouter } from 'next/navigation';
import { ReloadOutlined, HomeOutlined, DeleteOutlined } from '@ant-design/icons';
import styles from './history.module.css';
import type { LocalCreatedRoom } from '@/lib/room-utils';

const { Title, Text } = Typography;
const { Search } = Input;

interface LotteryRecord {
  id: number;
  round_number: number;
  won_at: string;
  prize_name?: string;
  winner_name: string;
  winner_department?: string;
  room_id: string;
  room_name: string;
}

interface GroupedLotteryRecord {
  room_id: string;
  room_name: string;
  round_number: number;
  won_at: string;
  prize_name?: string;
  winners: Array<{
    name: string;
    department?: string;
  }>;
  winner_count: number;
}

interface RoomRecord {
  room_id: string;
  name: string;
  description?: string;
  created_at: string;
  total_users: number;
  current_winners: number;
  total_rounds: number;
}

interface MyCreatedRoomInfo extends RoomRecord {
  localCreatedAt: number;
}

export default function HistoryPage() {
  const router = useRouter();

  const [localCreatedRooms, setLocalCreatedRooms] = useState<LocalCreatedRoom[]>([]);
  const [myCreatedRoomsInfo, setMyCreatedRoomsInfo] = useState<MyCreatedRoomInfo[]>([]);
  const [groupedLotteryRecords, setGroupedLotteryRecords] = useState<GroupedLotteryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);

  // 从 localStorage 获取本地创建的房间
  useEffect(() => {
    const savedRooms = localStorage.getItem('myCreatedRooms');
    if (savedRooms) {
      const rooms: LocalCreatedRoom[] = JSON.parse(savedRooms);
      setLocalCreatedRooms(rooms);
      // 根据本地保存的房间ID获取相关信息
      fetchMyData(rooms);
    }
    // fetchMyData is stable (useCallback with [] deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 获取我的数据（房间信息和抽奖记录）
  const fetchMyData = useCallback(async (localRooms: LocalCreatedRoom[]) => {
    if (localRooms.length === 0) {
      setMyCreatedRoomsInfo([]);
      setGroupedLotteryRecords([]);
      return;
    }
    
    setLoading(true);
    try {
      const roomIds = localRooms.map(room => room.roomId);
      const queryParams = new URLSearchParams();
      queryParams.append('roomIds', JSON.stringify(roomIds));
      
      const response = await fetch(`/api/history?${queryParams.toString()}`);
      if (response.ok) {
        const data = await response.json();
        
        // 处理房间信息
        if (data.roomRecords) {
          const mergedInfo: MyCreatedRoomInfo[] = data.roomRecords.map((dbRoom: RoomRecord) => {
            const localRoom = localRooms.find(lr => lr.roomId === dbRoom.room_id);
            return {
              ...dbRoom,
              localCreatedAt: localRoom?.createdAt || 0,
            };
          });
          setMyCreatedRoomsInfo(mergedInfo);
        }
        
        // 处理抽奖记录
        if (data.lotteryRecords) {
          const grouped = groupLotteryRecords(data.lotteryRecords);
          setGroupedLotteryRecords(grouped);
        } else {
          setGroupedLotteryRecords([]);
        }
      } else {
        message.error('获取历史数据失败');
      }
    } catch (error) {
      console.error('Failed to fetch my data:', error);
      message.error('获取历史数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 按房间和轮次分组抽奖记录
  const groupLotteryRecords = (records: LotteryRecord[]): GroupedLotteryRecord[] => {
    const groupMap = new Map<string, GroupedLotteryRecord>();
    
    records.forEach(record => {
      const key = `${record.room_id}-${record.round_number}`;
      
      if (groupMap.has(key)) {
        const existing = groupMap.get(key)!;
        existing.winners.push({
          name: record.winner_name,
          department: record.winner_department
        });
        existing.winner_count++;
      } else {
        groupMap.set(key, {
          room_id: record.room_id,
          room_name: record.room_name,
          round_number: record.round_number,
          won_at: record.won_at,
          prize_name: record.prize_name,
          winners: [{
            name: record.winner_name,
            department: record.winner_department
          }],
          winner_count: 1
        });
      }
    });
    
    // 转换为数组并按时间倒序排序
    return Array.from(groupMap.values()).sort((a, b) => 
      new Date(b.won_at).getTime() - new Date(a.won_at).getTime()
    );
  };

  // 刷新数据
  const refreshData = () => {
    fetchMyData(localCreatedRooms);
  };

  // 删除房间
  const handleDeleteRoom = async (roomId: string) => {
    setDeletingRoomId(roomId);
    try {
      const res = await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
      if (res.ok) {
        message.success('房间已删除');
        // 从 localStorage 中也移除
        const updatedRooms = localCreatedRooms.filter(r => r.roomId !== roomId);
        localStorage.setItem('myCreatedRooms', JSON.stringify(updatedRooms));
        setLocalCreatedRooms(updatedRooms);
        // 重新拉取数据
        fetchMyData(updatedRooms);
      } else {
        const data = await res.json().catch(() => ({ detail: '删除失败' }));
        message.error(data.detail || '删除失败');
      }
    } catch {
      message.error('网络错误，删除失败');
    } finally {
      setDeletingRoomId(null);
    }
  };

  // 房间信息表格列
  const roomColumns = [
    {
      title: '房间信息',
      key: 'room_info',
      render: (record: MyCreatedRoomInfo) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.name}</div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            ID: {record.room_id}
          </Text>
          {record.description && (
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              <Text type="secondary">{record.description}</Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'localCreatedAt',
      key: 'localCreatedAt',
      render: (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN'),
      sorter: (a: MyCreatedRoomInfo, b: MyCreatedRoomInfo) => b.localCreatedAt - a.localCreatedAt,
    },
    {
      title: '参与人数',
      dataIndex: 'total_users',
      key: 'total_users',
      render: (count: number) => <Tag color="blue">{count}人</Tag>,
      sorter: (a: MyCreatedRoomInfo, b: MyCreatedRoomInfo) => b.total_users - a.total_users,
    },
    {
      title: '中奖人数',
      dataIndex: 'current_winners',
      key: 'current_winners',
      render: (count: number) => <Tag color="green">{count}人</Tag>,
      sorter: (a: MyCreatedRoomInfo, b: MyCreatedRoomInfo) => b.current_winners - a.current_winners,
    },
    {
      title: '抽奖轮次',
      dataIndex: 'total_rounds',
      key: 'total_rounds',
      render: (count: number) => <Tag color="purple">{count}轮</Tag>,
      sorter: (a: MyCreatedRoomInfo, b: MyCreatedRoomInfo) => b.total_rounds - a.total_rounds,
    },
         {
       title: '操作',
       key: 'actions',
       render: (record: MyCreatedRoomInfo) => (
         <Space>
           <Button
             size="small"
             type="primary"
             icon={<HomeOutlined />}
             onClick={() => router.push(`/room/${record.room_id}`)}
           >
             进入房间
           </Button>
           <Popconfirm
             title="确认删除"
             description={`确定要删除房间「${record.name}」吗？所有参与者、中奖记录将被一并删除，且不可恢复。`}
             onConfirm={() => handleDeleteRoom(record.room_id)}
             okText="确认删除"
             cancelText="取消"
             okButtonProps={{ danger: true }}
           >
             <Button
               size="small"
               danger
               icon={<DeleteOutlined />}
               loading={deletingRoomId === record.room_id}
             >
               删除
             </Button>
           </Popconfirm>
         </Space>
       ),
     },
  ];

  // 分组抽奖记录表格列
  const groupedLotteryColumns = [
    {
      title: '房间',
      dataIndex: 'room_name',
      key: 'room_name',
      render: (text: string, record: GroupedLotteryRecord) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
          <Text type="secondary" style={{ fontSize: '12px' }}>ID: {record.room_id}</Text>
        </div>
      ),
    },
    {
      title: '轮次',
      dataIndex: 'round_number',
      key: 'round_number',
      render: (round: number) => <Tag color="purple">第{round}轮</Tag>,
      sorter: (a: GroupedLotteryRecord, b: GroupedLotteryRecord) => b.round_number - a.round_number,
    },
    {
      title: '抽奖时间',
      dataIndex: 'won_at',
      key: 'won_at',
      render: (time: string) => new Date(time).toLocaleString('zh-CN'),
      sorter: (a: GroupedLotteryRecord, b: GroupedLotteryRecord) => 
        new Date(b.won_at).getTime() - new Date(a.won_at).getTime(),
    },
    {
      title: '奖品名称',
      dataIndex: 'prize_name',
      key: 'prize_name',
      render: (name?: string) => name ? <Tag color="gold">{name}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '中奖人数',
      dataIndex: 'winner_count',
      key: 'winner_count',
      render: (count: number) => <Tag color="blue">{count}人</Tag>,
      sorter: (a: GroupedLotteryRecord, b: GroupedLotteryRecord) => b.winner_count - a.winner_count,
    },
    {
      title: '中奖者名单',
      key: 'winners',
      render: (record: GroupedLotteryRecord) => (
        <div style={{ maxWidth: '300px' }}>
          <Space size={4} wrap>
            {record.winners.map((winner, index) => (
              <Tag 
                key={index} 
                color="green" 
                style={{ 
                  marginBottom: '4px',
                  fontSize: '12px',
                }}
              >
                {winner.name} {winner.department && `(${winner.department})`}
              </Tag>
            ))}
          </Space>
        </div>
      ),
    },
  ];

  // 过滤数据
  const getFilteredData = <T,>(data: T[], searchText: string) => {
    if (!searchText) return data;
    return data.filter(item => 
      JSON.stringify(item).toLowerCase().includes(searchText.toLowerCase())
    );
  };

  // 如果没有本地创建的房间
  if (localCreatedRooms.length === 0) {
    return (
      <main className={styles.main}>
        <div className={styles.container}>
          <Card className={styles.historyCard}>
            <div className={styles.header}>
              <Title level={3}>历史记录</Title>
              <Button type="primary" onClick={() => router.push('/')}>
                创建房间
              </Button>
            </div>
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
              <p>您还没有创建过任何房间</p>
              <p>点击上方&quot;创建房间&quot;按钮开始使用抽奖系统</p>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  const tabItems = [
    {
      key: 'rooms',
      label: `我的房间 (${myCreatedRoomsInfo.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Search
                placeholder="搜索房间..."
                allowClear
                style={{ width: 300 }}
                onSearch={setSearchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={refreshData}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </div>
          <Table 
            dataSource={getFilteredData(myCreatedRoomsInfo, searchText)}
            columns={roomColumns}
            loading={loading}
            pagination={{ 
              pageSize: 10,
              showTotal: (total) => `共 ${total} 个房间`,
            }}
            rowKey="room_id"
            size="small"
          />
        </div>
      ),
    },
    {
      key: 'lottery',
      label: `抽奖记录 (${groupedLotteryRecords.length}轮)`,
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Search
                placeholder="搜索抽奖记录..."
                allowClear
                style={{ width: 300 }}
                onSearch={setSearchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={refreshData}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
            <div style={{ marginTop: 8, color: '#666', fontSize: '14px' }}>
              💡 每轮抽奖的中奖者已合并显示
            </div>
          </div>
          <Table 
            dataSource={getFilteredData(groupedLotteryRecords, searchText)}
            columns={groupedLotteryColumns}
            loading={loading}
            pagination={{ 
              pageSize: 15,
              showTotal: (total) => `共 ${total} 轮抽奖`,
              showSizeChanger: true,
              showQuickJumper: true,
            }}
            rowKey={(record) => `${record.room_id}-${record.round_number}`}
            size="small"
            scroll={{ x: 800 }}
          />
        </div>
      ),
    },
  ];

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <Card className={styles.historyCard}>
          <div className={styles.header}>
            <Title level={3}>我的历史记录</Title>
            <Space>
              <Button 
                icon={<ReloadOutlined />} 
                onClick={refreshData}
                loading={loading}
              >
                刷新
              </Button>
              <Button type="primary" onClick={() => router.push('/')}>
                返回首页
              </Button>
            </Space>
          </div>
          
          <Tabs
            items={tabItems}
            size="large"
            defaultActiveKey="rooms"
          />
        </Card>
      </div>
    </main>
  );
} 