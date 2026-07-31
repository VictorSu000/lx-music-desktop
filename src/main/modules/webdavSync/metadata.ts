import fs from 'node:fs'
import path from 'node:path'
import crypto, { randomUUID } from 'node:crypto'

export interface LocalSyncState {
  /** 本机标识，首次运行时生成并持久化（不使用 MAC，虚拟网卡会导致其漂移） */
  deviceId: string
  /** 上次同步成功时的歌单内容 hash，作为判断两端各自是否有改动的基准 */
  lastSyncedHash: string | null
  /** 上次同步成功时的云端 revision */
  lastSyncedRevision: number
  lastSyncTime: number
  /** 本地歌单最后一次改动的时间，仅用于「使用最新时间」这一策略与展示 */
  localUpdatedAt: number
}

const getStateFilePath = () => path.join(global.lxDataPath, 'webdav_sync_state.json')

let cachedState: LocalSyncState | null = null

const createDefaultState = (): LocalSyncState => ({
  deviceId: randomUUID(),
  lastSyncedHash: null,
  lastSyncedRevision: 0,
  lastSyncTime: 0,
  localUpdatedAt: 0,
})

/**
 * 读取本地同步状态。
 * 使用同步 IO：这个文件很小，而且退出流程里必须保证写入完成。
 */
export const getLocalSyncState = (): LocalSyncState => {
  if (cachedState) return cachedState

  try {
    const raw = fs.readFileSync(getStateFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<LocalSyncState>
    cachedState = {
      ...createDefaultState(),
      ...parsed,
    }
    if (!cachedState.deviceId) cachedState.deviceId = randomUUID()
  } catch (err) {
    // 文件不存在或损坏，退回默认值并落盘，保证 deviceId 稳定
    cachedState = createDefaultState()
    saveLocalSyncState(cachedState)
  }

  return cachedState
}

export const saveLocalSyncState = (state: LocalSyncState): void => {
  cachedState = state
  try {
    fs.writeFileSync(getStateFilePath(), JSON.stringify(state), 'utf8')
  } catch (err) {
    console.error('Failed to save webdav sync state:', err)
  }
}

export const updateLocalSyncState = (patch: Partial<LocalSyncState>): LocalSyncState => {
  const state = { ...getLocalSyncState(), ...patch }
  saveLocalSyncState(state)
  return state
}

export const getDeviceId = (): string => getLocalSyncState().deviceId

/**
 * 计算歌单内容 hash。内容相同就不需要同步，与时间戳无关。
 * getLocalListData 构造对象的字段顺序是固定的，因此 JSON 序列化结果稳定。
 */
export const toContentHash = (data: unknown): string => {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex')
}
