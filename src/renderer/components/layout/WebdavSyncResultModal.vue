<template>
  <material-modal :show="webdavSync.result.isShow" max-width="560px" @close="handleClose">
    <main v-if="result" :class="$style.main">
      <h2>{{ isError ? $t('webdav_sync__result_error_title') : $t('webdav_sync__result_title') }}</h2>

      <p v-if="result.message" :class="$style.message">{{ result.message }}</p>

      <div class="scroll" :class="$style.content">
        <section v-if="hasLocalDiff" :class="$style.section">
          <h3 :class="$style.sectionTitle">{{ $t('webdav_sync__result_local') }}</h3>
          <layout-webdav-sync-diff :diff="result.localDiff" />
        </section>
        <section v-if="hasRemoteDiff" :class="$style.section">
          <h3 :class="$style.sectionTitle">{{ $t('webdav_sync__result_remote') }}</h3>
          <layout-webdav-sync-diff :diff="result.remoteDiff" />
        </section>
      </div>

      <div :class="$style.footer">
        <base-btn @click="handleClose">{{ $t('alert_button_text') }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script>
import { computed } from '@common/utils/vueTools'
import { webdavSync } from '@renderer/store'

export default {
  setup() {
    const result = computed(() => webdavSync.result.data)

    const isError = computed(() => result.value?.status === 'error')
    const hasLocalDiff = computed(() => Boolean(result.value?.localDiff && !result.value.localDiff.isEmpty))
    const hasRemoteDiff = computed(() => Boolean(result.value?.remoteDiff && !result.value.remoteDiff.isEmpty))

    const handleClose = () => {
      webdavSync.result.isShow = false
      webdavSync.result.data = null
    }

    return {
      webdavSync,
      result,
      isError,
      hasLocalDiff,
      hasRemoteDiff,
      handleClose,
    }
  },
}
</script>

<style lang="less" module>
.main {
  padding: 15px;
  min-width: 200px;
  min-height: 0;
  display: flex;
  flex-flow: column nowrap;

  h2 {
    font-size: 16px;
    color: var(--color-font);
    line-height: 1.3;
    text-align: center;
  }
}

.message {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-font-label);
  line-height: 1.5;
  text-align: center;
}

.content {
  flex: auto;
  max-height: 360px;
  margin-top: 12px;
  padding-right: 5px;
}

.section {
  + .section {
    margin-top: 14px;
  }
}

.sectionTitle {
  font-size: 13px;
  color: var(--color-font-label);
  margin-bottom: 6px;
}

.footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
