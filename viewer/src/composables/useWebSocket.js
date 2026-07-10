import { ref, onUnmounted, watch } from 'vue'
import axios from 'axios'
import { nanoid } from "nanoid";

export function useWebSocket(url, { onMessage, onNewContact, onNotice }) {
  const socket = ref(null)
  const lastMessageId = ref(0) // 记录最后收到的消息ID
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = Infinity // 无限重连
  const reconnectInterval = 3000 // 重连间隔
  const isConnected = ref(false)
  const shouldSync = ref(false) // 是否需要同步消息
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

  // 存储正在等待响应的 send_action 回调
  const pendingActions = new Map()

  const onReceiveMessage = (message, echo_msg = false) => {
    try {
      // 检查是否是 send_action 的响应
      if (message.type === 'send_action_response') {
        const echo = message.echo
        if (echo && pendingActions.has(echo)) {
          const { resolve, reject } = pendingActions.get(echo)
          pendingActions.delete(echo)
          if (message.status === 'ok') {
            resolve(message.data)
          } else {
            reject(new Error(message.message || 'Action failed'))
          }
        }
        return
      }

      if (message.id > lastMessageId.value) {
        lastMessageId.value = message.id
      }
      if (echo_msg) {
        console.log(message.post_type === 'notice' ? "收到新通知:" : "收到新消息:", message);
      }
      handleNewMessage(message)
      handleNewNotice(message)
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
    }
  }

  /**
   * 通过 WebSocket 发送 action 请求并等待响应
   * @param {string} action - OneBot action 名称
   * @param {object} params - action 参数
   * @param {number} timeout - 超时时间(毫秒)
   * @returns {Promise<any>} action 响应数据
   */
  const sendAction = (action, params = {}, timeout = 60000) => {
    return new Promise((resolve, reject) => {
      if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'))
        return
      }

      const echo = nanoid()

      pendingActions.set(echo, { resolve, reject })

      // 超时处理
      const timer = setTimeout(() => {
        if (pendingActions.has(echo)) {
          pendingActions.delete(echo)
          reject(new Error(`Action "${action}" timed out after ${timeout}ms`))
        }
      }, timeout)

      // 发送请求
      socket.value.send(JSON.stringify({
        type: 'send_action',
        action: action,
        params: params,
        echo: echo
      }))

      // console.log(`[sendAction] 发送 action: ${action}`, params)
    })
  }

  // 同步新消息
  const syncMessages = async () => {
    try {
      const response = await axios.get(apiBaseUrl + '/api/sync', {
        params: { last_id: lastMessageId.value }
      })

      if (response.data.status === 'success') {
        response.data.data.forEach(message => {
          onReceiveMessage(message)
        })
        shouldSync.value = false
      }
    } catch (error) {
      console.error('Sync failed:', error)
      // 同步失败，稍后重试
      setTimeout(syncMessages, 5000)
    }
  }

  // 处理新消息
  const handleNewMessage = (message) => {
    if (!["message", "message_sent"].includes(message.post_type)) {
      return
    }

    onMessage(message)

    // 检查是否是新的联系人
    const contactId = message.message_type === 'group' ? message.group_id : message.target_id
    const contactType = message.message_type
    const event = typeof message.event === 'string' ? JSON.parse(message.event) : message.event;
    const contactName = event?.group_name || event?.sender?.nickname

    onNewContact({
      contact_id: contactId,
      type: contactType,
      name: contactName,
      last_time: message.created_at,
      latest_msg: JSON.stringify(event),
      max_cursor: {
        type: "real_seq",
        value: message.real_seq
      }
    })
  }

  const handleNewNotice = notice => {
    if (notice.post_type !== 'notice') {
      return
    }

    onNotice(notice)

    if (
      notice.sub_type === 'poke' ||
      (notice.notice_type === 'essence' && notice.sub_type === 'add') ||
      (notice.notice_type === 'group_ban' && ['ban', 'lift_ban'].includes(notice.sub_type)) ||
      (notice.notice_type === 'group_increase' && ['approve', 'invite'].includes(notice.sub_type)) ||
      (notice.notice_type === 'group_decrease' && notice.sub_type === 'kick_me')
    ) {
      const type = notice.group_id ? "group" : "private"
      const contact_id = notice.group_id || notice.user_id

      onNewContact({
        contact_id: contact_id,
        type: type,
        name: null,
        last_time: notice.created_at,
        latest_msg: notice.event,
        max_cursor: {
          type: "id",
          value: notice.id
        }
      })
    }
  }

  // 连接WebSocket
  const connect = () => {
    socket.value = new WebSocket(url)

    socket.value.onopen = () => {
      isConnected.value = true
      reconnectAttempts.value = 0
      console.log('WebSocket connected')

      // 连接成功后同步消息
      if (shouldSync.value) {
        syncMessages()
      }
    }

    socket.value.onmessage = (event) => {
      onReceiveMessage(JSON.parse(event.data), true)
    }

    socket.value.onclose = () => {
      isConnected.value = false
      console.log('WebSocket disconnected')

      // 标记需要同步
      shouldSync.value = true

      // 拒绝所有 pending 的 action
      for (const [echo, { reject }] of pendingActions) {
        reject(new Error('WebSocket disconnected'))
      }
      pendingActions.clear()

      // 无限重连
      if (reconnectAttempts.value < maxReconnectAttempts) {
        reconnectAttempts.value++
        const delay = Math.min(reconnectInterval * reconnectAttempts.value, 30000) // 最大30秒间隔
        console.log(`Reconnecting in ${delay / 1000} seconds...`)
        setTimeout(connect, delay)
      }
    }

    socket.value.onerror = (error) => {
      console.error('WebSocket error:', error)
      socket.value.close()
    }
  }

  // 初始化连接
  connect()

  // 组件卸载时关闭连接
  onUnmounted(() => {
    if (socket.value) {
      socket.value.close()
    }
  })

  // 暴露给组件的API
  return {
    socket,
    isConnected,
    lastMessageId,
    syncMessages,
    sendAction
  }
}