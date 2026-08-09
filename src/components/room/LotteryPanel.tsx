'use client';

import { Button, Card, InputNumber, Switch, Table, Row, Col, Input, Spin } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { User } from '@/lib/types';
import Wheel, { type WheelCandidate } from './Wheel';

interface LotteryPanelProps {
  drawCount: number;
  setDrawCount: (value: number) => void;
  preventDuplicateWinners: boolean;
  setPreventDuplicateWinners: (value: boolean) => void;
  prizeName: string;
  setPrizeName: (value: string) => void;
  isSpinning: boolean;
  wheelCandidates: WheelCandidate[];
  wheelWinners: WheelCandidate[];
  onWheelComplete: () => void;
  /** 每次抽奖递增，强制 Wheel 重新挂载避免 React 复用导致 effect 不触发 */
  wheelKey?: number;
  availableCount: number;
  currentWinners: User[];
  allWinners: User[];
  onDraw: () => void;
  onClearWinners: () => void;
}

const winnersColumns: ColumnsType<User> = [
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
    title: '奖品',
    dataIndex: 'prizeName',
    key: 'prizeName',
    render: (text?: string) => text ? <span style={{ color: '#d48806' }}>{text}</span> : <span style={{ color: '#bbb' }}>-</span>
  },
];

export default function LotteryPanel({
  drawCount,
  setDrawCount,
  preventDuplicateWinners,
  setPreventDuplicateWinners,
  prizeName,
  setPrizeName,
  isSpinning,
  wheelCandidates,
  wheelWinners,
  onWheelComplete,
  wheelKey = 0,
  availableCount,
  currentWinners,
  allWinners,
  onDraw,
  onClearWinners,
}: LotteryPanelProps) {
  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card title="幸运抽奖">
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: 8, whiteSpace: 'nowrap' }}>本次抽奖人数：</span>
              <InputNumber
                min={1}
                max={availableCount}
                value={drawCount}
                onChange={(value) => setDrawCount(value || 1)}
              />
            </div>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: 8, whiteSpace: 'nowrap' }}>每人只能中奖一次：</span>
              <Switch
                checked={preventDuplicateWinners}
                onChange={setPreventDuplicateWinners}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 6, color: '#666', fontSize: '14px' }}>奖品名称（可选）：</div>
              <Input
                placeholder="例如：一等奖 / iPhone / 精美礼品"
                value={prizeName}
                onChange={(e) => setPrizeName(e.target.value)}
                maxLength={100}
                allowClear
              />
            </div>
            <div style={{ fontSize: '14px', color: '#666' }}>
              当前可参与人数：{availableCount} 人
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            {isSpinning ? (
              wheelCandidates.length > 0 ? (
                <div>
                  <Wheel
                    key={wheelKey}
                    candidates={wheelCandidates}
                    winners={wheelWinners}
                    onComplete={onWheelComplete}
                    size={300}
                  />
                  <div style={{ marginBottom: 10, fontSize: '14px', color: '#1890ff', fontWeight: 600 }}>
                    🎯 大转盘转动中…
                  </div>
                </div>
              ) : (
                <div style={{ padding: '60px 0' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 16, fontSize: '14px', color: '#1890ff' }}>
                    🎯 正在抽奖中…
                  </div>
                </div>
              )
            ) : (
              <Button
                type="primary"
                size="large"
                onClick={onDraw}
                style={{ marginBottom: 16 }}
              >
                开始抽奖
              </Button>
            )}
          </div>
        </Card>
      </Col>

      <Col span={24}>
        <Card
          title="本次中奖名单"
          extra={
            <Button
              icon={<ClearOutlined />}
              onClick={onClearWinners}
              danger
            >
              清空记录
            </Button>
          }
        >
          <Table
            dataSource={currentWinners}
            columns={winnersColumns}
            pagination={false}
            rowKey={(record) => `current-${record.key}`}
          />
        </Card>
      </Col>

      <Col span={24}>
        <Card title="历史中奖名单">
          <Table
            dataSource={allWinners}
            columns={winnersColumns}
            rowKey={(record) => `all-${record.key}`}
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
