<script>
import { defineComponent, ref, watch } from 'vue'
import { fetchDisplayName, getGroupNoticePicUrl, getMultimediaProxyUrl } from "../utils/backend-api.js";
import { convertMessageTextHTMLSyntax } from "../utils/parse-message.js";
import SimplePopUp from "./utils/SimplePopUp.vue";
import CustomScrollBar from "./utils/CustomScrollBar.vue";
import { formatTimeOptions } from "../utils/others.js";

export default defineComponent({
  name: "GroupNoticesShower",
  components: { SimplePopUp, CustomScrollBar },
  props: {
    group_id: {
      type: Number,
      required: true
    },
    notices: {
      type: Array,
      default: () => []
    },
    onClose: {
      type: Function,
      default: () => {
      }
    }
  },
  data() {
    return {
      userNameMap: {}
    }
  },
  watch: {
    notices: {
      handler(newVal) {
        newVal.forEach(async notice => {
          if (!this.userNameMap[notice.sender_id]) {
            this.userNameMap[notice.sender_id] =
              (await fetchDisplayName([this.group_id, notice.sender_id], 'group_user'))?.name
          }
        })
      },
      immediate: true,
      deep: true
    }
  },
  methods: {
    formatTime(timestamp) {
      return formatTimeOptions({
        timestamp,
        delimiter1: "/",
        alwaysMD: false,
        showSecond: false
      })
    },
    getNoticeImageUrl(picId) {
      return getMultimediaProxyUrl(getGroupNoticePicUrl(picId))
    },
    renderText(text) {
      return convertMessageTextHTMLSyntax(text)
    },
    getCachedName(user_id) {
      return this.userNameMap[user_id] || user_id
    },
    close() {
      this.$refs.popUp.confirm(false)
    }
  }
})
</script>

<template>
  <div class="group-notices-shower">
    <SimplePopUp ref="popUp"
                 :on-confirm="onClose"
                 :on-cancel="onClose"
                 :container-styles="$style['group-notices-shower-container']">
      <template #default>
        <div class="group-notices-shower-title">
          群公告
          <img alt="" src="/QQ/icons/close_fill_24.svg" class="group-notices-shower-close-btn cannot-drag"
               @click="$refs.popUp.confirm(false)">
        </div>
        <CustomScrollBar class="group-notices-shower-list">
          <div class="group-notices-shower-notice" v-for="(notice) in notices" :key="notice.notice_id">
            <div class="group-notices-shower-notice-header">
              <span class="group-notices-shower-notice-name overflow-ellipsis">{{
                  getCachedName(notice.sender_id)
                }}</span>
              <span class="group-notices-shower-notice-time">{{ formatTime(notice.publish_time) }}</span>
              <span class="group-notices-shower-notice-pinned" v-if="notice.pinned">置顶</span>
            </div>
            <div class="group-notices-shower-notice-content" v-html="renderText(notice.message.text)">
            </div>
            <div class="group-notices-shower-notice-images" v-if="notice.message.image?.length">
              <img
                v-for="(img, index) in notice.message.image"
                :key="index"
                :src="getNoticeImageUrl(img.id)"
                alt=""
                class="group-notices-shower-notice-image"
                :style="{ '--width': img.width, '--height': img.height }"
              >
            </div>
          </div>
          <div class="group-notices-shower-empty" v-if="!notices.length">
            暂无群公告
          </div>
        </CustomScrollBar>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.group-notices-shower-title {
  text-align: center;
  font-weight: bold;
  font-size: 16px;
  padding: 5px 0;
  border-bottom: 1px solid #eee;
  user-select: none;
  position: relative;
}

.group-notices-shower-close-btn {
  float: right;
  width: 25px;
  height: 25px;
  position: absolute;
  right: 5px;
  top: 5px;
  cursor: pointer;
}

.group-notices-shower-list {
  flex: 1;
  padding: 10px 10px 0 10px;
  overflow: auto;
}

.group-notices-shower-notice {
  padding: 12px;
  margin-bottom: 10px;
  background-color: white;
  border-radius: 4px;
  border: 1px solid #eee;
}

.group-notices-shower-notice:hover {
  background-color: #EBEBEB;
}

.group-notices-shower-notice-header {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #7F7F7F;
  gap: 4px;
}

.group-notices-shower-notice-name {
  max-width: 50%;
}

.group-notices-shower-notice-pinned {
  color: #0099FF;
  background-color: #CCEBFF;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 10px;
  margin-left: 2px;
}

.group-notices-shower-notice-content {
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
}

.group-notices-shower-notice-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.group-notices-shower-notice-image {
  max-width: 150px;
  max-height: 150px;
  width: auto;
  height: auto;
  aspect-ratio: var(--width) / var(--height);
  object-fit: contain;
  border-radius: 4px;
  cursor: pointer;
}

.group-notices-shower-empty {
  text-align: center;
  color: #999;
  padding: 40px 0;
  font-size: 14px;
}
</style>

<style module>
.group-notices-shower-container {
  width: 520px;
  height: 540px;
  padding: 4px 2px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 20px);
  background-color: #F5F5F5;
}
</style>