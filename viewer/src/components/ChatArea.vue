<script setup>
import { ref, computed, nextTick, watch, onMounted, toRaw, provide, onUnmounted } from 'vue'
import MessageItem from './MessageItem.vue'
import {
  fetchDisplayName,
  fetchGroupMemberInfo,
  fetchGroupNotice,
  fetchMsg, fetchSetGroupMemberRemark, fetchSetGroupRemark,
  getGroupUsers, setGroupUserNameCache
} from "../utils/backend-api.js";
import PageScroller from "./utils/PageScroller.vue";
import SimpleBarCore from "simplebar";
import 'simplebar/dist/simplebar.min.css';
import MessageInputBox from "./MessageInputBox.vue";
import { useGlobalStore } from "../store/global.js";
import { sortGroupUsers } from "../utils/others.js";
import Tooltip from "./utils/Tooltip.vue";
import ColorSvg from "./utils/ColorSvg.vue";

const props = defineProps({
  activeContact: Object,
  messages: Array,
  getMessages: Function,
  selectContact: Function,
  selfInfo: Object
})

const emit = defineEmits([
  'get-essence-msg-real-seq-list',
  'change-essence-msg',
  'set-real-contact-name',
  'change-group-contact-remark'])

const scroller = ref(null)
const inputer = ref(null)

const displayName = ref('') // 使用ref来管理名称状态
const isLoading = ref(false) // 加载状态
const isError = ref(false) // 错误状态
// const isTempSession = ref(false)
const showContactMore = ref(false)

const getName = async () => {
  if (props.activeContact) {
    let id = props.activeContact.contact_id;
    let type = props.activeContact.type;
    if (tempSession.value) {
      let event = props.activeContact.latest_msg;
      if (typeof event === 'string') event = JSON.parse(event);
      id = [event.group_id, id]
      type = 'group_user'
    }
    const result = await fetchDisplayName(
      id,
      type,
      newName => {
        displayName.value = newName;
      }
    );

    emit('set-real-contact-name', result.name)

    // 更新本地状态
    displayName.value = result.name;
    isLoading.value = false;
    isError.value = result.error;
  }
}

const tempSession = computed(() => {
  if (props.activeContact) {
    if (props.activeContact.latest_msg) {
      let event = props.activeContact.latest_msg;
      event = typeof event === 'string' ? JSON.parse(event) : event;
      return event.message_type === 'private' && event.sub_type === 'group' ? "临时会话" : ""
    }
  }
})

const groupUsers = ref(null)

const getMessages = async (msg, count, include = false, direction = 'next') => {
  const post_type = msg?.post_type || 'message'
  const notice_message = post_type === 'notice'
  const cursor_time = msg?.time || null
  const cursor = notice_message ? msg.id : msg?.real_seq
  const messages = await props.getMessages(
    msg?.message_id || (notice_message ? null : 0),
    cursor,
    count,
    include,
    direction,
    cursor_time,
    msg?.notice_before_cursor,
    msg?.notice_after_cursor,
    notice_message
  )
  if (props.activeContact.type === 'group') {
    groupUsers.value = sortGroupUsers(
      Object.entries(getGroupUsers(props.activeContact.contact_id)).map(([key, value]) => ({
        ...value,
        qq: key
      }))
    );
  }
  return messages
}

const getNewerMessages = async (msg, _, count, include) => {
  return await getMessages(msg, count, include, 'next')
}

const getOlderMessages = async (msg, _, count, include) => {
  return await getMessages(msg, count, include, 'prev')
}

const getMsgId = msg => {
  return `${msg?.id}_${msg?.real_seq}_${msg?.time}`
}

const detectMsgCursor = (msg, key) => {
  const cursor = props.activeContact[key]
  if (cursor) {
    if (msg[cursor.type] === cursor.value) {
      return true
    }
  }
  return false
}

const detectIsLatestMsg = msg => {
  return detectMsgCursor(msg, 'max_cursor')
}

const detectIsOldestMsg = msg => {
  return detectMsgCursor(msg, 'min_cursor')
}

// 防止通过 NapCat 接口获取的 message 没有存到数据库所以设置 current.notice_before_message current.notice_before_message
const handleVisibleMessagesLoadMore = visibleMessages => {
  const max_cursor = props.activeContact.max_cursor
  const min_cursor = props.activeContact.min_cursor
  const check_max_cursor = max_cursor && max_cursor.type === 'id'
  const check_min_cursor = min_cursor && min_cursor.type === 'id'
  // 遍历所有消息
  for (let i = 0; i < visibleMessages.length; i++) {
    const current = visibleMessages[i];

    // 只处理 post_type 为 notice 的项
    if (current.post_type === 'notice') {
      // 如果 notice_before_message 未设置或为 -1，查找前面的最近 real_seq
      if ([null, undefined].includes(current.notice_before_message) || current.notice_before_message === -1) {
        // 向前查找最近的 real_seq
        for (let j = i - 1; j >= 0; j--) {
          const prevItem = visibleMessages[j];
          if (prevItem.real_seq !== undefined) {
            current.notice_before_message = prevItem.real_seq;
            break;
          } else if (check_min_cursor && prevItem.id === min_cursor.value) {
            // 最旧
            current.notice_before_message = 0
            break;
          }
        }
      }

      // 如果 notice_after_message 未设置或为 -1（之后消息可能更新，所以始终查找），查找后面的最近 real_seq
      // if ([null, undefined].includes(current.notice_after_message) || current.notice_after_message === -1) {
      // 向后查找最近的 real_seq
      for (let j = i + 1; j < visibleMessages.length; j++) {
        const nextItem = visibleMessages[j];
        if (nextItem.real_seq !== undefined) {
          current.notice_after_message = nextItem.real_seq;
          break;
        } else if (check_max_cursor && nextItem.id === max_cursor.value) {
          // 最新
          current.notice_after_message = 0
          break;
        }
      }
      // }
    }
  }

  return visibleMessages;
}

const handleScrollerMounted = async () => {
  // 等待组件完全渲染
  await nextTick();

  // 获取内部元素
  const chatWrapper = scroller?.value?.$refs?.chatWrapper

  if (chatWrapper) {
    new SimpleBarCore(chatWrapper, { autoHide: false })

    scroller.value.changeWrapperElement(chatWrapper.querySelector('.simplebar-content-wrapper'))

    /*

    // 处理图片加载时高度变化导致布局抖动
    // 创建MutationObserver来监听新增的图片
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // 遍历所有新增的节点（包括嵌套的）
        mutation.addedNodes.forEach((node) => {
          // 如果节点是元素（而非纯文本等），检查它及其子节点是否有图片
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查当前节点是否是图片
            if (node.classList.contains('message-image') || node.classList.contains('message-video')) {
              observeImageResize(node);
            }
            // 检查所有子节点中的图片（递归或querySelectorAll）
            const images = node.querySelectorAll('.message-image, .message-video');
            images.forEach(img => observeImageResize(img));
          }
        });
      });
    });

    const saveImageSize = (img, currentSize) => {
      if (currentSize === undefined) {
        const rect = img.getBoundingClientRect()
        img.beforeSize = img.currentSize = {
          width: rect.width,
          height: rect.height
        }
        img.heightDifference = 0
      } else {
        const beforeSize = img.beforeSize = img.currentSize
        img.currentSize = {
          width: currentSize.width,
          height: currentSize.height
        }
        let scalingRate = currentSize.width / beforeSize.width
        if (scalingRate === Infinity) {
          scalingRate = 1
        }
        img.heightDifference = currentSize.height - beforeSize.height * scalingRate
      }
    }

    const handleImageResize = async (img) => {
      const difference = img?.heightDifference | 0
      // console.log(scroller?.value?.wrapperScrollOffset().bottom, difference)
      // if (scroller?.value?.wrapperScrollOffset().bottom - difference < 10) {
      //   await nextTick()
      //   scroller?.value?.scrollToVisibleBottom()
      // }
      if (scroller?.value?.wrapper) {
        scroller.value.wrapper.scrollTop += difference
      }
    }

    // 创建ResizeObserver来监听图片尺寸变化
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        // console.log('图片高度变化:', entry.target.src, entry.contentRect.height, entry.target.beforeHeight);
        const img = entry.target
        saveImageSize(img, entry.contentRect)
        handleImageResize(img)
      }
    });

    // 观察图片尺寸变化
    function observeImageResize(img) {
      if (!img.complete) {
        saveImageSize(img)
        resizeObserver.observe(img);
        img.addEventListener('load', function () {
          handleImageResize(img)
          resizeObserver.unobserve(img)
        })
        img.addEventListener('error', () => {
          handleImageResize(img)
          console.log('图片加载失败:', img.src);
          // resizeObserver.unobserve(img);
          const fallbackLink = img.dataset.fallbackLink
          const originalLink = img.dataset.originalLink
          if (originalLink || !fallbackLink) {
            console.log('图片彻底加载失败:', originalLink || img.src, fallbackLink)
          } else if (fallbackLink) {
            img.dataset.originalLink = img.src
            img.src = fallbackLink
          }
        })
      }
    }

    // 开始观察容器内的子节点变化
    mutationObserver.observe(chatWrapper, {
      childList: true,
      subtree: true
    });

    // 观察已存在的图片
    chatWrapper.querySelectorAll('.message-image, .message-video').forEach(img => {
      observeImageResize(img);
    });

     */
  }
}

// 消息间隔超过5分钟显示时间提示
const isShowTimeTip = (old_msg, new_msg) => {
  const old_time = old_msg?.time || 0;
  const new_time = new_msg?.time || 0;
  return new_time - old_time > 300
}

provide("visibleMessages", () => {
  return scroller?.value?.visibleMessages
})

provide("scrollToMidwayMsg", (info) => {
  scroller?.value?.scrollToMidwayButton(info, true)
})

const quoteMessage = (msg, user) => {
  inputer?.value?.handleQuoteMessage(msg)
  if (user) {
    inputer?.value?.insertAtUserAtCursor(user)
  }
}

const findMessage = async (message_id) => {
  const vm = scroller?.value?.visibleMessages
  let msg;
  if (vm && Array.isArray(vm)) {
    msg = vm.find(
      item => item.message_id === parseInt(message_id)
    )
  }
  const isEmptyObject = (obj) => {
    return typeof obj === 'object' && Object.keys(obj).length === 0;
  }
  if (!msg || isEmptyObject(msg)) {
    msg = await fetchMsg(message_id)
  }
  return msg
}

useGlobalStore().findMessage = msg_id => findMessage(msg_id)

provide("findMessage", msg_id => findMessage(msg_id))


// 联系人更改时获取名称
watch(() => props.activeContact, (newVal, oldVal) => {
  if (newVal?.contact_id !== oldVal?.contact_id || newVal?.type !== oldVal?.type) {
    groupUsers.value = null
  }
  initContactInfo();
}, { deep: true })

const isGroup = computed(() => {
  return props.activeContact?.type === 'group';
})

const groupNotifications = ref(null);

const latestGroupNoticeMsg = computed(() => {
  return groupNotifications.value?.[0]?.message;
})

const getGroupNotice = async () => {
  groupNotifications.value = await fetchGroupNotice(props.activeContact.contact_id);
}

const groupSelfInfo = ref(null);

watch(() => props.selfInfo, (newVal, oldVal) => {
  if (oldVal == null && newVal != null) {
    getGroupSelfInfo()
  }
})

const getGroupSelfInfo = async () => {
  if (isGroup.value) {
    if (props.selfInfo?.user_id) {
      groupSelfInfo.value = await fetchGroupMemberInfo(props.activeContact.contact_id, props.selfInfo.user_id);
      groupSelfRemarkModel.value = groupSelfInfo?.value?.card;
    }
  }
}

const groupSelfRemarkModel = ref("");
const groupRemarkModel = ref("");

const handleGroupSelfRemarkChange = async () => {
  if (groupSelfRemarkModel.value !== groupSelfInfo?.value?.card) {
    const params = [props.activeContact.contact_id, props.selfInfo.user_id, groupSelfRemarkModel.value];
    const result = await fetchSetGroupMemberRemark(...params)
    if (result.status === 'ok') {
      setGroupUserNameCache(...params)
    }
  }
}

const handleGroupRemarkChange = () => {
  if (groupRemarkModel.value !== props.activeContact?.remark) {
    emit('change-group-contact-remark', props.activeContact.contact_id, groupRemarkModel.value)
  }
}

const handleEnterBlur = (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()
    e.target.blur()
  }
}

const initContactInfo = () => {
  // 组件挂载时获取名称
  getName()
  if (isGroup.value) {
    groupRemarkModel.value = props.activeContact?.remark;
    getGroupNotice()
    getGroupSelfInfo()
  }
}

onMounted(initContactInfo)
</script>

<template>
  <div class="chat-area" :class="{ 'active-contact': activeContact }">
    <div class="cannot-drag window-controls" v-if="false">
      <div class="window-control-btn window-control-minimize">
        <img src="/static/assets/Minimize.svg" alt="" class="no-user-select">
      </div>
      <div class="window-control-btn window-control-max">
        <img src="/static/assets/Max.svg" alt="" class="no-user-select">
      </div>
      <div class="window-control-btn window-control-close">
        <img src="/static/assets/Close.svg" alt="" class="no-user-select">
      </div>
    </div>

    <div v-if="activeContact" class="border-bottom chat-area-head">
      <span class="chat-area-head-name" :class="{'text-error': isError}">
      <img class="chat-area-go-back-btn" alt="" src="/QQ/icons/arrow_left_24.svg"
           @click="() => { selectContact(null) }">
        {{ displayName }}
        <span v-if="tempSession">&nbsp;</span>
        <small class="text-muted" v-if="tempSession" style="font-size: 100%">
          {{ tempSession }}
        </small>
      </span>
      <span class="chat-area-head-control" v-if="isGroup">
        <Tooltip
          content="更多"
          use-target-slot
          placement="bottom"
        >
          <template #target>
            <img
              alt="" src="/QQ/icons/more_24.svg"
              class="chat-area-head-control-btn"
              @click="showContactMore = !showContactMore">
          </template>
        </Tooltip>
      </span>
    </div>

    <div v-if="isGroup" class="chat-area-contact-more"
         :style="{ right: showContactMore ? '0' : '-100%' }">
      <div class="chat-area-contact-more-area chat-area-contact-info">
        <img
          :src="`https://p.qlogo.cn/gh/${activeContact.contact_id}/${activeContact.contact_id}/100`"
          alt=""
          class="chat-area-contact-logo">
        <div>
          {{ displayName }}
          <br>
          <small style="color: gray;display: block;margin-top: -4px;">{{ activeContact.contact_id }}</small>
        </div>
      </div>

      <div class="chat-area-contact-more-area">
        群聊成员
      </div>

      <div class="chat-area-contact-more-area with-title" data-title="群公告">
        <span v-if="groupNotifications == null" style="color: #999;">内容获取中</span>
        <span v-else-if="!groupNotifications?.length" style="color: #999;">未设置</span>
        <span v-else class="overflow-ellipsis">
          <span v-if="latestGroupNoticeMsg?.image?.length">【图片】</span>
          <span v-html="latestGroupNoticeMsg.text"></span>
        </span>
      </div>

      <label
        v-if="groupSelfInfo"
        class="chat-area-contact-more-area with-title input-content"
        data-title="我的本群昵称">
        <input v-model="groupSelfRemarkModel"
               @blur="handleGroupSelfRemarkChange"
               @keydown="handleEnterBlur"
               type="text"
               placeholder="填写我的本群昵称">
      </label>

      <label
        class="chat-area-contact-more-area with-title input-content"
        data-title="群聊备注">
        <input v-model="groupRemarkModel"
               @blur="handleGroupRemarkChange"
               @keydown="handleEnterBlur"
               type="text"
               placeholder="填写备注">
      </label>
    </div>

    <div v-if="!activeContact" class="display-flex justify-content-center align-items-center height-100">
      <div class="text-center text-muted">
        <h2>选择联系人以开始聊天</h2>
      </div>
    </div>

    <page-scroller
      v-else-if="activeContact"
      class="messages-container"
      ref="scroller"
      :get-id-function="getMsgId"
      :detect-is-latest-msg-function="detectIsLatestMsg"
      :detect-is-oldest-msg-function="detectIsOldestMsg"
      id-key="real_seq"
      :page-size="30"
      :at-bottom-distance="100"
      :get-newer-messages="getNewerMessages"
      :get-older-messages="getOlderMessages"
      :container-class="$style['chat-container']"
      :wrapper-class="[
        $style['chat-wrapper'],
        activeContact.type === 'group' ? $style['chat-wrapper-group'] : $style['chat-wrapper-private']
        ]"
      :key="activeContact.contact_id"
      :colors="{ loadingSpinner: '#0099ff' }"
      @mounted="handleScrollerMounted"
      @load-messages="handleVisibleMessagesLoadMore"
    >
      <template #message="{ message, index, messages }">
        <MessageItem
          :message="message"
          :active-contact="activeContact"
          :show-time-notice="isShowTimeTip(messages?.[index - 1], message)"
          @get-essence-msg-real-seq-list="() => {emit('get-essence-msg-real-seq-list')}"
          @change-essence-msg="(real_seq, set) => {emit('change-essence-msg', real_seq, set)}"
          @quote-message="(msg, user) => {quoteMessage(msg, user)}"
        />
      </template>
      <template #empty="{ initializing }">
        <div v-if="initializing" class="text-center text-muted loading-messages">
          加载消息...
        </div>
        <div v-else class="text-center text-muted no-messages">
          暂无消息
        </div>
      </template>
      <template #scroll-to-bottom-btn="{ scrollToBottom }">
        <div class="scroll-to-bottom-btn" @click="scrollToBottom">
          <svg style="transform: translateY(10%);" class="arrow_down_small_16" viewBox="0 0 16 16" fill="none"
               xmlns="http://www.w3.org/2000/svg">
            <path d="M12 6.0001L8.00004 10L4 6" stroke="#6fc6ff" stroke-linejoin="round" stroke-width="1.8"></path>
          </svg>
          <svg style="transform: translateY(-55%);" class="arrow_down_small_16" viewBox="0 0 16 16" fill="none"
               xmlns="http://www.w3.org/2000/svg">
            <path d="M12 6.0001L8.00004 10L4 6" stroke="#0099ff" stroke-linejoin="round" stroke-width="1.8"></path>
          </svg>
        </div>
      </template>
    </page-scroller>

    <message-input-box
      :active-contact="activeContact"
      class="message-input-box"
      :class="{ display: activeContact }"
      :at-group-users="groupUsers"
      ref="inputer"
    ></message-input-box>
  </div>
</template>

<style scoped>
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgb(245, 245, 245);
  max-width: calc(100% - var(--sidebar-width));
  min-width: 390px;
}

.chat-area-head-name {
  font-weight: bold;
  display: flex;
  margin: 0 0 0 15px;
  align-items: center;
}

.chat-area-head {
  height: 52px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.messages-container {
  flex: 1;
  /*height: calc(100% - 60px); !* 减去标题栏高度 *!*/
}

.loading-messages, .no-messages {
  padding: 20px;
  text-align: center;
  font-size: 100%;
}

.margin-br {
  display: block;
  line-height: 15px;
  opacity: 0;
}

.text-error {
  color: #dc3545 !important;
}

.chat-area-go-back-btn {
  display: none;
  width: 20px;
  height: 20px;
  margin: 0 8px 0 0;
}

.message-input-box {
  display: none;
}

.message-input-box.display {
  display: block;
}

.chat-area-head-control {
  margin: 0 5px 0 0;
  display: flex;
  align-items: center;
}

.chat-area-head-control-btn {
  margin: 0 5px;
  width: 32px;
  height: 32px;
  padding: 6px;
  border-radius: 8px;
}

.chat-area-head-control-btn:hover {
  background-color: rgb(200 200 200 / 25%);
}

.chat-area-head-control-btn:active {
  background-color: rgb(200 200 200 / 50%);
}

.chat-area-contact-more {
  position: absolute;
  height: calc(100% - 52px);
  top: 52px;
  width: 350px;
  background-color: #f2f2f2;
  border: 1px solid #dee2e6;
  right: -100%;
  z-index: 5;
  box-shadow: 0 3px 6px 0 #b6b6b68f;
  transition: right ease-in-out 0.2s;
  padding: 18px;
  font-size: 15px;
  gap: 18px;
  display: flex;
  flex-direction: column;
}

.chat-area-contact-more-area {
  border-radius: 8px;
  background-color: white;
  padding: 8px 12px;
  display: block;
  margin: 0;
}


.chat-area-contact-more-area.with-title {
  margin-top: 18px;
}

.chat-area-contact-more-area.with-title:before {
  content: attr(data-title);
  display: block;
  position: absolute;
  margin-top: -32px;
  color: gray;
  font-size: 14px;
}

.chat-area-contact-logo {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin: 5px 10px 5px 5px;
}

.chat-area-contact-info {
  display: flex;
  align-items: center;
}

.chat-area-contact-more-area.input-content {
  outline: 1px solid transparent;
  width: 100%;
}

.chat-area-contact-more-area.input-content input {
  outline: none;
  border: none;
}

.chat-area-contact-more-area.input-content:has(input:focus) {
  outline: 1px solid #0099ff;
}

@media (max-width: 570px) {
  .chat-area {
    position: absolute;
    right: -100%;
    width: 100%;
    opacity: 0;
    transition: opacity 0.1s ease-out, right 0.1s ease-out;
    max-width: unset;
    min-width: unset;
  }

  .chat-area.active-contact {
    right: 0;
    opacity: 1;
  }

  .chat-area-head {
    border-bottom: none !important;
    background-color: #fdfdfd;
    height: 42px;
    align-items: center;
  }

  .chat-area-head-name {
    margin: 8px;
  }

  .chat-area-go-back-btn {
    display: block;
  }

  .chat-area-contact-more {
    width: 100%;
    height: calc(100% - 42px);
    top: 42px;
    box-shadow: none;
  }
}
</style>

<style>
.window-controls {
  position: fixed;
  right: 0;
  top: 0;
  height: 28px;
  /*width: 96px;*/
}

.window-controls .window-control-btn {
  width: 32px;
  height: 28px;
  display: inline-block;
  text-align: center;
  line-height: 26px;
}

.window-controls .window-control-btn:hover {
  background-color: #0000000A;
}

.window-controls .window-control-btn:active {
  background-color: #0000001F;
}

.window-controls .window-control-close:hover, .window-controls .window-control-close:active {
  background-color: #C42B1C;
}

.window-controls .window-control-close:hover img {
  filter: invert(1); /* 颠倒黑色为白色 */
}

.window-controls .window-control-close:active img {
  filter: invert(0.8);
}

.window-controls .window-control-btn img {
  width: 16px;
  height: 16px;
}
</style>

<style module>
.chat-container {
  width: 100%;
  display: block;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.chat-wrapper {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  /*content-visibility: auto;*/
  display: flex;
  flex-direction: column;
  padding-bottom: 5px;
  padding-top: 0;
}

.chat-wrapper-group {
  gap: 5px;
}

.chat-wrapper-private {
  gap: 0;
}
</style>

<style scoped>
.arrow_down_small_16 {
  width: 18px;
  height: 18px;
  display: block;
  margin: auto;
}

.scroll-to-bottom-btn {
  height: 28px;
  border: 1px solid white;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 10%);
  width: 50px;
  border-radius: 114514px;
  background-color: white;
  position: absolute;
  right: 20px;
  bottom: 10px;
}

.scroll-to-bottom-btn:hover {
  border: 1px solid #ececec;
  background-color: #f5f5f5;
}

.scroll-to-bottom-btn:active {
  border: 1px solid #dddddd;
  background-color: #e6e6e6;
}
</style>

<style>
.messages-container .chat-wrapper .simplebar-scrollbar {
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
}

.messages-container .chat-wrapper .simplebar-scrollbar:before {
  width: 7px;
  left: 3px;
}

.messages-container:hover .chat-wrapper .simplebar-scrollbar, .messages-container .chat-wrapper.simplebar-dragging .simplebar-scrollbar {
  opacity: 0.3;
}
</style>