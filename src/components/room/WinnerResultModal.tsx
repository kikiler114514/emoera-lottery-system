'use client';

import { Modal, Typography } from 'antd';
import type { User } from '@/lib/types';
import styles from './WinnerResultModal.module.css';

interface WinnerResultModalProps {
  open: boolean;
  winners: User[];
  onClose: () => void;
  /** 点击「确认结果」后触发的回调（用于刷新数据等） */
  onAfterClose?: () => void;
}

export default function WinnerResultModal({ open, winners, onClose, onAfterClose }: WinnerResultModalProps) {
  const prizeName = winners[0]?.prizeName;

  const handleConfirm = () => {
    onAfterClose?.();
    onClose();
  };

  return (
    <Modal
      title={null}
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      centered
      className={styles.modal}
    >
      <div className={styles.container}>
        {/* 标题 */}
        <div className={styles.header}>
          <Typography.Title level={2} className={styles.title}>
            🎊 抽奖结果
          </Typography.Title>
          {prizeName && (
            <div className={styles.prizeBadge}>🎁 {prizeName}</div>
          )}
        </div>

        {winners.length > 0 && (
          <>
            <div className={styles.winnerCount}>
              恭喜以下 {winners.length} 位获奖者
            </div>

            {/* 获奖者列表 */}
            <div className={styles.winnerList}>
              {winners.map((winner, index) => (
                <div key={winner.key} className={styles.winnerItem}>
                  <div className={styles.rankCircle}>{index + 1}</div>
                  <div className={styles.winnerName}>{winner.name}</div>
                  <div className={styles.winnerDept}>
                    {winner.department || '未填写部门'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 底部提示 */}
        <div className={styles.footer}>
          <div className={styles.footerText}>
            ✅ 获奖信息已自动保存至系统记录
          </div>
          <button type="button" onClick={handleConfirm} className={styles.closeButton}>
            确认结果
          </button>
        </div>
      </div>
    </Modal>
  );
}