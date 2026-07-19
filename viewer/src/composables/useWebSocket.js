import { ref, onUnmounted } from 'vue'
import { nanoid } from "nanoid";
import { fetchAPIVersionInfo, fetchSyncMessages } from "../utils/backend-api.js";
import { convertWrappedMsgSL } from "../utils/snow-luma-translator.js";
import { useGlobalStore } from "../store/global.js";

export function useWebSocket(url, { onMessage, onNewContact, onNotice }) {
  const socket = ref(null)
  const lastMessageId = ref(0) // 记录最后收到的消息ID
  const reconnectAttempts = ref(0)
  const maxReconnectAttempts = Infinity // 无限重连
  const reconnectInterval = 3000 // 重连间隔
  const isConnected = ref(false)
  const shouldSync = ref(false) // 是否需要同步消息

  // 存储正在等待响应的 send_action 回调
  const pendingActions = new Map()
  // 存储正在等待响应的 req_backend 回调
  const pendingBackendRequests = new Map()

  /**
   * 通用WebSocket请求底层方法（抽取sendAction/reqBackend重复逻辑）
   * @param {object} options - 请求配置
   * @param {string} options.type - 请求类型 send_action / req_backend
   * @param {string} [options.action] - action名称（send_action专用）
   * @param {string} [options.endpoint] - 后端接口地址（req_backend专用）
   * @param {object} options.params - 请求参数
   * @param signal - 终止信号
   * @param {number} timeout - 超时时间(毫秒)
   * @param {Map} pendingMap -  pending回调存储Map
   * @<any>} 请求响应数据
   */
  const _commonWebSocketRequest = (options, signal, timeout, pendingMap) => {
    return new Promise((resolve, reject) => {
      if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not connected'))
        return
      }

      // 如果信号已经中止，立即拒绝
      if (signal && signal.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'))
        return
      }

      const echo = nanoid()

      // 清理 abort 事件监听
      const cleanup = () => {
        if (signal) {
          signal.removeEventListener('abort', onAbort)
        }
      }

      // 监听 abort 信号
      const onAbort = () => {
        if (pendingMap.has(echo)) {
          pendingMap.delete(echo)
          cleanup()
          // 通知后端取消该请求
          if (socket.value && socket.value.readyState === WebSocket.OPEN) {
            socket.value.send(JSON.stringify({
              type: 'cancel_action',
              echo: echo
            }))
          }
          reject(new DOMException('The operation was aborted', 'AbortError'))
        }
      }

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }

      // 存储回调、清理方法
      pendingMap.set(echo, { resolve, reject, cleanup })

      // 超时处理
      setTimeout(() => {
        if (pendingMap.has(echo)) {
          pendingMap.delete(echo)
          cleanup()
          const tipText = options.action || options.endpoint
          reject(new Error(`${tipText} timed out after ${timeout}ms`))
        }
      }, timeout)

      // 组装请求报文
      const sendData = {
        type: options.type,
        echo: echo,
        timeout: timeout / 1000,
        params: options.params
      }
      // 差异化参数赋值
      if (options.type === 'send_action') {
        sendData.action = options.action
      }
      if (options.type === 'req_backend') {
        sendData.endpoint = options.endpoint
      }

      // 发送请求
      socket.value.send(JSON.stringify(sendData))
    })
  }

  /**
   * 通过 WebSocket 发送 action 请求并等待响应
   * @param {string} action - OneBot action 名称
   * @param {object} params - action 参数
   * @param signal          - 终止信号
   * @param {number} timeout - 超时时间(毫秒)
   <any>} action 响应数据
   */
  const sendAction = (action, params = {}, signal = undefined, timeout = 60 * 1000) => {
    return _commonWebSocketRequest(
      {
        type: 'send_action',
        action,
        params
      },
      signal,
      timeout,
      pendingActions
    )
  }

  /**
   * 通过 WebSocket 发送 req_backend 请求并等待响应
   * @param {string} endpoint - 后端 endpoint 名称 (contacts / get_msg / messages / sync)
   * @param {object} params - 请求参数
   * @param signal          - 终止信号
   * @param {number} timeout - 超时时间(毫秒)
   * @returns {<any>} 后端响应数据
   */
  const reqBackend = (endpoint, params = {}, signal = undefined, timeout = 60 * 1000) => {
    return _commonWebSocketRequest(
      {
        type: 'req_backend',
        endpoint,
        params
      },
      signal,
      timeout,
      pendingBackendRequests
    )
  }

  const onReceiveMessage = (message, echo_msg = false) => {
    try {
      // 检查是否是 send_action 的响应
      if (message.type === 'send_action_response') {
        const echo = message.echo
        if (echo && pendingActions.has(echo)) {
          const { resolve, cleanup } = pendingActions.get(echo)
          pendingActions.delete(echo)
          cleanup && cleanup()
          resolve(message)
        }
        return
      }

      // 检查是否是 req_backend 的响应
      if (message.type === 'req_backend_response') {
        const echo = message.echo
        if (echo && pendingBackendRequests.has(echo)) {
          const { resolve, cleanup } = pendingBackendRequests.get(echo)
          pendingBackendRequests.delete(echo)
          cleanup && cleanup()
          resolve(message)
        }
        return
      }

      if (message.id > lastMessageId.value) {
        lastMessageId.value = message.id
      }
      message = convertWrappedMsgSL(message)
      if (echo_msg) {
        console.log(message.post_type === 'notice' ? "收到新通知:" : "收到新消息:", message);
      }
      handleNewMessage(message)
      handleNewNotice(message)
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
    }
  }

  // 同步新消息
  const syncMessages = async () => {
    try {
      (await fetchSyncMessages(lastMessageId.value))?.messages?.forEach(message => {
        onReceiveMessage(message)
      })
      shouldSync.value = false
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
    const contactId = message.message_type === 'group' ? message.group_id : (message.target_id || message.user_id)
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
      fetchAPIVersionInfo()
        .then(info => useGlobalStore().apiVersionInfo = info)
        .catch(e => console.log("Unable to get api version info:", e))
    }

    socket.value.onmessage = (event) => {
      onReceiveMessage(JSON.parse(event.data), true)
    }

    socket.value.onclose = ev => {
      isConnected.value = false
      console.log('WebSocket disconnected')

      // 区分：主动关闭 不再重连
      // ev.code === 1000 是正常主动关闭
      if (ev.code === 1000) return

      // 标记需要同步
      shouldSync.value = true

      // 拒绝所有 pending 的 action
      for (const [echo, { reject, cleanup }] of pendingActions) {
        cleanup && cleanup()
        reject(new Error('WebSocket disconnected'))
      }
      pendingActions.clear()

      // 拒绝所有 pending 的 req_backend 请求
      for (const [echo, { reject, cleanup }] of pendingBackendRequests) {
        cleanup && cleanup()
        reject(new Error('WebSocket disconnected'))
      }
      pendingBackendRequests.clear()

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
    sendAction,
    reqBackend
  }
}