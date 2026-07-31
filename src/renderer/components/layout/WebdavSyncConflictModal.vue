<template>
  <material-modal :show="webdavSync.conflict.isShow" :bg-close="false" :close-btn="false" max-width="700px">
    <main v-if="info" :class="$style.main">
      <h2>{{ $t('webdav_sync__conflict_title') }}</h2>
      <p :class="$style.desc">{{ $t('webdav_sync__conflict_desc', { name: info.remoteDeviceName }) }}</p>

      <div :class="$style.times">
        <div :class="$style.timeItem">
          <span :class="$style.timeLabel">{{ $t('webdav_sync__local_time') }}</span>
          <span :class="$style.timeValue">{{ formatTime(info.localTime) }}</span>
        </div>
        <div :class="$style.timeItem">
          <span :class="$style.timeLabel">{{ $t('webdav_sync__remote_time') }}</span>
          <span :class="$style.timeValue">{{ formatTime(info.remoteTime) }}</span>
        </div>
      </div>

      <div :class="$style.body">
        <div :class="$style.choices">
          <div
            v-for="choice in choices" :key="choice.value"
            :class="[$style.choice, selected === choice.value ? $style.choiceActive : '']"
            @click="selected = choice.value"
          >
            <div :class="$style.choiceTitle">{{ $t(choice.title) }}</div>
            <div :class="$style.choiceDesc">{{ $t(choice.desc) }}</div>
          </div>
        </div>

        <div :class="$style.preview">
          <h3 :class="$style.previewLabel">{{ previewLabel }}</h3>
          <div class="scroll" :class="$style.previewBody">
            <layout-webdav-sync-diff :diff="previewDiff" />
          </div>
        </div>
      </div>

      <p :class="$style.tip">{{ $t('webdav_sync__time_tip') }}</p>
      <p :class="$style.tip">{{ $t('webdav_sync__backup_tip') }}</p>

      <div :class="$style.footer">
        <base-btn :disabled="!selected" @click="handleConfirm">{{ $t('confirm_button_text') }}</base-btn>
      </div>
    </main>
  </material-modal>
</template>

<script>
import { ref, computed, watch } from '@common/utils/vueTools'
import { webdavSync } from '@renderer/store'
import { sendWebdavSyncAction } from '@renderer/utils/ipc'
import { useI18n } from '@renderer/plugins/i18n'

const choices = [
  { value: 'use_newest', title: 'webdav_sync__choice_newest', desc: 'webdav_sync__choice_newest_desc' },
  { value: 'use_local', title: 'webdav_sync__choice_local', desc: 'webdav_sync__choice_local_desc' },
  { value: 'use_remote', title: 'webdav_sync__choice_remote', desc: 'webdav_sync__choice_remote_desc' },
  { value: 'merge', title: 'webdav_sync__choice_merge', desc: 'webdav_sync__choice_merge_desc' },
  { value: 'cancel', title: 'webdav_sync__choice_cancel', desc: 'webdav_sync__choice_cancel_desc' },
]

export default {
  setup() {
    const t = useI18n()
    const selected = ref('')

    const info = computed(() => webdavSync.conflict.info)

    // 每次弹出时重置选择，避免沿用上一次的结果
    watch(() => webdavSync.conflict.isShow, isShow => {
      if (isShow) selected.value = ''
    })

    const formatTime = (timestamp) => {
      if (!timestamp) return t('webdav_sync__time_unknown')
      return new Date(timestamp).toLocaleString()
    }

    // 「使用最新时间」最终落到哪一边，取决于两个时间戳的比较结果
    const resolvedChoice = computed(() => {
      if (selected.value !== 'use_newest') return selected.value
      if (!info.value) return ''
      return info.value.localTime >= info.value.remoteTime ? 'use_local' : 'use_remote'
    })

    const previewDiff = computed(() => {
      if (!info.value) return null
      switch (resolvedChoice.value) {
        case 'use_local': return info.value.preview.use_local
        case 'use_remote': return info.value.preview.use_remote
        case 'merge': return info.value.preview.merge
        default: return null
      }
    })

    const previewLabel = computed(() => {
      // 保留本地是把本地推上云端，变的是云端；其余两种变的是本地
      if (resolvedChoice.value === 'use_local') return t('webdav_sync__preview_remote')
      if (resolvedChoice.value === 'use_remote' || resolvedChoice.value === 'merge') return t('webdav_sync__preview_local')
      return t('webdav_sync__preview_label')
    })

    const handleConfirm = () => {
      if (!selected.value) return
      void sendWebdavSyncAction({
        action: 'resolve_conflict',
        data: { requestId: webdavSync.conflict.requestId, choice: selected.value },
      })
      webdavSync.conflict.isShow = false
      webdavSync.conflict.info = null
      webdavSync.conflict.requestId = ''
    }

    return {
      webdavSync,
      info,
      choices,
      selected,
      previewDiff,
      previewLabel,
      formatTime,
      handleConfirm,
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

.desc {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-font-label);
  line-height: 1.5;
  text-align: center;
}

.times {
  display: flex;
  gap: 15px;
  margin-top: 12px;
  padding: 10px;
  border-radius: 4px;
  background-color: var(--color-primary-alpha-900);
}

.timeItem {
  flex: 1;
  min-width: 0;
}

.timeLabel {
  display: block;
  font-size: 12px;
  color: var(--color-font-label);
}

.timeValue {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: var(--color-font);
}

.body {
  display: flex;
  gap: 15px;
  margin-top: 12px;
  min-height: 0;
}

.choices {
  flex: 0 0 210px;
}

.choice {
  padding: 8px 10px;
  border: 1px solid var(--color-primary-alpha-900);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;

  + .choice {
    margin-top: 8px;
  }

  &:hover {
    border-color: var(--color-primary);
  }
}

.choiceActive {
  border-color: var(--color-primary);
  background-color: var(--color-primary-alpha-900);

  .choiceTitle {
    color: var(--color-primary);
  }
}

.choiceTitle {
  font-size: 14px;
  color: var(--color-font);
}

.choiceDesc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-font-label);
  line-height: 1.4;
}

.preview {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
}

.previewLabel {
  font-size: 13px;
  color: var(--color-font-label);
  margin-bottom: 6px;
}

.previewBody {
  flex: auto;
  max-height: 260px;
  padding-right: 5px;
}

.tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-font-label);
  line-height: 1.4;
}

.footer {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
