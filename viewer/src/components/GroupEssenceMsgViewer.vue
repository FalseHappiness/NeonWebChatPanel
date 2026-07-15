<script>
import { defineComponent } from 'vue'
import { fetchMsg, getUserLogo } from "../utils/backend-api.js";
import { formatTimeOptions } from "../utils/others.js";
import { parseMessage } from "../utils/parse-message.js";
import CustomScrollBar from "./utils/CustomScrollBar.vue";
import SimplePopUp from "./utils/SimplePopUp.vue";

/**
 * 使用 parseMessage 渲染消息段的内联组件
 * 构造 { event: { message: segments } } 传给 parseMessage，与 MessageItem.vue 一致
 */
const MessageContentRenderer = {
  name: 'MessageContentRenderer',
  props: {
    segments: Array
  },
  render() {
    if (!this.segments || !this.segments.length) return null
    const fakeEvent = JSON.stringify({ message: this.segments })
    return parseMessage({ event: fakeEvent })
  }
}

export default defineComponent({
  name: "GroupEssenceMsgViewer",
  components: { SimplePopUp, CustomScrollBar, MessageContentRenderer },
  props: {
    messages: {
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
      fetchedMessages: {}
    }
  },
  watch: {
    messages: {
      handler(newVal) {
        if (Array.isArray(newVal)) {
          newVal.forEach(async (msg) => {
            if ((!msg.content || !Array.isArray(msg.content) || !msg.content.length) && msg.message_id && !this.fetchedMessages[msg.message_id]) {
              try {
                this.fetchedMessages[msg.message_id] = await fetchMsg(msg.message_id)
              } catch (e) {
                console.error('获取精华消息失败', msg.message_id, e)
                this.fetchedMessages[msg.message_id] = null
              }
            }
          })
        }
      },
      immediate: true,
      deep: true
    }
  },
  methods: {
    getAvatarUrl(user_id) {
      return getUserLogo(user_id)
    },
    formatTime(timestamp) {
      if (!timestamp) return ''
      return formatTimeOptions({
        timestamp,
        delimiter1: "/",
        alwaysMD: false,
        showSecond: false,
        relative: true
      })
    },
    getMessageContent(msg) {
      if (msg.content && Array.isArray(msg.content) && msg.content.length > 0) {
        return msg.content
      }
      if (msg.message_id && this.fetchedMessages[msg.message_id]) {
        const fetched = this.fetchedMessages[msg.message_id]
        if (fetched && fetched.message && Array.isArray(fetched.message)) {
          return fetched.message
        }
      }
      return null
    },
    hasContent(msg) {
      const content = this.getMessageContent(msg)
      return content && content.length > 0
    },
    close() {
      this.$refs.popUp.confirm(false)
    }
  }
})
</script>

<template>
  <div class="essence-msg-viewer">
    <SimplePopUp ref="popUp"
                 :on-confirm="onClose"
                 :on-cancel="onClose"
                 :container-styles="$style['group-essence-msg-viewer-container']">
      <template #default>
        <div class="essence-msg-viewer-title">
          精华消息
          <img alt="" src="/QQ/icons/close_fill_24.svg" class="essence-msg-viewer-close-btn cannot-drag"
               @click="close">
        </div>
        <CustomScrollBar class="essence-msg-viewer-list">
          <div v-if="!messages?.length" class="essence-msg-viewer-empty">
            暂无精华消息
          </div>
          <div
            v-for="(msg, msgIndex) in messages"
            :key="msg.message_id || msgIndex"
            class="essence-msg-viewer-item"
          >
            <div class="essence-msg-viewer-item-header">
              <div>
                <img
                  :src="getAvatarUrl(msg.sender_id)"
                  alt=""
                  class="essence-msg-viewer-avatar"
                >
                <span class="essence-msg-viewer-sender-name overflow-ellipsis">{{
                    msg.sender_nick || msg.sender_id
                  }}</span>
              </div>
              <span class="essence-msg-viewer-time">{{ formatTime(msg.operator_time) }}</span>
            </div>
            <div class="essence-msg-viewer-item-content">
              <MessageContentRenderer v-if="hasContent(msg)" :segments="getMessageContent(msg)"/>
              <span v-else-if="msg.message_id && fetchedMessages[msg.message_id] === undefined"
                    class="essence-msg-viewer-status">
                加载中...
              </span>
              <span v-else-if="msg.message_id && fetchedMessages[msg.message_id] === null"
                    class="essence-msg-viewer-status essence-msg-viewer-status--error">
                获取消息失败
              </span>
              <span v-else class="essence-msg-viewer-status">
                无消息
              </span>
            </div>
            <div class="essence-msg-viewer-item-footer">
              <span class="essence-msg-viewer-operator">
                <img src="/QQ/icons/essence_message_24.svg" alt="" class="essence-msg-viewer-essence-icon">
                <span class="essence-msg-viewer-operator-text">{{ msg.operator_nick || msg.operator_id }} 加精</span>
                <span class="essence-msg-viewer-operator-time">{{ formatTime(msg.operator_time) }}</span>
              </span>
            </div>
          </div>
        </CustomScrollBar>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.essence-msg-viewer-title {
  text-align: center;
  font-weight: bold;
  font-size: 16px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  user-select: none;
  position: relative;
}

.essence-msg-viewer-close-btn {
  float: right;
  width: 25px;
  height: 25px;
  position: absolute;
  right: 8px;
  top: 8px;
  cursor: pointer;
}

.essence-msg-viewer-list {
  flex: 1;
  padding: 10px 10px 0 10px;
  overflow: auto;
}

.essence-msg-viewer-item {
  padding: 12px 12px 6px 12px;
  margin-bottom: 10px;
  background-color: white;
  border-radius: 4px;
  border: 1px solid #eee;
  transition: background-color 0.2s;
}

.essence-msg-viewer-item-header {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #7F7F7F;
  gap: 8px;
  margin-bottom: 8px;
  justify-content: space-between;
}

.essence-msg-viewer-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-right: 10px;
}

.essence-msg-viewer-sender-name {
  font-size: 14px;
  color: #333;
  flex: 1;
  max-width: 50%;
}

.essence-msg-viewer-time {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
  align-self: flex-start;
}

.essence-msg-viewer-item-content {
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
  padding: 8px 0;
}

.essence-msg-viewer-status {
  color: #999;
  font-style: italic;
  font-size: 13px;
}

.essence-msg-viewer-status--error {
  color: #FF6B6B;
}

.essence-msg-viewer-item-footer {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px dashed #E0E0E0;
}

.essence-msg-viewer-operator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #888;
}

.essence-msg-viewer-essence-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.essence-msg-viewer-operator-text {
  font-weight: 500;
}

.essence-msg-viewer-operator-time {
  color: #AAA;
  margin-left: auto;
}

.essence-msg-viewer-empty {
  text-align: center;
  color: #999;
  padding: 40px 0;
  font-size: 14px;
}
</style>

<style scoped>
.essence-msg-viewer-item-content:deep(.message-file-message) {
  border: 1px solid #ebebeb;
}

.essence-msg-viewer-item-content:deep(.message-emoji-png, .msg-preview-emoji, .msg-preview-emoji) {
  height: 17px;
  position: relative;
  top: -2px;
}

.essence-msg-viewer-item-content:deep(.message-super-emoji-lottie) {
  /*width: 125px;*/
  height: 125px;
  max-width: 200px;
}

.essence-msg-viewer-item-content:deep(.message-image) {
  max-width: 100%;
  max-height: 500px;
  border-radius: 5px;
  width: auto; /* 或 100% */
  height: auto;
  object-fit: contain;
  display: block;
  margin: 4px 0;
}
</style>

<style module>
.group-essence-msg-viewer-container {
  width: 520px;
  height: 540px;
  padding: 4px 2px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 20px);
  background-color: #F5F5F5;
}
</style>