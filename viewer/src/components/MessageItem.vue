<script setup>
import { ref, onUnmounted, computed, h, onMounted, shallowRef, inject, toRaw, defineComponent } from 'vue'
import { formatTime, parseMessage, parseNotice } from "../utils/parse-message.js";
import '@lottiefiles/lottie-player';
import {
  fetchChangeEssenceMsg,
  fetchDisplayName,
  fetchMsg, fetchRecallMessage,
  fetchSendMessage,
  getCacheGroupLevelTitle,
  getCacheName, getUserLogo
} from "../utils/backend-api.js";
import { useGlobalStore } from "../store/global.js";
import GroupLevelTitle from "./GroupLevelTitle.vue";
import { basicContextItem, contextDividedItem, formatBasicContextItems, vCustomMenu } from "../utils/context-menu.js";
import { vDoubleClick } from '../directives/double-click-directive.js';
import { formatRelativeTime, parseJSON } from "../utils/others.js";
import { showToast } from "../utils/toast.js";
import { Emitter } from "../composables/event-bus.js";

const props = defineProps({
  message: {
    type: Object,
    required: true,
    default: () => ({}),
  },
  activeContact: {
    type: Object,
    default: {}
  },
  showTimeNotice: {
    type: Boolean,
    default: false
  }
})

const global = useGlobalStore()

const emit = defineEmits([
  'get-essence-msg-real-seq-list',
  'change-essence-msg',
  'quote-message',
  'click-show-contacts-info',
  'change-show-group-notice',
  'change-show-essence-list'
])

const noticeContainer = ref(null)
const messageContent = ref(null)

// 移除 messageSendTime ref，改为使用 class 控制
let hoverTimer = null

// 全局处理鼠标悬浮
const handleMouseEnter = (e) => {
  if (typeof e?.target?.closest === 'function') {
    const container = e.target.closest('.message-container')
    if (!container) return

    // 清除之前的定时器
    if (hoverTimer) {
      clearTimeout(hoverTimer)
    }

    // 设置新定时器
    hoverTimer = setTimeout(() => {
      container.classList.add('show-message-time')
    }, 1000)
  }
}

const handleMouseLeave = (e) => {
  if (typeof e?.target?.closest === 'function') {
    const container = e.target.closest('.message-container')
    if (!container) return

    // 清除定时器
    if (hoverTimer) {
      clearTimeout(hoverTimer)
      hoverTimer = null
    }

    container.classList.remove('show-message-time')
  }
}

const handleCopy = (e) => {
  // console.log(e)
  // const selection = window.getSelection();
  // let text = selection.toString();
  //
  // // 保留所有空格（包括&nbsp;）
  // text = text.replace(/\u00A0/g, ' '); // 将&nbsp;转换为普通空格
  //
  // e.clipboardData.setData('text/plain', text);
  // e.preventDefault();
}


const messageHtml = computed(() => {
  return () => h(
    "div",
    parseMessage(props.message)
  );
});

const noticeHtml = computed(() => {
  return h(
    "div",
    parseNotice(props.message)
  );
});

const displayName = ref('');

const getDisplayName = () => {
  const message = props.message;
  if (message.message_type !== 'group') {
    return
  }
  const id = [message.group_id, message.user_id];
  const type = "group_user";
  const event = typeof message.event === 'string' ? JSON.parse(message.event) : message.event;

  // 初始值
  displayName.value = getCacheName(id, type) || event?.sender.nickname || props.message.user_id

  // 异步更新
  fetchDisplayName(id, type, (newName) => {
    displayName.value = newName
  });
}

let currentActiveElement = null

// 检查点击目标是否有效
const isValidTarget = (target) => {
  // 排除.message-super-emoji-lottie及其子元素
  if (target.closest('.message-super-emoji-lottie')) {
    return false
  }

  // 目标必须是.message或其子元素
  return target.closest('.message') !== null
}

// 获取应该变灰的元素
const getDarknessTarget = (target) => {
  // console.log(target)
  if (target?.closest('.no-darkness-effect')) {
    return null
  }

  // 如果是普通img且没有.message-emoji-png类，返回img本身
  if (target.tagName === 'IMG' && !target.classList.contains('message-emoji-png') && !target.closest(".message-box-less")) {
    return target
  }

  // 如果是.message本身，返回它
  if (target.classList.contains('message')) {
    return target
  }

  const closetMessageParent = target.closest('.message')

  if (closetMessageParent) {
    return closetMessageParent
  }

  // 其他情况返回null
  return null
}

// 处理文档点击事件
const handleDocumentClick = (e) => {
  // 只处理左键(0)和右键(2)
  if (e.button !== 0 && e.button !== 2) return

  if (isValidTarget(e.target)) {
    const darkTarget = getDarknessTarget(e.target)

    if (darkTarget) {
      // 移除之前的效果
      if (currentActiveElement) {
        currentActiveElement.classList.remove('darkness-effect')
      }

      // 应用新效果
      darkTarget.classList.add('darkness-effect')
      currentActiveElement = darkTarget
    }
  } else {
    // 点击外部时移除效果
    if (currentActiveElement) {
      currentActiveElement.classList.remove('darkness-effect')
      currentActiveElement = null
    }
  }
}

const handleAvatarDoubleClick = {
  doubleClick: () => {
    const user_id = props.message.user_id
    const group_id = props.message.group_id
    const target_id = props.message.target_id
    const message_type = props.message.message_type
    const is_group = message_type === 'group'
    const data = {
      user_id: is_group ? user_id : target_id,
      target_id: user_id
    }
    if (is_group) {
      data.group_id = group_id
    }
    fetchSendMessage({
      type: message_type,
      contact_id: is_group ? group_id : user_id
    }, [{
      type: 'poke',
      data: data
    }])
  },
  singleClick: e => {
    emit("click-show-contacts-info", e, props.message.user_id)
  }
}

const settingEssence = ref(false)

const customContextMenu = () => {
  const self_info = getCacheGroupLevelTitle(props.message.group_id, props.message.self_id)
  const sender_info = getCacheGroupLevelTitle(props.message.group_id, props.message.self_id)
  return formatBasicContextItems([
    basicContextItem('复制', () => {
      let copyAll = false
      const range = window.getSelection()?.getRangeAt(0)
      if (!messageContent.value?.contains(range?.commonAncestorContainer) || range?.collapsed) {
        copyAll = true
        const range = document.createRange();
        range.selectNode(messageContent.value);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
      try {
        const successful = document.execCommand('copy');
        successful ? showToast('success', '复制成功') : showToast('error', '复制失败');
      } catch (err) {
        console.error('无法复制文本: ', err);
        showToast('error', '复制失败')
      }
      if (copyAll) {
        window.getSelection().removeAllRanges();
      }
    }, '/QQ/icons/copy_24.svg'),
    basicContextItem('转发', () => {
      const message = props.message
      const event = typeof message.event === 'string' ? JSON.parse(message.event) : message.event;
      Emitter.emit('forward-single-msg', event.message_id, event.message)
    }, '/QQ/icons/one_by_one_forward_24.svg'),
    basicContextItem('引用', () => {
      emit('quote-message', toRaw(props.message), props.message.message_type === 'group' ? {
        name: displayName.value,
        qq: props.message.user_id
      } : null)
    }, '/QQ/icons/quote_24.svg'),
    basicContextItem(
      isEssence.value ? '移除精华' : '设为精华',
      async () => {
        if (settingEssence.value) {
          showToast('warning', '正在请求中，请勿重复操作')
        }
        let error_info
        try {
          const set = !isEssence.value
          settingEssence.value = true
          const result = await fetchChangeEssenceMsg(props.message.message_id, set)
          if (result.status === 'ok' && (!result?.data || result?.data?.result?.errorCode === 0)) {
            showToast('success', set ? '设置群精华成功' : "该消息已被移除群精华")
            emit('change-essence-msg', props.message.real_seq, set)
          } else {
            error_info = result
          }
        } catch (e) {
          error_info = e
        }
        if (error_info !== undefined) {
          console.error('改变群精华失败', error_info)
          showToast('error', error_info?.data?.result?.wording || '改变群精华失败')
        }
        settingEssence.value = false
      },
      '/QQ/icons/essence_message_24.svg',
      ['owner', 'admin'].includes(self_info.role) &&
      (!isRecalled.value || !isEssence.value)
    ),
    contextDividedItem(),
    basicContextItem(
      '撤回', () => {
        fetchRecallMessage(props.message.message_id)
      },
      '/QQ/icons/recall_24.svg',
      !isRecalled.value &&
      (
        (self_info.role === 'owner') ||
        (
          props.message.user_id === props.message.self_id &&
          (
            (Date.now() / 1000 - props.message.time <= 120) ||
            self_info.role === 'admin'
          )
        ) ||
        (
          !['owner', 'admin'].includes(sender_info.role) &&
          self_info.role === 'admin'
        )
      )
    ),
  ]);
}

const isRecalled = computed(() => {
  const message = props.message
  const event = parseJSON(message.event);
  return 'recall_operator' in event
})

const isEssence = computed(() => {
  return props.activeContact?.essence_real_seq_list?.includes(props.message.real_seq)
})

const isSecretEmoji = computed(() => {
  const message = props.message
  const event = parseJSON(message.event);
  if (event?.message?.length === 1) {
    const item = event.message[0];
    if (item.type === 'face') {
      return global.secretEmojiids.includes(String(item.data.id))
    }
  }
  return false
})

const scrollToMidwayMsg = inject('scrollToMidwayMsg')
const findMessage = inject('findMessage')

const handleNoticeExecuteCommand = e => {
  const element = e.target?.closest('.notice-execute-command')
  if (element) {
    const command = element.dataset.command
    if (typeof command === 'string') {
      const jumpToMsg = 'jump-to-msg-'
      const openEssence = 'open-essence-window'
      const viewUserInfo = 'view-user-info-'
      if (command.startsWith(jumpToMsg)) {
        const msg = element.jumpToMsg
        if (msg === undefined) {
          showToast('warning', '正在获取消息中，请等待')
        } else if (msg === null) {
          showToast('error', '找不到消息')
        } else {
          scrollToMidwayMsg(msg)
        }
      } else if (command === openEssence) {
        emit('change-show-essence-list')
      } else if (command.startsWith(viewUserInfo)) {
        emit("click-show-contacts-info", e, command.substring(viewUserInfo.length))
      }
    }
  }
}

const handleMessageExecuteCommand = e => {
  const element = e.target?.closest('.message-execute-command')
  if (element) {
    const command = element.dataset.command
    if (typeof command === 'string') {
      const atSomebody = 'at-somebody'
      const showGroupNotice = 'show-group-notice'
      if (command === atSomebody) {
        Emitter.emit("input-at-somebody", element.dataset.userId, element.dataset.displayName)
      } else if (command === showGroupNotice) {
        emit("change-show-group-notice")
      }
    }
  }
}

// 组件加载时
onMounted(() => {
  document.addEventListener('mouseenter', handleMouseEnter, { capture: true })
  document.addEventListener('mouseleave', handleMouseLeave, { capture: true })
  document.addEventListener('mousedown', handleDocumentClick)
  if (noticeContainer.value) {
    const jumpToMsgCommands = noticeContainer.value.querySelectorAll('[data-command^="jump-to-msg-"]')
    if (jumpToMsgCommands) {
      jumpToMsgCommands.forEach(async element => {
        const message_id = parseInt(element.dataset.command.substring("jump-to-msg-".length))
        if (message_id) {
          try {
            const msg = await findMessage(message_id)
            if (msg) {
              element.jumpToMsg = msg
              return
            }
            console.error('没有获取到跳转的消息:', message_id)
          } catch (e) {
            console.error('获取跳转的消息出错:', message_id, e)
          }
        }
        element.jumpToMsg = null
      })
    }
  }
  getDisplayName()
})

// 组件卸载时
onUnmounted(() => {
  document.removeEventListener('mouseenter', handleMouseEnter, { capture: true })
  document.removeEventListener('mouseleave', handleMouseLeave, { capture: true })
  document.removeEventListener('mousedown', handleDocumentClick)

  // 清除可能存在的定时器
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
})
</script>

<template>
  <div class="time-notice notice-container" v-if="showTimeNotice">
    <div class="notice">{{ formatRelativeTime(message.time * 1000, true) }}</div>
  </div>
  <div
    class="notice-container"
    v-if="message.post_type === 'notice'"
    @click="handleNoticeExecuteCommand"
    ref="noticeContainer"
  >
    <notice-html class="notice no-user-select"/>
  </div>
  <div
    v-else
    class="message-container"
    :class="[
      message.self_id === message.user_id ? 'message-out' : 'message-in' ,
      message.message_type === 'group' ? 'group' : 'private',
      { recalled: isRecalled }
    ]"
  >
    <img
      class="message-avatar"
      alt=""
      :src="getUserLogo(message.user_id)"
      v-double-click="handleAvatarDoubleClick"
    />
    <div class="message-msg-side">
      <div class="message-before">
        <div class="message-name-title" v-if="message.message_type === 'group'">
          <span class="message-name-title-display-name">{{ displayName }}</span>
          <GroupLevelTitle :group_id="message.group_id" :user_id="message.user_id"/>
        </div>
        <span class="message-send-time">{{ formatTime(message) }}</span>
      </div>
      <div
        class="message"
        v-custom-menu="customContextMenu"
        @copy="handleCopy"
        ref="messageContent"
        @click="handleMessageExecuteCommand"
      >
        <message-html/>
      </div>
      <div class="message-tips no-user-select">
        <div class="message-red-tip message-tip" v-if="isRecalled">
          <img alt="" src="/QQ/icons/recall_24.svg">
          已撤回
        </div>
        <div class="message-tip" v-if="isEssence" @click="emit('change-show-essence-list')">
          <img alt="" src="/QQ/app/img/essence.bbb878de5480c01292f5.svg">
          精华
        </div>
        <div class="message-tip" v-if="isSecretEmoji">
          隐藏表情
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-container {
  width: 100%;
  display: flex;
  position: relative;
  padding: 10px 0;
}

.message {
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

/*
.message-container.recalled .message {
  box-shadow: 0 0 8px 2px rgb(255 0 0 / 50%);
}

.message-container.recalled .message:has(.message-box-less) {
  box-shadow: unset;
  filter: drop-shadow(0 0 10px rgb(255 0 0 / 50%));
}

.message-container.recalled .message:has(.message-box-less).darkness-effect {
  filter: brightness(85%) drop-shadow(0 0 10px rgb(255 0 0 / 50%));
}
*/

.message-tips {
  display: flex;
  justify-self: start;
  padding: 1px 9px;
  gap: 5px;
}

.message-tip {
  background-color: rgba(158, 158, 158, 0.2);
  border-radius: 4px;
  color: gray;
  font-size: 12px;
  height: 24px;
  margin-top: 4px;
  padding: 0 6px;
  align-items: center;
  display: flex;
  justify-content: center;
  direction: ltr;
}

.message-tip img {
  width: 12px;
  height: 12px;
  margin-right: 2px;
}

.message-red-tip {
  color: white;
  background-color: rgb(255 0 0 / 25%);
}

.message-before {
  font-size: 13px;
  color: #999999 !important;
  margin: 0 8px;
  height: 24px;
  white-space: nowrap;
}

.message-in .message-before {
  direction: ltr;
}

.message-out .message-before {
  direction: rtl;
}

.message-before .message-send-time {
  direction: ltr;
  display: inline-block;
}

.message-in {
  direction: ltr;
  text-align: left;
}

.message-out {
  direction: rtl;
  text-align: right;
}

.message-in .message {
  background-color: white;
  margin-left: 8px;
}

.message-out .message {
  background-color: #CCEBFF;
  margin-right: 8px;
}

.message-in .message-avatar {
  margin-left: 20px;
}

.message-out .message-avatar {
  margin-right: 20px;
}

@media (max-width: 425px) {
  .message-in .message-avatar {
    margin-left: 10px;
  }

  .message-out .message-avatar {
    margin-right: 10px;
  }
}

.group .message-avatar {
  margin-top: 4px;
}

.private .message-avatar {
  margin-top: 20px;
}

.message-avatar {
  width: 35px;
  height: 35px;
  border-radius: 50%;
}

.message-name-title {
  display: inline-block;
  margin: 0 0 4px 0;
}

.message-name-title:deep(.message-name-title-display-name) {
  direction: ltr;
  display: inline-block;
}

.message-in .message-name-title {
  direction: ltr;
  margin-right: 5px;
}

.message-out .message-name-title {
  direction: rtl;
  margin-left: 5px;
}

.message-msg-side {
  max-width: calc(100% - 140px);
}

@media (max-width: 425px) {
  .message-msg-side {
    max-width: 70%;
  }
}

.message-send-time {
  opacity: 0;
}

.message:deep(.message-super-emoji-lottie) {
  /*width: 125px;*/
  height: 125px;
  max-width: 200px;
}

.message:deep(.message-emoji-png, .msg-preview-emoji), .notice:deep(.msg-preview-emoji), .message-name-title:deep(.msg-preview-emoji) {
  height: 17px;
  position: relative;
  top: -2px;
}

.message-name-title:deep(.msg-preview-emoji) {
  top: 0;
}

.message:has(.message-markdown-box) {
  padding: 10px 9px;
  width: min(80%, 430px);
  max-width: 430px;
}

.message:has(.audio-message) {
  padding: 0 2px;
}

.message:has(.message-box-less) {
  background: #00000000 !important;
  overflow: hidden;
  padding: 0;
}

.message:deep(.at-somebody-link) {
  cursor: pointer;
}

.message:deep(.message-image), .message:deep(.message-video) {
  max-width: 100%;
  max-height: 500px;
  border-radius: 5px;
  width: auto; /* 或 100% */
  height: auto;
  object-fit: contain;
  display: block;
  margin: 4px 0;
}

.message:has(.message-emoji-picture) {
  max-width: 185px;
}

.message:deep(.message-box-less.message-image) {
  margin: unset;
}

</style>

<style>
.darkness-effect.message-box-less.message-image {
  backdrop-filter: brightness(100%); /* 背景变暗 */
}

.darkness-effect {
  filter: brightness(90%);
}

.show-message-time .message-send-time {
  opacity: 1;
}
</style>

<style scoped>
.notice-container {
  height: 50px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}

.notice {
  display: inline-block;
  border-radius: 15px;
  background-color: rgb(255 255 255 / 50%);
  padding: 2px 8px;
  font-size: 12px;
  color: gray;
  white-space: nowrap;
}

.notice:deep(.notice-emoji-png) {
  height: 15px;
  margin: -2px 1px 0 1px;
}

.notice:deep(.notice-execute-command) {
  color: #2d77e5;
  cursor: pointer;
  text-decoration: none;
}
</style>