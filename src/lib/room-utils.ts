const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

export interface LocalCreatedRoom {
  roomId: string;
  name?: string;
  createdAt: number;
}

/** 生成 6 位随机房间 ID。 */
export function generateRoomId(): string {
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
}

const STORAGE_KEY = "myCreatedRooms";
const MAX_RECORDS = 50;

/** 保存房间创建记录到 localStorage（最多 50 条，去重+去旧）。 */
export function saveRoomCreationRecord(
  roomId: string,
  name?: string
): void {
  let records: LocalCreatedRoom[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) records = JSON.parse(raw);
  } catch {
    // ignore invalid data
  }
  const existing = records.findIndex((r) => r.roomId === roomId);
  if (existing >= 0) records.splice(existing, 1);
  records.unshift({ roomId, name, createdAt: Date.now() });
  if (records.length > MAX_RECORDS) records = records.slice(0, MAX_RECORDS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

/** 获取本地创建的房间列表。 */
export function getLocalCreatedRooms(): LocalCreatedRoom[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** getCreatedRooms 是 getLocalCreatedRooms 的别名，首页使用。 */
export function getCreatedRooms(): LocalCreatedRoom[] {
  return getLocalCreatedRooms();
}

/** 从本地记录中删除指定房间（房间已不存在时清理用）。 */
export function removeRoomCreationRecord(roomId: string): void {
  try {
    const records = getLocalCreatedRooms().filter((r) => r.roomId !== roomId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}