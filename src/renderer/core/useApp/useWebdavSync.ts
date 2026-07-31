import { onBeforeUnmount } from '@common/utils/vueTools'
import { onWebdavSyncAction } from '@renderer/utils/ipc'
import { webdavSync } from '@renderer/store'

export default () => {
  const handleAction = (action: LX.WebDAVSync.MainWindowActions) => {
    switch (action.action) {
      case 'request_conflict':
        webdavSync.conflict.requestId = action.data.requestId
        webdavSync.conflict.info = action.data.conflict
        webdavSync.conflict.isShow = true
        break
      case 'close_conflict':
        // 主进程等待超时，对话框已失效
        if (webdavSync.conflict.requestId != action.data.requestId) break
        webdavSync.conflict.isShow = false
        webdavSync.conflict.info = null
        webdavSync.conflict.requestId = ''
        break
      case 'sync_result':
        webdavSync.result.data = action.data
        webdavSync.result.isShow = true
        break
    }
  }

  const removeListener = onWebdavSyncAction(({ params }) => {
    handleAction(params)
  })

  onBeforeUnmount(() => {
    removeListener()
  })
}
