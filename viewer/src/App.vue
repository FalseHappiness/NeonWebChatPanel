<script setup>
import { onMounted, onUnmounted, ref, watch, provide } from 'vue'
import { useWebSocket } from './composables/useWebSocket'
import ContactList from './components/ContactList.vue'
import ChatArea from './components/ChatArea.vue'
import {
  fetchContacts,
  fetchEssenceMessages, fetchLoginInfo,
  fetchMessages, fetchSetGroupRemark,
  getFriendsDisplayName,
  getGroupUsersDisplayName, setGroupNameCache, wsUri
} from "./utils/backend-api.js";
import { showErrorToast, showToast } from "./utils/toast.js";
import { destroyContextMenu, initContextMenu } from "./utils/context-menu.js";

const contacts = ref([])
const loadingContacts = ref(false)
const activeContact = ref(null)
const chatArea = ref(null)

// 初始化WebSocket
const {
  isConnected,
  lastMessageId,
  syncMessages,
  socket,
  sendAction
} = useWebSocket(wsUri, {
  onMessage: (message) => {
    // 检查消息是否属于当前活跃的联系人
    const isCurrentContact = activeContact.value && (
      (message.message_type === 'group' &&
        activeContact.value.type === 'group' &&
        message.group_id === activeContact.value.contact_id) ||
      (message.message_type === 'private' &&
        activeContact.value.type === 'private' &&
        message.target_id === activeContact.value.contact_id)
    )

    if (isCurrentContact) {
      chatArea.value?.$refs?.scroller?.addMessage(message)
    }
  },
  onNotice: notice => {
    if (['group_recall', 'friend_recall'].includes(notice.notice_type)) {
      const is_group = notice.notice_type === 'group_recall'
      const isCurrentContact = activeContact.value && (
        (
          is_group &&
          activeContact.value.type === 'group' &&
          notice.group_id === activeContact.value.contact_id
        ) ||
        (
          !is_group &&
          activeContact.value.type === 'private' &&
          (notice.user_id === activeContact.value.contact_id || notice.user_id === notice.self_id)
        )
      )
      if (isCurrentContact) {
        const visibleMessages = chatArea.value?.$refs?.scroller?.visibleMessages
        if (visibleMessages) {
          visibleMessages.forEach(msg => {
            if (msg?.message_id === notice.message_id) {
              let event = msg.event
              event = typeof event === 'string' ? JSON.parse(event) : event
              event.recall_operator = is_group ? notice.operator_id : notice.user_id
              msg.event = JSON.stringify(event)
            }
          })
        }
      }
    } else if (
      notice.sub_type === 'poke' ||
      (notice.notice_type === 'essence' && notice.sub_type === 'add') ||
      (notice.notice_type === 'group_ban' && ['ban', 'lift_ban'].includes(notice.sub_type)) ||
      (notice.notice_type === 'group_increase' && ['approve', 'invite'].includes(notice.sub_type)) ||
      (notice.notice_type === 'group_decrease' && notice.sub_type === 'kick_me')
    ) {
      const is_group = !!notice.group_id
      const isCurrentContact = activeContact.value && (
        (
          is_group &&
          activeContact.value.type === 'group' &&
          notice.group_id === activeContact.value.contact_id
        ) ||
        (
          !is_group &&
          activeContact.value.type === 'private' &&
          notice.user_id === activeContact.value.contact_id
        )
      )
      if (isCurrentContact) {
        chatArea.value?.$refs?.scroller?.addMessage(notice)
      }
    }
  },
  onNewContact: (newContact) => {
    // 检查是否已存在该联系人
    const contactExists = contacts.value.some(
      c => c.contact_id === newContact.contact_id && c.type === newContact.type
    )

    if (!contactExists) {
      contacts.value.unshift({
        contact_id: newContact.contact_id,
        type: newContact.type,
        name: newContact.name,
        last_time: newContact.last_time,
        latest_msg: newContact.latest_msg,
        // min_id: newContact.min_id,
        // max_id: newContact.max_id,
        // max_real_seq: newContact.max_real_seq,
        // min_real_seq: newContact.min_real_seq,
        max_cursor: newContact.max_cursor,
        min_cursor: newContact.min_cursor,
      })
    } else {
      const index = contacts.value.findIndex(
        c => c.contact_id === newContact.contact_id && c.type === newContact.type
      )
      if (index !== -1) {
        contacts.value[index].name = newContact.name
        contacts.value[index].last_time = newContact.last_time
        contacts.value[index].latest_msg = newContact.latest_msg
        // contacts.value[index].min_id = newContact.min_id
        // contacts.value[index].max_id = newContact.max_id
        // contacts.value[index].max_real_seq = newContact.max_real_seq
        // contacts.value[index].min_real_seq = newContact.min_real_seq
        contacts.value[index].max_cursor = newContact.max_cursor
        contacts.value[index].min_cursor = newContact.min_cursor
        const [contact] = contacts.value.splice(index, 1)
        contacts.value.unshift(contact)
      }
    }
  }
})

// 提供 sendAction 给子组件
provide('sendAction', sendAction)

// 监听连接状态变化
watch(isConnected, (connected) => {
  if (connected) {
    console.log('WebSocket reconnected, checking for missed messages...')
  }
})

// 获取联系人列表
const getContacts = async () => {
  loadingContacts.value = true
  try {
    contacts.value = await fetchContacts()

    // console.log(contacts)
  } catch (error) {
    console.error('Failed to fetch contacts:', error)
  } finally {
    loadingContacts.value = false
  }
}

const fetchEssenceMessagesWrapper = async (group_id, only_real_seq) => {
  try {
    return await fetchEssenceMessages(group_id, only_real_seq)
  } catch (e) {
    console.error('获取群精华消息列表错误', e)
  }
  return []
}

const getEssenceMsgRealSeqList = async () => {
  if (activeContact.value.type === 'group') {
    const list = await fetchEssenceMessagesWrapper(activeContact.value.contact_id, true)
    activeContact.value.essence_real_seq_list = list
    return list
  }
  return []
}

const changeEssenceMsg = (real_seq, set) => {
  if (set) {
    activeContact.value.essence_real_seq_list.push(real_seq)
  } else {
    activeContact.value.essence_real_seq_list = activeContact.value.essence_real_seq_list.filter(item => item !== real_seq)
  }
}

// 获取消息历史
const getMessages = async (
  message_id,
  id,
  count,
  include,
  direction,
  cursor_time,
  notice_before_cursor,
  notice_after_cursor,
  notice_message = false
) => {
  let messages = []
  if (!activeContact.value) return messages

  try {
    const params = {
      limit: count,
      cursor: id,
      direction,
      include_cursor: include,
      message_id,
      cursor_type: (notice_message || !id) ? "id" : "real_seq",
      cursor_time,
      notice_before_cursor,
      notice_after_cursor
    }

    if (activeContact.value.type === 'group') {
      params.message_type = 'group'
      params.group_id = activeContact.value.contact_id
    } else {
      params.message_type = 'private'
      params.target_id = activeContact.value.contact_id
    }
    let response, essence_real_seq_list;

    if (params.message_type === 'group') {
      [response, essence_real_seq_list] = await Promise.all([
        fetchMessages(params),
        fetchEssenceMessagesWrapper(params.group_id, true),
        getGroupUsersDisplayName(params.group_id),
      ])
      activeContact.value.essence_real_seq_list = essence_real_seq_list
    } else {
      response = await fetchMessages(params)
    }

    messages = response.messages
    // activeContact.value.max_id = response.max_id
    // activeContact.value.min_id = response.min_id
    // if (response.max_real_seq) {
    //   activeContact.value.max_real_seq = response.max_real_seq
    // }

    if (messages.length === (include ? 1 : 0)) {
      const keys = (direction === 'prev' && message_id === 0 && !id) ? ['min_cursor', 'max_cursor'] : [direction === 'prev' ? "min_cursor" : "max_cursor"]
      keys.forEach(key => {
        activeContact.value[key] = {
          type: (notice_message || !id) ? "id" : "real_seq",
          value: id
        }
      })
    } else if (messages.length < count) {
      const msg = direction === 'prev' ? messages[0] : messages[messages.length - 1]
      activeContact.value[direction === 'prev' ? "min_cursor" : "max_cursor"] = {
        type: msg.real_seq ? "real_seq" : "id",
        value: msg.real_seq || msg.id
      }
    }

    if (direction === 'prev' && message_id === 0 && !id) {
      const msg = messages[messages.length - 1]
      activeContact.value.max_cursor = {
        type: msg.real_seq ? "real_seq" : "id",
        value: msg.real_seq || msg.id
      }
    }

    // 更新最后收到的消息ID
    if (messages.length > 0) {
      const response_messages = response.messages
      if (response_messages.length) {
        const response_id = response_messages
          .filter(obj => typeof obj.id === 'number')
          .map(obj => obj.id);
        lastMessageId.value = Math.max(lastMessageId.value, ...response_id)
      }
    }
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    showToast('error', '获取消息错误')
  }
  return messages
}

// 选择联系人
const selectContact = (contact) => {
  if (chatArea.value?.$refs?.scroller?.initializing) return
  // 如果已经是当前联系人，则不执行任何操作
  if (activeContact.value?.contact_id === contact?.contact_id &&
    activeContact.value?.type === contact?.type) {
    return
  }
  activeContact.value = contact
}

const setRealContactName = name => {
  activeContact.value.name = name
}

const selfInfo = ref(null)

const changeGroupContactRemark = async (contact_id, remark) => {
  const result = await fetchSetGroupRemark(
    contact_id,
    remark
  );
  if (result.status === 'ok') {
    for (const contact of contacts.value) {
      if (contact.contact_id === contact_id) {
        contact.remark = remark;
        contact.name = remark || contact.real_name
        setGroupNameCache(contact_id, contact.name)
      }
    }
  } else {
    console.log("Change group contact remark error: ", contact_id, remark, result)
    showErrorToast(`改变群 ${contact_id} 备注为 ${remark} 失败`)
  }
}

// 初始化数据
onMounted(() => {
  initContextMenu()
  getFriendsDisplayName()
  getContacts()
  fetchLoginInfo().then(
    info => selfInfo.value = info
  )
});

onUnmounted(() => {
  destroyContextMenu()
  socket.value?.close()
})
</script>

<template>
  <div class="chat-container">
    <ContactList
      :contacts="contacts"
      :active-contact="activeContact"
      :loading="loadingContacts"
      @select="selectContact"
    />
    <ChatArea
      :active-contact="activeContact"
      :get-messages="getMessages"
      :select-contact="selectContact"
      :self-info="selfInfo"
      ref="chatArea"
      @get-essence-msg-real-seq-list="getEssenceMsgRealSeqList"
      @change-essence-msg="changeEssenceMsg"
      @set-real-contact-name="setRealContactName"
      @change-group-contact-remark="changeGroupContactRemark"
    />
  </div>
</template>

<style scoped>
.chat-container {
  display: flex;
  height: 100%;
  width: 100%;
}
</style>

<style>
@font-face {
  font-family: "Color Emoji";
  src: url("/QQ/fonts/AppleColorEmoji.ttf") format('truetype');
  unicode-range: U+1F300-1F5FF, U+1F600-1F64F, U+1F680-1F6FF, U+2600-26FF, U+2700-27BF;/*不包含空白符及数字*/
}

@font-face {
  font-family: "Color Emoji Fix";
  src: url("/QQ/fonts/AppleColorEmoji-fix.ttf") format('truetype');
}

* {
  outline: none;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}

body, html {
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

:root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  font-family: "Color Emoji", system-ui, "PingFang SC", PingFangSC-Regular, "Microsoft YaHei", "Hiragino Sans GB", "Heiti SC", "WenQuanYi Micro Hei", Arial, Helvetica, sans-serif, "Apple Braille", "Color Emoji Fix"
}

.can-drag {
  -webkit-app-region: drag;
}

.cannot-drag {
  -webkit-app-region: no-drag;
}

.no-user-select {
  -webkit-user-select: none; /* Safari */
  -khtml-user-select: none; /* Konqueror HTML */
  -moz-user-select: none; /* Firefox */
  -o-user-select: none; /* Opera */
  user-select: none; /* Generic */

  -webkit-user-drag: none; /* Safari */
  -khtml-user-drag: none; /* Konqueror HTML */
  -moz-user-drag: none; /* Firefox */
  -o-user-drag: none; /* Opera */
  user-drag: none; /* Generic */
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}

a:hover {
  color: #535bf2;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

h1 {
  font-size: 3.2em;
  line-height: 1.1;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #646cff;
}

button:focus,
button:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}

.card {
  padding: 2em;
}

#app {
  max-width: 3840px;
  max-height: 2160px;
  width: 100%;
  height: 100%;
  margin: 0;
  top: 50%;
  position: fixed;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
