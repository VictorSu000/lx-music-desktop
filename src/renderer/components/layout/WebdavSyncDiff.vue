<template>
  <div :class="$style.diff">
    <p v-if="!diff || diff.isEmpty" :class="$style.empty">{{ $t('webdav_sync__diff_empty') }}</p>
    <template v-else>
      <div v-for="item in diff.addedLists" :key="`added-${item.id}`" :class="$style.listItem">
        <div :class="$style.listHead">
          <span :class="$style.listName">{{ resolveListName(item.id, item.name) }}</span>
          <span :class="[$style.badge, $style.badgeAdd]">
            {{ $t('webdav_sync__diff_list_added') }} · {{ $t('webdav_sync__diff_count', { count: item.count }) }}
          </span>
        </div>
      </div>

      <div v-for="item in diff.removedLists" :key="`removed-${item.id}`" :class="$style.listItem">
        <div :class="$style.listHead">
          <span :class="$style.listName">{{ resolveListName(item.id, item.name) }}</span>
          <span :class="[$style.badge, $style.badgeRemove]">
            {{ $t('webdav_sync__diff_list_removed') }} · {{ $t('webdav_sync__diff_count', { count: item.count }) }}
          </span>
        </div>
      </div>

      <div v-for="item in diff.changedLists" :key="`changed-${item.id}`" :class="$style.listItem">
        <div :class="$style.listHead">
          <span :class="$style.listName">{{ resolveListName(item.id, item.name) }}</span>
          <span v-if="item.added.length" :class="[$style.badge, $style.badgeAdd]">
            {{ $t('webdav_sync__diff_added', { count: item.added.length }) }}
          </span>
          <span v-if="item.removed.length" :class="[$style.badge, $style.badgeRemove]">
            {{ $t('webdav_sync__diff_removed', { count: item.removed.length }) }}
          </span>
        </div>
        <ul :class="$style.musicList">
          <li v-for="music in item.added.slice(0, maxMusics)" :key="`a-${music.id}`" :class="$style.musicAdd">
            + {{ music.name }} - {{ music.singer }}
          </li>
          <li v-if="item.added.length > maxMusics" :class="$style.musicMore">
            {{ $t('webdav_sync__diff_more', { count: item.added.length }) }}
          </li>
          <li v-for="music in item.removed.slice(0, maxMusics)" :key="`r-${music.id}`" :class="$style.musicRemove">
            - {{ music.name }} - {{ music.singer }}
          </li>
          <li v-if="item.removed.length > maxMusics" :class="$style.musicMore">
            {{ $t('webdav_sync__diff_more', { count: item.removed.length }) }}
          </li>
        </ul>
      </div>

      <p :class="$style.total">
        {{ $t('webdav_sync__diff_total', { added: diff.totalAdded, removed: diff.totalRemoved }) }}
      </p>
    </template>
  </div>
</template>

<script>
import { LIST_IDS } from '@common/constants'
import { useI18n } from '@renderer/plugins/i18n'

export default {
  props: {
    diff: {
      type: Object,
      default: null,
    },
    // 每个列表最多展开几首歌，超出的用「等共 N 首」收起
    maxMusics: {
      type: Number,
      default: 8,
    },
  },
  setup() {
    const t = useI18n()

    // 默认列表与我喜欢由主进程只传 id，这里取本地化名称
    const resolveListName = (id, name) => {
      switch (id) {
        case LIST_IDS.DEFAULT: return t('default_list')
        case LIST_IDS.LOVE: return t('love_list')
        default: return name || id
      }
    }

    return {
      resolveListName,
    }
  },
}
</script>

<style lang="less" module>
.diff {
  font-size: 13px;
  color: var(--color-font);
}

.empty {
  color: var(--color-font-label);
  font-size: 13px;
  line-height: 1.6;
}

.listItem {
  + .listItem {
    margin-top: 10px;
  }
}

.listHead {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.listName {
  font-weight: bold;
  word-break: break-all;
}

.badge {
  font-size: 12px;
  line-height: 1.6;
  padding: 0 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.badgeAdd {
  color: var(--color-primary);
  background-color: var(--color-primary-alpha-900);
}

.badgeRemove {
  color: var(--color-font-label);
  background-color: var(--color-primary-alpha-900);
}

.musicList {
  margin-top: 4px;
  padding-left: 8px;
  font-size: 12px;
  line-height: 1.7;

  li {
    word-break: break-all;
  }
}

.musicAdd {
  color: var(--color-primary);
}

.musicRemove {
  color: var(--color-font-label);
  text-decoration: line-through;
}

.musicMore {
  color: var(--color-font-label);
}

.total {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-font-label);
}
</style>
