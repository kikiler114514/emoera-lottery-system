// 共享类型定义，避免在多个组件间重复声明

export interface User {
  key: string;
  name: string;
  department: string;
  prizeName?: string;
}

export interface DatabaseUser {
  id: number;
  name: string;
  department?: string;
  created_at: string;
  /** 是否已中奖（由后端 EXISTS(SELECT 1 FROM lottery_winners) 实时计算） */
  participated: boolean;
}

export interface LotteryWinnerResponse {
  id: number;
  name: string;
  department?: string;
}

export interface RoomInfo {
  name: string;
  total_users: number;
  current_winners: number;
}

/** GET /api/history?roomId=xxx 返回的单条中奖记录（来自 lottery_winners 表） */
export interface HistoryLotteryRecord {
  id: number;
  round_number: number;
  won_at: string;
  prize_name?: string | null;
  winner_name: string;
  winner_department?: string | null;
  room_id: string;
  room_name: string;
}