import { ref } from 'vue'
import { nanoid } from "nanoid";
import { fetchAPIVersionInfo, fetchSyncMessages } from "../utils/backend-api.js";
import { convertWrappedMsgSL } from "../utils/snow-luma-translator.js";
import { useGlobalStore } from "../store/global.js";
import { isSupportedNoticeMessage } from "../utils/parse-message.js";

export class ConnectionBridge {
  /**
   * @param {string} url websocket地址
   * @param {object} callbacks
   * @param {Function} callbacks.onMessage
   * @param {Function} callbacks.onNewContact
   * @param {Function} callbacks.onNotice
   */
  constructor(url, { onMessage, onNewContact, onNotice }) {
    this.url = url
    this.callbacks = {
      onMessage,
      onNewContact,
      onNotice
    }

    // 实例状态（保留ref方便vue直接绑定）
    this.socket = ref(null)
    this.lastMessageId = ref(0) // 记录最后收到的消息ID
    this.reconnectAttempts = ref(0)
    this.maxReconnectAttempts = Infinity // 无限重连
    this.reconnectInterval = 3000 // 重连间隔
    this.isConnected = ref(false)
    this.shouldSync = ref(false) // 是否需要同步消息
    this.reconnectTimer = null // 重连定时器
    this.isClosed = false;

    // 存储正在等待响应的 send_action 回调
    this.pendingActions = new Map()
    // 存储正在等待响应的 req_backend 回调
    this.pendingBackendRequests = new Map()

    // 初始化连接
    this.connect()
  }

  /**
   * 通用WebSocket请求底层方法（抽取sendAction/reqBackend重复逻辑）
   * @param {object} options - 请求配置
   * @param {string} options.type - 请求类型 send_action / req_backend
   * @param {string} [options.action] - action名称（send_action专用）
   * @param {string} [options.endpoint] - 后端接口地址（req_backend专用）
   * @param {object} options.params - 请求参数
   * @param {AbortSignal|null|undefined} signal - 终止信号
   * @param {number} timeout - 超时时间(毫秒)
   * @param {Map} pendingMap - pending回调存储Map
   * @returns {Promise<any>} 请求响应数据
   */
  _commonWebSocketRequest(options, signal, timeout, pendingMap) {
    return new Promise((resolve, reject) => {
      if (!this.socket.value || this.socket.value.readyState !== WebSocket.OPEN) {
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
          if (this.socket.value && this.socket.value.readyState === WebSocket.OPEN) {
            this.socket.value.send(JSON.stringify({
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
      this.socket.value.send(JSON.stringify(sendData))
    })
  }

  /**
   * 通过 WebSocket 发送 action 请求并等待响应
   * @param {string} action - OneBot action 名称
   * @param {object} params - action 参数
   * @param {AbortSignal} [signal] - 终止信号
   * @param {number} timeout - 超时时间(毫秒)
   * @returns {Promise<any>} action 响应数据
   */
  sendAction(action, params = {}, signal = undefined, timeout = 60 * 1000) {
    return this._commonWebSocketRequest(
      {
        type: 'send_action',
        action,
        params
      },
      signal,
      timeout,
      this.pendingActions
    )
  }

  /**
   * 通过 WebSocket 发送 req_backend 请求并等待响应
   * @param {string} endpoint - 后端 endpoint 名称 (contacts / get_msg / messages / sync)
   * @param {object} params - 请求参数
   * @param {AbortSignal} [signal] - 终止信号
   * @param {number} timeout - 超时时间(毫秒)
   * @returns {Promise<any>} 后端响应数据
   */
  reqBackend(endpoint, params = {}, signal = undefined, timeout = 60 * 1000) {
    return this._commonWebSocketRequest(
      {
        type: 'req_backend',
        endpoint,
        params
      },
      signal,
      timeout,
      this.pendingBackendRequests
    )
  }

  onReceiveMessage(message, echo_msg = false) {
    try {
      // 检查是否是 send_action 的响应
      if (message.type === 'send_action_response') {
        const echo = message.echo
        if (echo && this.pendingActions.has(echo)) {
          const { resolve, cleanup } = this.pendingActions.get(echo)
          this.pendingActions.delete(echo)
          cleanup && cleanup()
          resolve(message)
        }
        return
      }

      // 检查是否是 req_backend 的响应
      if (message.type === 'req_backend_response') {
        const echo = message.echo
        if (echo && this.pendingBackendRequests.has(echo)) {
          const { resolve, cleanup } = this.pendingBackendRequests.get(echo)
          this.pendingBackendRequests.delete(echo)
          cleanup && cleanup()
          resolve(message)
        }
        return
      }

      if (message.id > this.lastMessageId.value) {
        this.lastMessageId.value = message.id
      }
      message = convertWrappedMsgSL(message)
      if (echo_msg) {
        console.log(message.post_type === 'notice' ? "收到新通知:" : "收到新消息:", message);
      }
      this.handleNewMessage(message)
      this.handleNewNotice(message)
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
    }
  }

  // 同步新消息
  async syncMessages() {
    try {
      (await fetchSyncMessages(this.lastMessageId.value))?.messages?.forEach(message => {
        this.onReceiveMessage(message)
      })
      this.shouldSync.value = false
    } catch (error) {
      console.error('Sync failed:', error)
      // 同步失败，稍后重试
      setTimeout(() => this.syncMessages(), 5000)
    }
  }

  // 处理新消息
  handleNewMessage(message) {
    if (!["message", "message_sent"].includes(message.post_type)) {
      return
    }

    this.callbacks.onMessage(message)

    // 检查是否是新的联系人
    const contactId = message.message_type === 'group' ? message.group_id : (message.target_id || message.user_id)
    const contactType = message.message_type
    const event = typeof message.event === 'string' ? JSON.parse(message.event) : message.event;
    const contactName = event?.group_name || event?.sender?.nickname

    this.callbacks.onNewContact({
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

  handleNewNotice(notice) {
    if (notice.post_type !== 'notice') {
      return
    }

    this.callbacks.onNotice(notice)

    if (isSupportedNoticeMessage(notice)) {
      const type = notice.group_id ? "group" : "private"
      const contact_id = notice.group_id || notice.user_id

      this.callbacks.onNewContact({
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

  // 清理所有pending请求
  clearAllPending() {
    for (const [echo, { reject, cleanup }] of this.pendingActions) {
      cleanup && cleanup()
      reject(new Error('WebSocket disconnected'))
    }
    this.pendingActions.clear()

    for (const [echo, { reject, cleanup }] of this.pendingBackendRequests) {
      cleanup && cleanup()
      reject(new Error('WebSocket disconnected'))
    }
    this.pendingBackendRequests.clear()
  }

  // 彻底关闭WebSocket连接，不再重连
  disconnect() {
    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.isClosed = true;

    // 重置重连次数，防止自动重连
    this.reconnectAttempts.value = this.maxReconnectAttempts

    // 清理所有待处理的请求
    this.clearAllPending()

    // 关闭WebSocket连接（code 1000 表示正常关闭，不会触发重连）
    if (this.socket.value) {
      this.socket.value.close(1000, 'Client disconnect')
      this.socket.value = null
    }

    // 重置连接状态
    this.isConnected.value = false
    this.shouldSync.value = false
  }

  // 连接WebSocket
  connect() {
    // 清除之前的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.socket.value = new WebSocket(this.url)

    this.socket.value.onopen = () => {
      if (this.isClosed) {
        return
      }
      this.isConnected.value = true
      this.reconnectAttempts.value = 0
      console.log('WebSocket connected')

      // 连接成功后同步消息
      if (this.shouldSync.value) {
        this.syncMessages()
      }
      fetchAPIVersionInfo()
        .then(info => useGlobalStore().apiVersionInfo = info)
        .catch(e => console.log("Unable to get api version info:", e))
    }

    this.socket.value.onmessage = (event) => {
      if (this.isClosed) {
        return
      }
      this.onReceiveMessage(JSON.parse(event.data), true)
    }

    this.socket.value.onclose = (ev) => {
      this.isConnected.value = false
      console.log('WebSocket disconnected')

      // 区分：主动关闭 不再重连
      // ev.code === 1000 是正常主动关闭
      if (ev.code === 1000) return

      // 标记需要同步
      this.shouldSync.value = true

      // 拒绝所有 pending 的 action
      this.clearAllPending()

      // 无限重连
      if (this.reconnectAttempts.value < this.maxReconnectAttempts) {
        this.reconnectAttempts.value++
        const delay = Math.min(this.reconnectInterval * this.reconnectAttempts.value, 30000) // 最大30秒间隔
        console.log(`Reconnecting in ${delay / 1000} seconds...`)
        this.reconnectTimer = setTimeout(() => this.connect(), delay)
      }
    }

    this.socket.value.onerror = (error) => {
      console.error('WebSocket error:', error)
      this.socket.value?.close()
    }
  }

  /**
   * 在组件卸载时调用，释放资源
   */
  destroy() {
    this.disconnect()
  }
}