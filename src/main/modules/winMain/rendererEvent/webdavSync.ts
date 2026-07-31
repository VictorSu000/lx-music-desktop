import { mainHandle } from '@common/mainIpc'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { handleRendererAction } from '@main/modules/webdavSync'
import { sendEvent } from '../main'

export default () => {
  mainHandle<LX.WebDAVSync.RendererActions>(WIN_MAIN_RENDERER_EVENT_NAME.webdav_sync_action, async({ params: data }) => {
    await handleRendererAction(data)
  })
}

export const sendWebdavSyncAction = (data: LX.WebDAVSync.MainWindowActions) => {
  sendEvent(WIN_MAIN_RENDERER_EVENT_NAME.webdav_sync_action, data)
}
