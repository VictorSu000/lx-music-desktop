import { LIST_IDS } from '@common/constants'
import { getLocalListData, setLocalListData, buildUserListInfoFull } from '@main/modules/sync/listEvent'
import { getComputerName } from '@main/modules/sync/utils'
import {
  isWebDAVConfigured,
  checkRemoteReachable,
  getRemoteMetadata,
  saveRemoteMetadata,
  uploadPlayListData,
  downloadPlayListData,
  backupRemotePlayList,
  type RemoteSyncMetadata,
} from '@common/utils/webdav'
import { getLocalSyncState, updateLocalSyncState, getDeviceId, toContentHash } from './metadata'
import { calcListDiff } from './diff'
import { mergeListData } from './merge'

export type ConflictResolver = (conflict: LX.WebDAVSync.ConflictInfo) => Promise<LX.WebDAVSync.ConflictChoice>

export interface SyncOptions {
  /** 是否允许弹窗让用户选择冲突处理方式。退出流程中必须为 false */
  interactive: boolean
  onConflict?: ConflictResolver
}

/**
 * 同步过程中写入本地歌单会触发 list_changed，
 * 这里用标志位避免把同步自身的写入误判成「本地有新改动」而形成回声循环。
 */
let isApplyingRemoteData = false

/** 记录本地歌单改动时间，同步自身造成的写入不计入 */
export const markLocalListChanged = () => {
  if (isApplyingRemoteData) return
  updateLocalSyncState({ localUpdatedAt: Date.now() })
}

// ---------------------------------------------------------------------------
// 与网盘文件格式（playList_v2）之间的转换
// 保持与设置页的手动导入/导出一致，两条路径可以互相读取对方写的文件
// ---------------------------------------------------------------------------

const toWireFormat = (listData: LX.Sync.List.ListData) => ({
  type: 'playList_v2',
  data: [
    { id: LIST_IDS.DEFAULT, name: 'defaultList', list: listData.defaultList },
    { id: LIST_IDS.LOVE, name: 'loveList', list: listData.loveList },
    ...listData.userList,
  ],
})

const fromWireFormat = (raw: any): LX.Sync.List.ListData | null => {
  if (!raw || raw.type != 'playList_v2' || !Array.isArray(raw.data)) return null

  const listData: LX.Sync.List.ListData = {
    defaultList: [],
    loveList: [],
    userList: [],
  }

  for (const list of raw.data) {
    if (!list || !Array.isArray(list.list)) continue
    switch (list.id) {
      case LIST_IDS.DEFAULT:
        listData.defaultList = list.list
        break
      case LIST_IDS.LOVE:
        listData.loveList = list.list
        break
      default:
        // 统一字段顺序，保证两端算出的 contentHash 一致
        listData.userList.push(buildUserListInfoFull({
          ...list,
          locationUpdateTime: list.locationUpdateTime ?? null,
        }))
        break
    }
  }

  return listData
}

const buildRemoteMetadata = (contentHash: string, revision: number): RemoteSyncMetadata => ({
  contentHash,
  revision,
  updatedAt: Date.now(),
  deviceId: getDeviceId(),
  deviceName: getComputerName(),
})

/**
 * mergeListData 会就地改写传入列表里的歌曲数组，
 * 合并前必须先深拷贝，否则原始的本地/云端数据会被污染，
 * 导致后面算出的变更详情为空、「保留本地」也会误传合并后的数据。
 */
const cloneListData = (listData: LX.Sync.List.ListData): LX.Sync.List.ListData => {
  return JSON.parse(JSON.stringify(listData))
}

// ---------------------------------------------------------------------------
// 推送 / 拉取
// ---------------------------------------------------------------------------

/**
 * 把本地歌单推送到云端。
 *
 * expectedRevision 是决策时读到的云端版本号，写入前会重新读一次做校验，
 * 避免与其它客户端并发写入时互相静默覆盖（乐观锁）。
 */
const pushToRemote = async(
  listData: LX.Sync.List.ListData,
  contentHash: string,
  expectedRevision: number | null,
  action: LX.WebDAVSync.Action,
): Promise<LX.WebDAVSync.SyncResult> => {
  const current = await getRemoteMetadata()

  if (current && current.revision != expectedRevision) {
    // expectedRevision 为 null 表示决策时云端还没有数据，
    // 此刻却读到了元数据，说明期间有别的设备写入过
    return {
      status: 'conflict',
      message: '云端在本次同步期间被其它设备更新，已放弃本次推送',
    }
  }

  let remoteDiff: LX.WebDAVSync.ListDataDiff | undefined
  if (current) {
    // 覆盖前先把云端现有数据存入历史目录，并算出云端将发生的变更
    try {
      const oldRemote = await downloadPlayListData()
      await backupRemotePlayList(oldRemote)
      const oldListData = fromWireFormat(oldRemote)
      if (oldListData) remoteDiff = calcListDiff(oldListData, listData)
    } catch (err: any) {
      console.warn('Failed to backup remote playlist:', err?.message ?? err)
    }
  }

  await uploadPlayListData(toWireFormat(listData))
  const meta = buildRemoteMetadata(contentHash, (current?.revision ?? 0) + 1)
  await saveRemoteMetadata(meta)

  updateLocalSyncState({
    lastSyncedHash: contentHash,
    lastSyncedRevision: meta.revision,
    lastSyncTime: Date.now(),
  })

  return { status: 'synced', action, remoteDiff }
}

/**
 * 把指定的歌单数据写入本地。
 *
 * 写入后重新读一次本地数据计算 hash：数据库回写可能对字段做规范化，
 * 若结果与云端 hash 不一致，就把规范化后的版本推回云端让两端收敛，
 * 否则下次同步会被误判成「两端都有改动」而反复弹冲突框。
 */
const applyToLocal = async(
  before: LX.Sync.List.ListData,
  next: LX.Sync.List.ListData,
  remoteMeta: RemoteSyncMetadata,
  action: LX.WebDAVSync.Action,
): Promise<LX.WebDAVSync.SyncResult> => {
  const localDiff = calcListDiff(before, next)

  isApplyingRemoteData = true
  try {
    await setLocalListData(next)
  } finally {
    isApplyingRemoteData = false
  }

  const applied = await getLocalListData()
  const appliedHash = toContentHash(applied)

  if (appliedHash == remoteMeta.contentHash) {
    updateLocalSyncState({
      lastSyncedHash: appliedHash,
      lastSyncedRevision: remoteMeta.revision,
      lastSyncTime: Date.now(),
      localUpdatedAt: Date.now(),
    })
    return { status: 'synced', action, localDiff }
  }

  // 需要推回云端使两端收敛，由 pushToRemote 负责记录同步状态。
  // 这里刻意不提前写 lastSyncedHash：推送失败时保持旧状态，
  // 下次启动会重新识别为冲突并询问用户，而不是把本地结果当成已同步再被云端覆盖。
  updateLocalSyncState({ localUpdatedAt: Date.now() })
  const pushResult = await pushToRemote(applied, appliedHash, remoteMeta.revision, action)
  return { ...pushResult, action, localDiff }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

export const performSync = async(options: SyncOptions): Promise<LX.WebDAVSync.SyncResult> => {
  try {
    return await runSync(options)
  } catch (err: any) {
    console.error('WebDAV sync error:', err)
    return {
      status: 'error',
      message: `同步失败：${String(err?.message ?? err)}，已保留本地歌单`,
    }
  }
}

const runSync = async(options: SyncOptions): Promise<LX.WebDAVSync.SyncResult> => {
  if (!isWebDAVConfigured()) {
    return { status: 'skipped', message: 'WebDAV 未配置，已跳过同步' }
  }

  // 区分「云端没有歌单」和「云端连不上」：后者必须放弃本次同步，
  // 否则会把云端当成空的，然后用本地数据覆盖掉真实存在的云端歌单
  if (!await checkRemoteReachable()) {
    return { status: 'skipped', message: '云端不可用，继续使用本地歌单，等待下次同步' }
  }

  const localListData = await getLocalListData()
  const localHash = toContentHash(localListData)
  const state = getLocalSyncState()
  const remoteMeta = await getRemoteMetadata()

  // 云端还没有数据，直接推送
  if (!remoteMeta) {
    return pushToRemote(localListData, localHash, null, 'push')
  }

  // 两端内容完全一致，只需要把本地状态对齐
  if (remoteMeta.contentHash == localHash) {
    updateLocalSyncState({
      lastSyncedHash: localHash,
      lastSyncedRevision: remoteMeta.revision,
      lastSyncTime: Date.now(),
    })
    return { status: 'noop', message: '歌单已是最新，无需同步' }
  }

  const localChanged = localHash != state.lastSyncedHash
  const remoteChanged = remoteMeta.contentHash != state.lastSyncedHash

  // 仅云端有改动
  if (!localChanged && remoteChanged) {
    const remoteListData = fromWireFormat(await downloadPlayListData())
    if (!remoteListData) {
      return { status: 'error', message: '云端歌单格式无法识别，已跳过同步' }
    }
    return applyToLocal(localListData, remoteListData, remoteMeta, 'pull')
  }

  // 仅本地有改动
  if (localChanged && !remoteChanged) {
    return pushToRemote(localListData, localHash, remoteMeta.revision, 'push')
  }

  // 两端都有改动：冲突
  if (!options.interactive || !options.onConflict) {
    return {
      status: 'conflict',
      message: '本地与云端都有改动，已保留两边数据，将在下次启动时询问处理方式',
    }
  }

  const remoteListData = fromWireFormat(await downloadPlayListData())
  if (!remoteListData) {
    return { status: 'error', message: '云端歌单格式无法识别，已跳过同步' }
  }

  const merged = mergeListData(cloneListData(localListData), cloneListData(remoteListData))

  const choice = await options.onConflict({
    localTime: state.localUpdatedAt,
    remoteTime: remoteMeta.updatedAt,
    remoteDeviceName: remoteMeta.deviceName || '未知设备',
    preview: {
      // 保留本地 → 云端将发生的变更
      use_local: calcListDiff(remoteListData, localListData),
      // 使用云端 → 本地将发生的变更
      use_remote: calcListDiff(localListData, remoteListData),
      // 合并 → 本地将发生的变更
      merge: calcListDiff(localListData, merged),
    },
  })

  switch (choice) {
    case 'use_local':
      return pushToRemote(localListData, localHash, remoteMeta.revision, 'use_local')

    case 'use_remote':
      return applyToLocal(localListData, remoteListData, remoteMeta, 'use_remote')

    case 'use_newest':
      return state.localUpdatedAt >= remoteMeta.updatedAt
        ? pushToRemote(localListData, localHash, remoteMeta.revision, 'use_local')
        : applyToLocal(localListData, remoteListData, remoteMeta, 'use_remote')

    case 'merge':
      // 合并结果必然与云端不同，applyToLocal 内部会把它推回云端
      return applyToLocal(localListData, merged, remoteMeta, 'merge')

    case 'cancel':
    default:
      return { status: 'conflict', message: '已取消本次同步，两边数据均未改动' }
  }
}
