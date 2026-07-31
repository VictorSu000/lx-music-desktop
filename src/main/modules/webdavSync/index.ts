import { app } from 'electron'
import { isExistWindow, sendWebdavSyncAction } from '@main/modules/winMain'
import { performSync, markLocalListChanged, type SyncOptions, type ConflictResolver } from './sync'

export { markLocalListChanged }

/** 等待用户在冲突对话框做出选择的超时时间 */
const CONFLICT_TIMEOUT = 5 * 60 * 1000
/** 退出前同步的最长等待时间，超时就放行退出，避免卡住关闭流程 */
const QUIT_SYNC_TIMEOUT = 8000

let isInitialized = false
let syncing: Promise<LX.WebDAVSync.SyncResult> | null = null
let isQuitSyncStarted = false
let requestSeq = 0

const conflictResolvers = new Map<string, (choice: LX.WebDAVSync.ConflictChoice) => void>()

const requestConflictResolution: ConflictResolver = async(conflict) => {
  if (!isExistWindow()) return 'cancel'

  const requestId = `webdav_sync_${++requestSeq}`

  return new Promise<LX.WebDAVSync.ConflictChoice>(resolve => {
    let settled = false
    const finish = (choice: LX.WebDAVSync.ConflictChoice) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      conflictResolvers.delete(requestId)
      resolve(choice)
    }

    const timer = setTimeout(() => {
      sendWebdavSyncAction({ action: 'close_conflict', data: { requestId } })
      finish('cancel')
    }, CONFLICT_TIMEOUT)

    conflictResolvers.set(requestId, finish)
    sendWebdavSyncAction({ action: 'request_conflict', data: { requestId, conflict } })
  })
}

/**
 * 只有产生了实质变更（或同步中途出错）才打扰用户；
 * 云端不可达、无变更等情况只记日志。
 */
const shouldNotify = (result: LX.WebDAVSync.SyncResult): boolean => {
  if (result.status == 'error') return true
  if (result.status != 'synced') return false
  return Boolean(result.localDiff && !result.localDiff.isEmpty) ||
    Boolean(result.remoteDiff && !result.remoteDiff.isEmpty)
}

const runSync = async(options: SyncOptions): Promise<LX.WebDAVSync.SyncResult> => {
  // 同一时刻只允许一个同步任务，重复触发时复用进行中的那个
  if (syncing) return syncing

  syncing = performSync(options).finally(() => { syncing = null })
  const result = await syncing

  console.log('[webdavSync]', result.status, result.action ?? '', result.message ?? '')
  if (shouldNotify(result)) sendWebdavSyncAction({ action: 'sync_result', data: result })

  return result
}

export const handleRendererAction = async(action: LX.WebDAVSync.RendererActions): Promise<void> => {
  switch (action.action) {
    case 'resolve_conflict':
      conflictResolvers.get(action.data.requestId)?.(action.data.choice)
      break
    case 'trigger_sync':
      await runSync({ interactive: true, onConflict: requestConflictResolution })
      break
  }
}

export default () => {
  if (isInitialized) return
  isInitialized = true

  // 主窗口就绪后同步一次：此时渲染进程已注册好监听，冲突对话框才能弹出来
  global.lx.event_app.on('main_window_inited', () => {
    void runSync({ interactive: true, onConflict: requestConflictResolution })
  })

  // 歌单变更时记录时间，供「使用最新时间」策略使用
  global.lx.event_list.on('list_changed', () => {
    markLocalListChanged()
  })

  // 退出前把本地改动推上去。必须 preventDefault，否则 Electron 不会等异步任务完成
  app.on('before-quit', event => {
    if (isQuitSyncStarted) return
    isQuitSyncStarted = true
    event.preventDefault()

    console.log('[webdavSync] syncing before quit')
    void Promise.race([
      // 退出流程中窗口可能已经不可用，不弹冲突框；
      // 冲突会被原样保留，等下次启动再询问用户
      runSync({ interactive: false }),
      new Promise(resolve => setTimeout(resolve, QUIT_SYNC_TIMEOUT)),
    ]).catch(err => {
      console.error('[webdavSync] pre-quit sync error:', err)
    }).finally(() => {
      app.quit()
    })
  })
}
