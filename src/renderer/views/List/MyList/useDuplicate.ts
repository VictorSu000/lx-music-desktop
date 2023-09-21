import { ref, reactive } from '@common/utils/vueTools'


export default () => {
  const isShowDuplicateMusicModal = ref(false)
  const duplicateListInfo = reactive({ id: '', name: '', flagDupAll: false })

  const handleDuplicateList = (listInfo: LX.List.MyListInfo) => {
    duplicateListInfo.id = listInfo.id
    duplicateListInfo.name = listInfo.name
    duplicateListInfo.flagDupAll = listInfo.flagDupAll ? true : false // 处理flagDupAll可以为undefined的情形（其实应该有更好的处理办法）
    isShowDuplicateMusicModal.value = true
  }

  return {
    isShowDuplicateMusicModal,
    duplicateListInfo,
    handleDuplicateList,
  }
}
