declare namespace LX {
  namespace WebDAVSync {
    /** 实际执行的同步动作 */
    type Action = 'push' | 'pull' | 'merge' | 'use_local' | 'use_remote'

    /** 冲突时用户可选的处理方式 */
    type ConflictChoice = 'use_newest' | 'use_local' | 'use_remote' | 'merge' | 'cancel'

    type Status = 'noop' | 'synced' | 'conflict' | 'skipped' | 'error'

    interface MusicBrief {
      id: string
      name: string
      singer: string
    }

    interface ListSummary {
      id: string
      name: string
      count: number
    }

    interface ChangedListDiff {
      id: string
      /** 用户列表的名称；默认列表与我喜欢为空，由渲染进程按 id 取本地化名称 */
      name: string
      added: MusicBrief[]
      removed: MusicBrief[]
    }

    interface ListDataDiff {
      addedLists: ListSummary[]
      removedLists: ListSummary[]
      changedLists: ChangedListDiff[]
      totalAdded: number
      totalRemoved: number
      isEmpty: boolean
    }

    interface ConflictInfo {
      /** 本地歌单最后一次改动的时间 */
      localTime: number
      /** 云端歌单最后一次改动的时间（由写入方的时钟生成） */
      remoteTime: number
      remoteDeviceName: string
      /**
       * 各处理方式分别会造成什么变更，供用户决策前预览。
       * use_local 是云端将发生的变更，其余两项是本地将发生的变更。
       */
      preview: {
        use_local: ListDataDiff
        use_remote: ListDataDiff
        merge: ListDataDiff
      }
    }

    interface SyncResult {
      status: Status
      action?: Action
      /** 本地歌单发生的变更 */
      localDiff?: ListDataDiff
      /** 云端歌单发生的变更 */
      remoteDiff?: ListDataDiff
      message?: string
    }

    type MainWindowActions = {
      action: 'request_conflict'
      data: { requestId: string, conflict: ConflictInfo }
    } | {
      action: 'close_conflict'
      data: { requestId: string }
    } | {
      action: 'sync_result'
      data: SyncResult
    }

    type RendererActions = {
      action: 'resolve_conflict'
      data: { requestId: string, choice: ConflictChoice }
    } | {
      action: 'trigger_sync'
      data?: undefined
    }
  }
}
