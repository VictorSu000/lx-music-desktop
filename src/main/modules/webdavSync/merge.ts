/**
 * 歌单合并算法。
 *
 * 直接沿用局域网同步模块 `sync/server/modules/list/sync/sync.ts` 中
 * `handleMergeList` / `mergeList` 的语义（按 id 去重、尊重
 * `list.addMusicLocationType` 的插入位置、按 locationUpdateTime 调整列表顺序），
 * 只是把 socket / 用户配置的依赖换成了本机 appSetting。
 */

const mergeMusicList = (
  sourceList: LX.Music.MusicInfo[],
  targetList: LX.Music.MusicInfo[],
  addMusicLocationType: LX.AddMusicLocationType,
): LX.Music.MusicInfo[] => {
  const map = new Map<string | number, LX.Music.MusicInfo>()
  const ids: Array<string | number> = []
  let newList: LX.Music.MusicInfo[]

  switch (addMusicLocationType) {
    case 'top':
      newList = [...targetList, ...sourceList]
      for (let i = newList.length - 1; i > -1; i--) {
        const item = newList[i]
        if (map.has(item.id)) continue
        ids.unshift(item.id)
        map.set(item.id, item)
      }
      break
    case 'bottom':
    default:
      newList = [...sourceList, ...targetList]
      for (const item of newList) {
        if (map.has(item.id)) continue
        ids.push(item.id)
        map.set(item.id, item)
      }
      break
  }

  return ids.map(id => map.get(id)) as LX.Music.MusicInfo[]
}

/**
 * 以 sourceListData 为主体合并 targetListData
 */
export const mergeListData = (
  sourceListData: LX.Sync.List.ListData,
  targetListData: LX.Sync.List.ListData,
): LX.Sync.List.ListData => {
  const addMusicLocationType = global.lx.appSetting['list.addMusicLocationType']

  const newListData: LX.Sync.List.ListData = {
    defaultList: mergeMusicList(sourceListData.defaultList, targetListData.defaultList, addMusicLocationType),
    loveList: mergeMusicList(sourceListData.loveList, targetListData.loveList, addMusicLocationType),
    userList: [...sourceListData.userList],
  }

  const sourceUserLists = new Map<string, LX.List.UserListInfoFull>()
  for (const list of sourceListData.userList) sourceUserLists.set(list.id, list)

  targetListData.userList.forEach((list, index) => {
    const targetUpdateTime = list?.locationUpdateTime ?? 0
    const sourceList = sourceUserLists.get(list.id)
    if (sourceList) {
      sourceList.list = mergeMusicList(sourceList.list, list.list, addMusicLocationType)

      const sourceUpdateTime = sourceList?.locationUpdateTime ?? 0
      if (targetUpdateTime >= sourceUpdateTime) return
      // 调整位置
      const [newList] = newListData.userList.splice(newListData.userList.findIndex(l => l.id == list.id), 1)
      newList.locationUpdateTime = targetUpdateTime
      newListData.userList.splice(index, 0, newList)
    } else {
      if (targetUpdateTime) {
        newListData.userList.splice(index, 0, list)
      } else {
        newListData.userList.push(list)
      }
    }
  })

  return newListData
}
