import { LIST_IDS } from '@common/constants'

const toBrief = (music: LX.Music.MusicInfo): LX.WebDAVSync.MusicBrief => ({
  id: music.id,
  name: music.name,
  singer: music.singer,
})

/** 单条列表的增删对比 */
const diffMusicList = (
  before: LX.Music.MusicInfo[],
  after: LX.Music.MusicInfo[],
): { added: LX.WebDAVSync.MusicBrief[], removed: LX.WebDAVSync.MusicBrief[] } => {
  const beforeIds = new Set(before.map(m => m.id))
  const afterIds = new Set(after.map(m => m.id))
  return {
    added: after.filter(m => !beforeIds.has(m.id)).map(toBrief),
    removed: before.filter(m => !afterIds.has(m.id)).map(toBrief),
  }
}

const pushIfChanged = (
  diff: LX.WebDAVSync.ListDataDiff,
  id: string,
  name: string,
  before: LX.Music.MusicInfo[],
  after: LX.Music.MusicInfo[],
) => {
  const { added, removed } = diffMusicList(before, after)
  if (!added.length && !removed.length) return
  diff.changedLists.push({ id, name, added, removed })
  diff.totalAdded += added.length
  diff.totalRemoved += removed.length
}

/**
 * 对比同步前后的歌单数据，产出用于告知用户「做了哪些变更」的结构化结果
 */
export const calcListDiff = (
  before: LX.Sync.List.ListData,
  after: LX.Sync.List.ListData,
): LX.WebDAVSync.ListDataDiff => {
  const diff: LX.WebDAVSync.ListDataDiff = {
    addedLists: [],
    removedLists: [],
    changedLists: [],
    totalAdded: 0,
    totalRemoved: 0,
    isEmpty: true,
  }

  pushIfChanged(diff, LIST_IDS.DEFAULT, '', before.defaultList, after.defaultList)
  pushIfChanged(diff, LIST_IDS.LOVE, '', before.loveList, after.loveList)

  const beforeUserLists = new Map(before.userList.map(l => [l.id, l]))
  const afterUserLists = new Map(after.userList.map(l => [l.id, l]))

  for (const list of after.userList) {
    const prev = beforeUserLists.get(list.id)
    if (prev) {
      pushIfChanged(diff, list.id, list.name, prev.list, list.list)
    } else {
      diff.addedLists.push({ id: list.id, name: list.name, count: list.list.length })
      diff.totalAdded += list.list.length
    }
  }

  for (const list of before.userList) {
    if (afterUserLists.has(list.id)) continue
    diff.removedLists.push({ id: list.id, name: list.name, count: list.list.length })
    diff.totalRemoved += list.list.length
  }

  diff.isEmpty = !diff.addedLists.length && !diff.removedLists.length && !diff.changedLists.length

  return diff
}
