<script>
import { defineComponent, h } from 'vue'
import { fetchForwardMessage, getCacheName, getUserLogo } from "../../utils/backend-api.js";
import { parseMessage } from "../../utils/parse-message.js";
import { formatTimeOptions } from "../../utils/others.js";
import SimplePopUp from "./SimplePopUp.vue";
import CustomScrollBar from "./CustomScrollBar.vue";

export default defineComponent({
  name: "ForwardMessageContentsViewer",
  components: {
    SimplePopUp,
    CustomScrollBar,
    RenderVNode: {
      props: ['vnode'],
      render() {
        return this.vnode
      }
    }
  },
  props: {
    id: {
      type: [Number, String],
      default: null
    },
    messages: {
      type: Array,
      default: null
    },
    onClose: {
      type: Function,
      default: () => {
      }
    }
  },
  data() {
    return {
      loadedMessages: [],
      loading: false,
      error: null,
      message_type: undefined,
      private_users: undefined,
    }
  },
  watch: {
    displayMessages: {
      handler(newVal) {
        if (newVal?.length) {
          const msg = newVal[0]
          if (msg) {
            this.message_type = msg.message_type
            if (this.message_type === 'private') {
              this.private_users = Object.fromEntries(
                new Map(newVal.map(message => [message.user_id, message?.sender?.nickname]))
              )
            }
            return;
          }
        }
        this.message_type = undefined
        this.private_users = undefined
      },
      immediate: true // 初始化立即执行一次
    }
  },
  computed: {
    displayMessages() {
      return this.messages || this.loadedMessages
    }
  },
  methods: {
    getUserLogo,
    formatTime(timestamp) {
      if (!timestamp) return ''
      return formatTimeOptions({
        timestamp,
        alwaysMD: false,
        showSecond: true,
        relative: false,
        showHm: true
      })
    },
    getDisplayName(message) {
      if (message.message_type === 'group') {
        const id = [message.group_id, message.user_id]
        const type = "group_user"
        return getCacheName(id, type) || message?.sender?.card || message?.sender?.nickname || message.user_id
      }
      return message?.sender?.nickname || message.user_id
    },
    getMessageContent(msg) {
      try {
        // 模拟 MessageItem 的消息结构，让 parseMessage 正常工作
        const wrapped = { event: typeof msg.event === 'string' ? msg.event : msg }
        const vnodes = parseMessage(wrapped)
        if (Array.isArray(vnodes)) {
          return h('div', { class: 'fv-message-content-inner' }, vnodes)
        }
        return vnodes || h('div', '')
      } catch (e) {
        console.error('解析消息失败:', e)
        return h('div', '消息解析失败')
      }
    },
    close() {
      this.$refs.popUp?.confirm(false)
    },
    async loadMessages() {
      if (this.messages) return
      if (!this.id) return
      this.loading = true
      this.error = null
      try {
        this.loadedMessages = await fetchForwardMessage(this.id)
      } catch (e) {
        console.error('加载转发消息失败:', e)
        this.error = '加载消息失败'
      } finally {
        this.loading = false
      }
    }
  },
  mounted() {
    this.loadMessages()
  }
})
</script>

<template>
  <div class="forward-message-viewer">
    <SimplePopUp ref="popUp"
                 :on-confirm="onClose"
                 :on-cancel="onClose"
                 :container-styles="$style['forward-viewer-container']">
      <template #default>
        <!-- 标题栏 -->
        <div class="fv-head">
          <span class="fv-head-name">
            <span v-if="message_type === 'group'">群聊</span>
            <span v-else-if="message_type === 'private' && typeof private_users === 'object'">{{
                Object.values(private_users).join("和")
              }}</span>
            <span v-else>未知</span>
            <span>的聊天记录</span>
          </span>
          <img alt="" src="/QQ/icons/close_fill_24.svg" class="fv-close-btn" @click="close">
        </div>

        <!-- 主体区域 -->
        <div class="fv-body">
          <!-- 加载中 -->
          <div v-if="loading" class="fv-loading text-muted">
            加载中...
          </div>

          <!-- 错误提示 -->
          <div v-else-if="error" class="fv-error">
            {{ error }}
          </div>

          <!-- 消息列表 (仿 ChatArea 聊天气泡布局 / 使用 CustomScrollBar) -->
          <CustomScrollBar v-else class="fv-messages-wrapper">
            <div v-if="displayMessages.length === 0" class="fv-empty text-muted">
              暂无消息
            </div>
            <div
              v-for="(msg, idx) in displayMessages"
              :key="idx"
              class="fv-message-container"
              :class="[
                msg.self_id === msg.user_id ? 'fv-message-out' : 'fv-message-in',
                msg.message_type === 'group' ? 'fv-group' : 'fv-private'
              ]"
            >
              <!-- 头像 -->
              <img
                class="fv-message-avatar"
                alt=""
                :src="getUserLogo(msg.user_id)"
              />

              <!-- 消息侧 -->
              <div class="fv-message-msg-side">
                <!-- 上方信息：群聊显示名称 + 时间 -->
                <div class="fv-message-before">
                  <div class="fv-message-name-title" v-if="msg.message_type === 'group'">
                    <span class="fv-message-name-title-display-name">{{ getDisplayName(msg) }}</span>
                  </div>
                  <span class="fv-message-send-time">{{ formatTime(msg.time) }}</span>
                </div>

                <!-- 消息气泡 -->
                <div class="fv-message">
                  <RenderVNode :vnode="getMessageContent(msg)"/>
                </div>
              </div>
            </div>
          </CustomScrollBar>
        </div>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
/* ===== 标题栏 (仿 ChatArea 头部风格) ===== */
.fv-head {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
  background: rgb(245, 245, 245);
  padding: 4px 0;
}

.fv-head-name {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.fv-close-btn {
  width: 20px;
  height: 20px;
  position: absolute;
  right: 6px;
  top: 4px;
  cursor: pointer;
  padding: 2px;
  border-radius: 8px;
}

.fv-close-btn:hover {
  background-color: rgb(200 200 200 / 25%);
}

.fv-close-btn:active {
  background-color: rgb(200 200 200 / 50%);
}

/* ===== 主体区域 ===== */
.fv-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgb(245, 245, 245);
}

/* ===== 加载/错误/空状态 ===== */
.fv-loading,
.fv-empty {
  text-align: center;
  padding: 40px 0;
  font-size: 14px;
}

.fv-error {
  text-align: center;
  color: #FF6B6B;
  padding: 40px 0;
  font-size: 14px;
}

/* ===== 消息列表容器 (CustomScrollBar 接管滚动) ===== */
.fv-messages-wrapper {
  min-height: 0;
  background: rgb(245, 245, 245);
}

.fv-messages-wrapper:deep(.simplebar-content) {
  display: flex;
  flex-direction: column;
  padding-bottom: 5px;
  padding-top: 0;
}

.fv-group .fv-messages-wrapper:deep(.simplebar-content) {
  gap: 5px;
}

/* ===== 消息容器 (仿 MessageItem.message-container) ===== */
.fv-message-container {
  width: 100%;
  display: flex;
  position: relative;
  padding: 10px 0;
}

/* ===== 头像 (仿 MessageItem) ===== */
.fv-message-avatar {
  width: 35px;
  height: 35px;
  border-radius: 50%;
  flex-shrink: 0;
}

.fv-message-in .fv-message-avatar {
  margin-left: 20px;
}

.fv-message-out .fv-message-avatar {
  margin-right: 20px;
}

.fv-group .fv-message-avatar {
  margin-top: 4px;
}

.fv-private .fv-message-avatar {
  margin-top: 20px;
}

@media (max-width: 425px) {
  .fv-message-in .fv-message-avatar {
    margin-left: 10px;
  }

  .fv-message-out .fv-message-avatar {
    margin-right: 10px;
  }
}

/* ===== 消息侧 (仿 MessageItem.message-msg-side) ===== */
.fv-message-msg-side {
  max-width: calc(100% - 140px);
}

@media (max-width: 425px) {
  .fv-message-msg-side {
    max-width: 70%;
  }
}

/* ===== 消息上方信息 (仿 MessageItem.message-before) ===== */
.fv-message-before {
  font-size: 13px;
  color: #999999 !important;
  margin: 0 8px;
  height: 24px;
  white-space: nowrap;
}

.fv-message-in .fv-message-before {
  direction: ltr;
}

.fv-message-out .fv-message-before {
  direction: rtl;
}

.fv-message-before .fv-message-send-time {
  direction: ltr;
  display: inline-block;
}

/* 发送时间 (默认隐藏，hover 显示) */
.fv-message-send-time {
  opacity: 0;
}

.fv-message-container:hover .fv-message-send-time {
  opacity: 1;
}

/* ===== 群聊显示名称 (仿 MessageItem.message-name-title) ===== */
.fv-message-name-title {
  display: inline-block;
  margin: 0 0 4px 0;
}

.fv-message-name-title-display-name {
  direction: ltr;
  display: inline-block;
}

.fv-message-in .fv-message-name-title {
  direction: ltr;
  margin-right: 5px;
}

.fv-message-out .fv-message-name-title {
  direction: rtl;
  margin-left: 5px;
}

/* ===== 消息气泡 (仿 MessageItem.message) ===== */
.fv-message {
  padding: 7px 14px;
  border-radius: 10px;
  display: inline-block;
  line-height: 23px;
  font-size: 16px;
  min-height: 38px;
  min-width: 30px;
  direction: ltr;
  text-align: left;
  overflow-wrap: break-word;
  word-break: break-all;
  max-width: 100%;
  white-space: pre-wrap;
}

/* 对齐方向 */
.fv-message-in {
  direction: ltr;
  text-align: left;
}

.fv-message-out {
  direction: rtl;
  text-align: right;
}

/* 气泡颜色 */
.fv-message-in .fv-message {
  background-color: white;
  margin-left: 8px;
}

.fv-message-out .fv-message {
  background-color: #CCEBFF;
  margin-right: 8px;
}

/* ===== 消息内容内部样式 (deep 穿透) ===== */
.fv-message:deep(.fv-message-content-inner) {
  display: inline;
}

.fv-message:deep(.message-image),
.fv-message:deep(.message-video) {
  max-width: 100%;
  max-height: 500px;
  border-radius: 5px;
  width: auto;
  height: auto;
  object-fit: contain;
  display: block;
  margin: 4px 0;
}

.fv-message:deep(.message-emoji-png),
.fv-message:deep(.msg-preview-emoji) {
  height: 17px;
  position: relative;
  top: -2px;
}

.fv-message:deep(.message-box-less) {
  background: transparent !important;
  overflow: hidden;
  padding: 0;
}

.fv-message:deep(.message-super-emoji-lottie) {
  height: 125px;
  max-width: 200px;
}

.fv-message:deep(.message-forward-message) {
  width: 200px;
  max-width: 100%;
  background-color: white;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
}

.fv-message:has(.message-box-less) {
  background: #00000000 !important;
  overflow: hidden;
  padding: 0;
}

.fv-message:has(.audio-message) {
  padding: 0 2px;
}

.fv-message:has(.message-markdown-box) {
  padding: 10px 9px;
  width: min(80%, 430px);
  max-width: 430px;
}

.fv-message:has(.message-emoji-picture) {
  max-width: 185px;
}

.fv-message:deep(.at-somebody-link) {
  color: #4A90D9;
  cursor: pointer;
}

.fv-message:deep(.audio-message) {
  max-width: 200px;
}

.fv-message:deep(.message-file) {
  max-width: 240px;
}

.fv-message:deep(.message-reply) {
  max-width: 300px;
}

.fv-message:deep(.message-box-less.message-image) {
  margin: unset;
}
</style>

<style module>
.forward-viewer-container {
  width: 620px;
  height: 700px;
  padding: 0;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 20px);
  background-color: rgb(245, 245, 245);
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
}

@media (max-width: 480px) {
  .forward-viewer-container {
    max-width: 100%;
    max-height: 100%;
    height: 100%;
    width: 100%;
    border-radius: 0;
  }
}
</style>