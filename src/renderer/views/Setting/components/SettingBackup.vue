<template lang="pug">
dt#backup {{ $t('setting__backup') }}
dd
  h3#backup_part {{ $t('setting__backup_part') }}
  div
    base-btn.btn.gap-left(min @click="handleImportPlayList") {{ $t('setting__backup_part_import_list') }}
    base-btn.btn.gap-left(min @click="handleExportPlayList") {{ $t('setting__backup_part_export_list') }}
    base-btn.btn.gap-left(min @click="handleImportSetting") {{ $t('setting__backup_part_import_setting') }}
    base-btn.btn.gap-left(min @click="handleExportSetting") {{ $t('setting__backup_part_export_setting') }}
    base-btn.btn.gap-left(min @click="handleImportPlayListFromWeb") {{ '从网盘导入歌单' }}
    base-btn.btn.gap-left(min @click="handleExportPlayListToWeb") {{ '导出歌单到网盘' }}
dd
  h3#backup_all {{ $t('setting__backup_all') }}
  div
    base-btn.btn.gap-left(min @click="handleImportAllData") {{ $t('setting__backup_all_import') }}
    base-btn.btn.gap-left(min @click="handleExportAllData") {{$t('setting__backup_all_export')}}
dd
  h3#backup_other {{ $t('setting__backup_other') }}
  div
    base-btn.btn.gap-left(min @click="handleExportPlayListToText") {{ $t('setting__backup_other_export_list_text') }}
    base-btn.btn.gap-left(min @click="handleExportPlayListToCsv") {{$t('setting__backup_other_export_list_csv')}}
</template>

<script>
import { toRaw } from '@common/utils/vueTools'
// import { mergeSetting } from '@common/utils'
// import { base as eventBaseName } from '@renderer/event/names'
// import { defaultList, loveList, userLists } from '@renderer/core/share/list'
import {
  toNewMusicInfo,
  // toOldMusicInfo,
  filterMusicList,
  fixNewMusicInfoQuality,
} from '@renderer/utils'
import {
  showSelectDialog,
  openSaveDir,
} from '@renderer/utils/ipc'
// import { currentStting } from '../setting'
import { dialog } from '@renderer/plugins/Dialog'
import useImportTip from '@renderer/utils/compositions/useImportTip'
import { useI18n } from '@renderer/plugins/i18n'
import { getListMusics, overwriteListFull, overwriteListMusics } from '@renderer/store/list/action'
import { LIST_IDS } from '@common/constants'
import { defaultList, loveList, userLists } from '@renderer/store/list/state'
import { appSetting, updateSetting } from '@renderer/store/setting'
import migrateSetting from '@common/utils/migrateSetting'
import { saveLxConfigFileWebDAV, readLxConfigFileWebDAV } from '@common/utils/webdav'


export default {
  name: 'SettingUpdate',
  setup() {
    const t = useI18n()
    // const setting = useRefGetter('setting')
    // const settingVersion = useRefGetter('settingVersion')
    // const setSettingVersion = useCommit('setSettingVersion')
    // const setList = useCommit('list', 'setList')
    const showImportTip = useImportTip()

    const getAllLists = async() => {
      const lists = []
      lists.push(await getListMusics(defaultList.id).then(musics => ({ ...defaultList, list: toRaw(musics) })))
      lists.push(await getListMusics(loveList.id).then(musics => ({ ...loveList, list: toRaw(musics) })))

      for await (const list of userLists) {
        lists.push(await getListMusics(list.id).then(musics => ({ ...toRaw(list), list: toRaw(musics) })))
      }

      return lists
    }

    const importOldListData = async(lists) => {
      const allLists = await getAllLists()
      for (const list of lists) {
        try {
          const targetList = allLists.find(l => l.id == list.id)
          if (targetList) {
            targetList.list = filterMusicList(list.list.map(m => toNewMusicInfo(m)))
          } else {
            allLists.push({
              name: list.name,
              id: list.id,
              list: filterMusicList(list.list.map(m => toNewMusicInfo(m))),
              source: list.source,
              sourceListId: list.sourceListId,
              locationUpdateTime: list.locationUpdateTime ?? null,
            })
          }
        } catch (err) {
          console.log(err)
        }
      }
      const defaultList = allLists.shift().list
      const loveList = allLists.shift().list
      await overwriteListFull({ defaultList, loveList, userList: allLists })
    }
    const importNewListData = async(lists) => {
      const allLists = await getAllLists()
      for (const list of lists) {
        try {
          const targetList = allLists.find(l => l.id == list.id)
          if (targetList) {
            targetList.list = filterMusicList(list.list).map(m => fixNewMusicInfoQuality(m))
          } else {
            allLists.push({
              name: list.name,
              id: list.id,
              list: filterMusicList(list.list).map(m => fixNewMusicInfoQuality(m)),
              source: list.source,
              sourceListId: list.sourceListId,
              locationUpdateTime: list.locationUpdateTime ?? null,
            })
          }
        } catch (err) {
          console.log(err)
        }
      }
      const defaultList = allLists.shift().list
      const loveList = allLists.shift().list
      await overwriteListFull({ defaultList, loveList, userList: allLists })
    }
    const importOldSettingData = (setting) => {
      console.log(setting)
      setting = migrateSetting(setting)
      setting['common.isAgreePact'] = false
      updateSetting(setting)
    }
    const importNewSettingData = (setting) => {
      setting['common.isAgreePact'] = false
      updateSetting(setting)
    }


    const importAllData = async(path) => {
      let allData
      try {
        allData = await window.lx.worker.main.readLxConfigFile(path)
      } catch (error) {
        return
      }

      switch (allData.type) {
        case 'allData':
          // 兼容0.6.2及以前版本的列表数据
          if (allData.defaultList) await overwriteListMusics({ listId: LIST_IDS.DEFAULT, musicInfos: filterMusicList(allData.defaultList.list.map(m => toNewMusicInfo(m))) })
          else await importOldListData(allData.playList)
          importOldSettingData(allData.setting)
          break
        case 'allData_v2':
          await importNewListData(allData.playList)
          importNewSettingData(allData.setting)
          break
        default: return showImportTip(allData.type)
      }
    }
    const handleImportAllData = () => {
      showSelectDialog({
        title: t('setting__backup_all_import_desc'),
        properties: ['openFile'],
        filters: [
          { name: 'Setting', extensions: ['json', 'lxmc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled) return
        dialog.confirm({
          message: t('setting__backup_part_import_list_confirm'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        }).then(confirm => {
          if (!confirm) return
          importAllData(result.filePaths[0])
        })
      })
    }

    const exportAllData = async(path) => {
      let allData = {
        type: 'allData_v2',
        setting: { ...appSetting },
        playList: await getAllLists(),
      }
      window.lx.worker.main.saveLxConfigFile(path, allData)
    }
    const handleExportAllData = () => {
      openSaveDir({
        title: t('setting__backup_all_export_desc'),
        defaultPath: 'lx_datas_v2.lxmc',
      }).then(result => {
        if (result.canceled) return
        exportAllData(result.filePath)
      })
    }

    const exportSetting = (path) => {
      const data = {
        type: 'setting_v2',
        data: { ...appSetting },
      }
      window.lx.worker.main.saveLxConfigFile(path, data)
    }
    const handleExportSetting = () => {
      openSaveDir({
        title: t('setting__backup_part_export_setting_desc'),
        defaultPath: 'lx_setting_v2.lxmc',
      }).then(result => {
        if (result.canceled) return
        exportSetting(result.filePath)
      })
    }

    const importSetting = async(path) => {
      let settingData
      try {
        settingData = await window.lx.worker.main.readLxConfigFile(path)
      } catch (error) {
        return
      }

      switch (settingData.type) {
        case 'setting':
          importOldSettingData(settingData.data)
          break
        case 'setting_v2':
          importNewSettingData(settingData.data)
          break
        default: return showImportTip(settingData.type)
      }
    }
    const handleImportSetting = () => {
      showSelectDialog({
        title: t('setting__backup_part_import_setting_desc'),
        properties: ['openFile'],
        filters: [
          { name: 'Setting', extensions: ['json', 'lxmc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled) return
        importSetting(result.filePaths[0])
      })
    }

    const exportPlayList = async(path) => {
      const data = {
        type: 'playList_v2',
        data: await getAllLists(),
      }
      window.lx.worker.main.saveLxConfigFile(path, data)
    }
    const handleExportPlayList = () => {
      openSaveDir({
        title: t('setting__backup_part_export_list_desc'),
        defaultPath: 'lx_list.lxmc',
      }).then(result => {
        if (result.canceled) return
        exportPlayList(result.filePath)
      })
    }

    const handleExportPlayListToWeb = async() => {
      const data = {
        type: 'playList_v2',
        data: await getAllLists(),
      }
      saveLxConfigFileWebDAV(data, (message) => { dialog({ message, confirmButtonText: '好的' }) })
    }

    const handleImportPlayListFromWeb = async() => {
      // 导入前先备份一次
      const dateStr = new Date().toLocaleString('zh', {
        hour12: false,
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).replace(/\/|:|\s/g, '-')

      const backupPath = `./lx_list_${dateStr}.bak.lxmc`
      console.log('backup playlist before import from webDAV:', backupPath)
      await exportPlayList(backupPath)

      let listData
      try {
        listData = await readLxConfigFileWebDAV()
      } catch (error) {
        dialog({ message: '导入云端歌单失败，' + error, confirmButtonText: '好的' })
      }

      if (await doImportPlayList(listData) === null) {
        dialog({ message: '导入云端歌单成功', confirmButtonText: '好的' })
      }
    }

    const doImportPlayList = async(listData) => {
      switch (listData.type) {
        case 'defautlList': // 兼容0.6.2及以前版本的列表数据
          await overwriteListMusics({ listId: LIST_IDS.DEFAULT, musicInfos: filterMusicList(listData.data.list.map(m => toNewMusicInfo(m))) })
          break
        case 'playList':
          await importOldListData(listData.data)
          break
        case 'playList_v2':
          await importNewListData(listData.data)
          break
        default:
          console.error('listData.type', listData.type)
          return showImportTip(listData.type)
      }
      return null
    }

    const importPlayList = async(path) => {
      let listData
      try {
        listData = await window.lx.worker.main.readLxConfigFile(path)
      } catch (error) {
        return
      }
      console.log(listData.type)

      doImportPlayList()
    }
    const handleImportPlayList = () => {
      showSelectDialog({
        title: t('setting__backup_part_import_list_desc'),
        properties: ['openFile'],
        filters: [
          { name: 'Play List', extensions: ['json', 'lxmc'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      }).then(result => {
        if (result.canceled) return
        dialog.confirm({
          message: t('setting__backup_part_import_list_confirm'),
          cancelButtonText: t('cancel_button_text'),
          confirmButtonText: t('confirm_button_text'),
        }).then(confirm => {
          if (!confirm) return
          importPlayList(result.filePaths[0])
        })
      })
    }

    const exportPlayListToText = async(savePath, isMerge) => {
      const lists = await getAllLists()
      await window.lx.worker.main.exportPlayListToText(savePath, lists, isMerge)
    }
    const handleExportPlayListToText = async() => {
      const confirm = await dialog.confirm({
        message: t('setting__backup_other_export_list_text_confirm'),
        cancelButtonText: t('cancel_button_text'),
        confirmButtonText: t('confirm_button_text'),
      })
      if (confirm) {
        openSaveDir({
          title: t('setting__backup_other_export_dir'),
          defaultPath: 'lx_list_all.txt',
        }).then(result => {
          if (result.canceled) return
          let path = result.filePath
          if (!path.endsWith('.txt')) path += '.txt'
          exportPlayListToText(path, true)
        })
      } else {
        showSelectDialog({
          title: t('setting__backup_other_export_dir'),
          // defaultPath: currentStting.value.download.savePath,
          properties: ['openDirectory'],
        }).then(result => {
          if (result.canceled) return
          exportPlayListToText(result.filePaths[0], false)
        })
      }
    }

    const exportPlayListToCsv = async(savePath, isMerge) => {
      const lists = await getAllLists()
      await window.lx.worker.main.exportPlayListToCSV(savePath, lists, isMerge, `${t('music_name')},${t('music_singer')},${t('music_album')}\n`)
    }
    const handleExportPlayListToCsv = async() => {
      const confirm = await dialog.confirm({
        message: t('setting__backup_other_export_list_text_confirm'),
        cancelButtonText: t('cancel_button_text'),
        confirmButtonText: t('confirm_button_text'),
      })
      if (confirm) {
        openSaveDir({
          title: t('setting__backup_other_export_dir'),
          defaultPath: 'lx_list_all.csv',
        }).then(result => {
          if (result.canceled) return
          let path = result.filePath
          if (!path.endsWith('.csv')) path += '.csv'
          exportPlayListToCsv(path, true)
        })
      } else {
        showSelectDialog({
          title: t('setting__backup_other_export_dir'),
          // defaultPath: currentStting.value.download.savePath,
          properties: ['openDirectory'],
        }).then(result => {
          if (result.canceled) return
          exportPlayListToCsv(result.filePaths[0], false)
        })
      }
    }

    // window.eventHub.on(eventBaseName.set_config, handleUpdateSetting)

    // onBeforeUnmount(() => {
    //   window.eventHub.off(eventBaseName.set_config, handleUpdateSetting)
    // })

    return {
      // currentStting,
      handleExportPlayList,
      handleImportPlayList,
      handleImportPlayListFromWeb,
      handleExportPlayListToWeb,
      handleExportSetting,
      handleImportSetting,
      handleExportAllData,
      handleImportAllData,
      handleExportPlayListToText,
      handleExportPlayListToCsv,
    }
  },
}
</script>

<style lang="less" module>
.save-path {
  font-size: 12px;
}
</style>
