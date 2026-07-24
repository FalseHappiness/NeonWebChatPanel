import { ref } from 'vue';
import { nanoid } from 'nanoid';
import { useGlobalStore } from '../../store/global.js';
import { convertWrappedMsgSL } from '../../utils/snow-luma-translator.js';
import { isSupportedNoticeMessage } from '../../utils/parse-message.js';
import { OneBotWSConnection } from './onebot-ws.js';
import {
  processAndStoreEvent,
  getContactsCore,
  getMessagesCore,
  getMsgCore,
  syncMessagesCore,
} from './handler.js';
import { virtualDB } from './db.js';
import VirtualProtocol, {
  createGetFileDataHandler,
  createGetStreamFileDataHandler,
  createProxyGroupFileHandler,
} from './virtual-protocol.js';

/**
 * ConnectionBridgeOnebot
 *
 * 与 ConnectionBridge 完全相同的接口，但直接连接 NapCat 的 OneBot WS 服务器。
 * - sendAction: 直接发送标准 OneBot v11 action 到 NapCat
 * - reqBackend: 委托 handler.js 的函数处理
 * - 接收来自 NapCat 的实时事件并存入本地数据库
 */
export class ConnectionBridgeOnebot {
  /**
   * @param {string|{url: string, token: string}} urlOpt - NapCat OneBot WS 地址 (如 ws://127.0.0.1:3001)，或 WS 地址与 Token 对象
   * @param {object} callbacks
   * @param {Function} callbacks.onMessage
   * @param {Function} callbacks.onNewContact
   * @param {Function} callbacks.onNotice
   */
  constructor(urlOpt, { onMessage, onNewContact, onNotice }) {
    this.url = urlOpt;
    this.token = null
    if (typeof urlOpt === 'object') {
      ({ url: this.url, token: this.token } = urlOpt)
    }

    // 实例状态
    this.socket = ref(null);
    this.lastMessageId = ref(0);
    this.reconnectAttempts = ref(0);
    this.maxReconnectAttempts = Infinity;
    this.reconnectInterval = 3000;
    this.isConnected = ref(false);
    this.shouldSync = ref(false);
    this.reconnectTimer = null;
    this.isClosed = false;

    // pending 回调
    this.pendingActions = new Map();
    this.pendingBackendRequests = new Map();

    // 回调
    this.callbacks = { onMessage, onNewContact, onNotice };

    // 创建 OneBot WS 连接器
    this.onebotWS = new OneBotWSConnection(this.url, this.token);

    // 注册事件处理器
    this.removeEventHandler = this.onebotWS.addEventHandler((data) => this._onOneBotEvent(data));

    // 同步 OneBot WS 状态
    this.onebotWS.onConnected = () => {
      this.isConnected.value = true;
      this.reconnectAttempts.value = 0;
      this.socket.value = this.onebotWS.socket.value;
      console.log('[ConnectionBridgeOnebot] Connected');

      this.onebotWS.callAction('get_version_info', {})
        .then(res => {
          useGlobalStore().apiVersionInfo = res.data || res;
        })
        .catch(e => console.log('Unable to get api version info:', e));

      if (this.shouldSync.value) this._syncMessages();
    };

    this.onebotWS.onDisconnected = () => {
      this.isConnected.value = false;
      this.shouldSync.value = true;
    };

    // 初始化 VirtualProtocol
    this.virtualProtocol = new VirtualProtocol();
    this.virtualProtocol.registerRoute(
      '/api/get_file_data',
      createGetFileDataHandler({
        callAction: (action, params) => this.onebotWS.callAction(action, params, null, 20 * 60 * 1000)
      })
    );
    this.virtualProtocol.registerRoute(
      '/api/get_stream_file_data',
      createGetStreamFileDataHandler({
        callAction: (action, params) => this.onebotWS.callAction(action, params, null, 20 * 60 * 1000)
      })
    );
    this.virtualProtocol.registerRoute(
      '/api/proxy_group_file',
      createProxyGroupFileHandler({
        callAction: (action, params) => this.onebotWS.callAction(action, params, null, 20 * 60 * 1000)
      })
    );
    this.virtualProtocol.mount();

    this.connect();
  }

  // ========== OneBot 事件处理 ==========

  async _onOneBotEvent(event) {
    const frontendMessage = await processAndStoreEvent(event, virtualDB);
    if (!frontendMessage) return;

    const converted = convertWrappedMsgSL(frontendMessage);

    if (converted.id > this.lastMessageId.value) {
      this.lastMessageId.value = converted.id;
    }

    console.log(converted.post_type === 'notice' ? '收到新通知:' : '收到新消息:', converted);

    this.handleNewMessage(converted);
    this.handleNewNotice(converted);
  }

  // ========== 公开接口 ==========

  _commonWebSocketRequest(options, signal, timeout, pendingMap) {
    return new Promise((resolve, reject) => {
      if (!this.onebotWS.isConnected.value) {
        reject(new Error('WebSocket is not connected'));
        return;
      }
      if (signal && signal.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }

      const echo = nanoid();
      const cleanup = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        if (pendingMap.has(echo)) {
          pendingMap.delete(echo);
          cleanup();
          reject(new DOMException('The operation was aborted', 'AbortError'));
        }
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      pendingMap.set(echo, { resolve, reject, cleanup });

      setTimeout(() => {
        if (pendingMap.has(echo)) {
          pendingMap.delete(echo);
          cleanup();
          reject(new Error(`${options.action || options.endpoint} timed out after ${timeout}ms`));
        }
      }, timeout);

      if (options.type === 'send_action') {
        this.onebotWS.callAction(options.action, options.params, signal, timeout)
          .then(response => {
            if (pendingMap.has(echo)) {
              pendingMap.delete(echo);
              cleanup();
              resolve(response);
            }
          })
          .catch(error => {
            if (pendingMap.has(echo)) {
              pendingMap.delete(echo);
              cleanup();
              reject(error);
            }
          });
      } else if (options.type === 'req_backend') {
        this._handleReqBackendLocal(options.endpoint, options.params)
          .then(result => {
            if (pendingMap.has(echo)) {
              pendingMap.delete(echo);
              cleanup();
              resolve(result);
            }
          })
          .catch(error => {
            if (pendingMap.has(echo)) {
              pendingMap.delete(echo);
              cleanup();
              reject(error);
            }
          });
      }
    });
  }

  sendAction(action, params = {}, signal = undefined, timeout = 60 * 1000) {
    return this._commonWebSocketRequest({ type: 'send_action', action, params }, signal, timeout, this.pendingActions);
  }

  reqBackend(endpoint, params = {}, signal = undefined, timeout = 10 * 60 * 1000) {
    return this._commonWebSocketRequest({
      type: 'req_backend',
      endpoint,
      params
    }, signal, timeout, this.pendingBackendRequests);
  }

  // ========== req_backend 本地处理（委托给 handler.js） ==========

  async _handleReqBackendLocal(endpoint, params) {
    switch (endpoint) {
      case 'contacts': {
        const contacts = await getContactsCore(virtualDB, this.onebotWS);
        return { status: 'success', data: contacts };
      }
      case 'messages': {
        const result = await getMessagesCore(params, virtualDB, this.onebotWS);
        for (const idx in result.messages) {
          result.messages[idx] = convertWrappedMsgSL(result.messages[idx]);
        }
        return { status: 'success', data: result };
      }
      case 'get_msg': {
        const msg = await getMsgCore(params, virtualDB, this.onebotWS);
        return { status: 'success', data: msg };
      }
      case 'sync': {
        const syncResult = await syncMessagesCore(params, virtualDB);
        return { status: 'success', data: syncResult };
      }
      default:
        throw new Error(`Unknown backend endpoint: ${endpoint}`);
    }
  }

  // ========== 消息处理（与 connection-bridge.js 一致） ==========

  onReceiveMessage(message, echoMsg = false) {
    try {
      if (message.type === 'send_action_response') {
        const { echo } = message;
        if (echo && this.pendingActions.has(echo)) {
          const { resolve, cleanup } = this.pendingActions.get(echo);
          this.pendingActions.delete(echo);
          cleanup?.();
          resolve(message);
        }
        return;
      }
      if (message.type === 'req_backend_response') {
        const { echo } = message;
        if (echo && this.pendingBackendRequests.has(echo)) {
          const { resolve, cleanup } = this.pendingBackendRequests.get(echo);
          this.pendingBackendRequests.delete(echo);
          cleanup?.();
          resolve(message);
        }
        return;
      }
      if (message.id > this.lastMessageId.value) this.lastMessageId.value = message.id;
      message = convertWrappedMsgSL(message);
      if (echoMsg) console.log(message.post_type === 'notice' ? '收到新通知:' : '收到新消息:', message);
      this.handleNewMessage(message);
      this.handleNewNotice(message);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error)
    }
  }

  syncMessages() {
    this._syncMessages();
  }

  async _syncMessages() {
    try {
      const result = await syncMessagesCore({ last_id: this.lastMessageId.value }, virtualDB);
      if (result.messages) {
        for (const msg of result.messages) this.onReceiveMessage(msg);
      }
      this.shouldSync.value = false;
    } catch (error) {
      console.error('Sync failed:', error);
      setTimeout(() => this._syncMessages(), 5000);
    }
  }

  // 处理新消息（与 connection-bridge.js 的 handleNewMessage 完全一致）
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

  // 处理新通知（与 connection-bridge.js 的 handleNewNotice 完全一致）
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

  // ========== 连接管理 ==========

  clearAllPending() {
    for (const [echo, { reject, cleanup }] of this.pendingActions) {
      cleanup?.();
      reject(new Error('WebSocket disconnected'));
    }
    this.pendingActions.clear();
    for (const [echo, { reject, cleanup }] of this.pendingBackendRequests) {
      cleanup?.();
      reject(new Error('WebSocket disconnected'));
    }
    this.pendingBackendRequests.clear();
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isClosed = true;
    this.reconnectAttempts.value = this.maxReconnectAttempts;
    this.clearAllPending();
    this.onebotWS.disconnect();
    this.isConnected.value = false;
    this.shouldSync.value = false;
  }

  connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.onebotWS.connect();
  }

  destroy() {
    this.removeEventHandler?.();
    this.disconnect();
    this.onebotWS.destroy();
    if (this.virtualProtocol) this.virtualProtocol.unmount();
  }
}