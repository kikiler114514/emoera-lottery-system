'use client';

import { Button, Card, InputNumber, Form, Input, Table, Typography, Space, Tooltip, Row, Col, Tag } from 'antd';
import { PlusOutlined, NumberOutlined, ClearOutlined, ReloadOutlined, SyncOutlined, PauseOutlined, HistoryOutlined } from '@ant-design/icons';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import type { ColumnsType } from 'antd/es/table';
import type { DatabaseUser, RoomInfo } from '@/lib/types';

interface ParticipantManagerProps {
  roomId: string;
  roomInfo: RoomInfo | null;
  qrCodeUrl: string;
  databaseUsers: DatabaseUser[];
  autoRefresh: boolean;
  lastRefreshTime: Date | null;
  addUserLoading: boolean;
  generateUsersLoading: boolean;
  refreshing?: boolean;
  isOwner: boolean;
  onAddUser: (values: { name: string; department?: string }) => void;
  onGenerateUsers: (values: { count: number; startFrom?: number }) => void;
  onReset: () => void;
  onRefresh: () => void;
  onToggleAutoRefresh: () => void;
  onOpenHistory: () => void;
}

const databaseColumns: ColumnsType<DatabaseUser> = [
  {
    title: '姓名',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '部门',
    dataIndex: 'department',
    key: 'department',
    render: (text: string) => text || '-'
  },
  {
    title: '注册时间',
    dataIndex: 'created_at',
    key: 'created_at',
    render: (date: string) => new Date(date).toLocaleString()
  },
  {
    title: '中奖状态',
    dataIndex: 'participated',
    key: 'participated',
    render: (participated: boolean) => participated ? '已中奖' : '未中奖'
  },
];

export default function ParticipantManager({
  roomId,
  roomInfo,
  qrCodeUrl,
  databaseUsers,
  autoRefresh,
  lastRefreshTime,
  addUserLoading,
  generateUsersLoading,
  refreshing,
  isOwner,
  onAddUser,
  onGenerateUsers,
  onReset,
  onRefresh,
  onToggleAutoRefresh,
  onOpenHistory,
}: ParticipantManagerProps) {
  const [form] = Form.useForm();
  const [generateForm] = Form.useForm();

  return (
    <Row gutter={[16, 16]}>
      {roomInfo && (
        <Col span={24}>
          <Card
            title={`房间 ${roomId}`}
            size="small"
            extra={
              <Space>
                <Button
                  icon={<HistoryOutlined />}
                  size="small"
                  onClick={onOpenHistory}
                >
                  历史记录
                </Button>
                <Button
                  icon={autoRefresh ? <PauseOutlined /> : <SyncOutlined />}
                  type={autoRefresh ? "default" : "primary"}
                  size="small"
                  onClick={onToggleAutoRefresh}
                >
                  {autoRefresh ? '暂停实时推送' : '开启实时推送'}
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  size="small"
                  onClick={onRefresh}
                  loading={refreshing}
                >
                  立即刷新
                </Button>
              </Space>
            }
          >
            <Typography.Text type="secondary">
              {roomInfo.name}
            </Typography.Text>
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                报名人数：<span style={{ fontWeight: 'bold', color: '#1890ff' }}>{roomInfo.total_users}</span> | 已中奖：<span style={{ fontWeight: 'bold', color: '#52c41a' }}>{roomInfo.current_winners}</span>
              </Typography.Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {autoRefresh && (
                  <Tag color="green" icon={<SyncOutlined spin />}>
                    实时推送中
                  </Tag>
                )}
                {lastRefreshTime && (
                  <Typography.Text type="secondary" style={{ fontSize: '11px' }}>
                    最后更新：{lastRefreshTime.toLocaleTimeString()}
                  </Typography.Text>
                )}
              </div>
            </div>
          </Card>
        </Col>
      )}
      <Col span={24}>
        <QRCodeGenerator
          url={qrCodeUrl}
          title={`房间 ${roomId} - 扫码参与`}
          description="用户扫码后可填写信息参与抽奖"
        />
      </Col>
      <Col span={24}>
        <Card
          title="参与者管理"
          extra={
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={onRefresh}
                type="default"
                loading={refreshing}
              >
                刷新
              </Button>
              {isOwner && (
                <Button
                  icon={<ClearOutlined />}
                  onClick={onReset}
                  danger
                >
                  重置状态
                </Button>
              )}
            </Space>
          }
        >
          <div style={{ marginBottom: 16 }}>
            {isOwner && (
              <>
                <Form form={form} onFinish={onAddUser} layout="inline" style={{ marginBottom: 16 }}>
                  <Form.Item
                    name="name"
                    rules={[{ required: true, message: '请输入姓名' }]}
                  >
                    <Input placeholder="姓名" />
                  </Form.Item>
                  <Form.Item name="department">
                    <Input placeholder="部门（选填）" />
                  </Form.Item>
                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<PlusOutlined />}
                      loading={addUserLoading}
                    >
                      添加
                    </Button>
                  </Form.Item>
                </Form>

                <Form
                  form={generateForm}
                  onFinish={onGenerateUsers}
                  layout="inline"
                  initialValues={{ startFrom: 1 }}
                >
                  <Form.Item
                    name="count"
                    rules={[{ required: true, message: '请输入数量' }]}
                  >
                    <InputNumber
                      min={1}
                      placeholder="生成数量"
                    />
                  </Form.Item>
                  <Form.Item name="startFrom">
                    <InputNumber
                      min={1}
                      placeholder="起始号码"
                    />
                  </Form.Item>
                  <Form.Item>
                    <Tooltip title="批量生成序号">
                      <Button
                        type="default"
                        htmlType="submit"
                        icon={<NumberOutlined />}
                        loading={generateUsersLoading}
                      >
                        生成序号
                      </Button>
                    </Tooltip>
                  </Form.Item>
                </Form>
              </>
            )}
            {!isOwner && (
              <div style={{ color: '#999', fontSize: 13, padding: '8px 0' }}>
                💡 只有房间创建者可以添加参与者
              </div>
            )}
          </div>

          <Table
            dataSource={databaseUsers}
            columns={databaseColumns}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 人`,
              pageSizeOptions: [10, 20, 50, 100],
            }}
          />
        </Card>
      </Col>
    </Row>
  );
}
