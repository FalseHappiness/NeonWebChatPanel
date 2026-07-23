import { ref } from 'vue';
import { nanoid } from 'nanoid';
import { useGlobalStore } from '../../store/global.js';
import { convertWrappedMsgSL } from '../../utils/snow-luma-translator.js';
import { isSupportedNoticeMessage } from '../../utils/parse-message.js';
import { OneBotWSConnection } from './onebot-ws.js';
import { VirtualBackendHandler, convertEventToMessageData, formatRecentContacts } from './handler.js';
import { virtualDB } from './db.js';

/**
 * ConnectionBridgeOnebot
 *
 * 与 ConnectionBridge 完全相同的接口，但直接连接 NapCat 的 OneBot WS 服务器。
 * - sendAction: 直接发送标准 OneBot v11 action 到 NapCat
 * - reqBackend: 本地处理（通过 Dexie.js 数据库 + OneBot API 调用）
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
    this.socket = ref(null);          // 兼容原接口，实际 using onebotWS
    this.lastMessageId = ref(0);
    this.reconnectAttempts = ref(0);
    this.maxReconnectAttempts = Infinity;
    this.reconnectInterval = 3000;
    this.isConnected = ref(false);
    this.shouldSync = ref(false);
    this.reconnectTimer = null;
    this.isClosed = false;

    // pending 回调（与 ConnectionBridge 接口一致）
    this.pendingActions = new Map();
    this.pendingBackendRequests = new Map();

    // 回调
    this.callbacks = { onMessage, onNewContact, onNotice };

    // 创建 OneBot WS 连接器
    this.onebotWS = new OneBotWSConnection(this.url, this.token);

    // 创建业务处理器
    this.handler = new VirtualBackendHandler(this.onebotWS, virtualDB, {
      onMessage: (message) => this._onMessageFromHandler(message),
      onNewContact: (contact) => this._onNewContactFromHandler(contact),
      onNotice: (notice) => this._onNoticeFromHandler(notice),
    });

    // 同步 OneBot WS 状态到 bridge 状态
    this.onebotWS.onConnected = () => {
      this.isConnected.value = true;
      this.reconnectAttempts.value = 0;
      this.socket.value = this.onebotWS.socket.value;

      console.log('[ConnectionBridgeOnebot] Connected');

      // 连接成功后获取 API 版本信息
      this.onebotWS.callAction('get_version_info', {})
        .then(res => {
          useGlobalStore().apiVersionInfo = res.data || res;
        })
        .catch(e => console.log('Unable to get api version info:', e));

      // 同步消息
      if (this.shouldSync.value) {
        this._syncMessages();
      }
    };

    this.onebotWS.onDisconnected = () => {
      this.isConnected.value = false;
      this.shouldSync.value = true;
    };

    // 开始连接
    this.connect();
  }

  // ========== 内部事件处理 ==========

  _onMessageFromHandler(message) {
    // 更新 lastMessageId
    if (message.id > this.lastMessageId.value) {
      this.lastMessageId.value = message.id;
    }
    this.callbacks.onMessage?.(message);
  }

  _onNewContactFromHandler(contact) {
    this.callbacks.onNewContact?.(contact);
  }

  _onNoticeFromHandler(notice) {
    this.callbacks.onNotice?.(notice);
  }

  // ========== 公开接口（与 ConnectionBridge 一致） ==========

  /**
   * 通用 WebSocket 请求底层方法
   * 兼容原接口契约，但 sendAction 直接走 OneBot WS
   */
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

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      pendingMap.set(echo, { resolve, reject, cleanup });

      setTimeout(() => {
        if (pendingMap.has(echo)) {
          pendingMap.delete(echo);
          cleanup();
          const tipText = options.action || options.endpoint;
          reject(new Error(`${tipText} timed out after ${timeout}ms`));
        }
      }, timeout);

      // 根据类型分发
      if (options.type === 'send_action') {
        // 直接调用 OneBot action
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
        // 本地处理 req_backend
        this._handleReqBackendLocal(options.endpoint, options.params, signal, timeout)
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

  /**
   * 发送 OneBot action 请求
   * @param {string} action - OneBot action 名称
   * @param {object} params - 参数
   * @param {AbortSignal} [signal]
   * @param {number} timeout - 超时(ms)
   * @returns {Promise<any>}
   */
  sendAction(action, params = {}, signal = undefined, timeout = 60 * 1000) {
    return this._commonWebSocketRequest(
      { type: 'send_action', action, params },
      signal,
      timeout,
      this.pendingActions,
    );
  }

  /**
   * reqBackend 请求（本地处理）
   * @param {string} endpoint - contacts / get_msg / messages / sync
   * @param {object} params - 请求参数
   * @param {AbortSignal} [signal]
   * @param {number} timeout - 超时(ms)
   * @returns {Promise<any>}
   */
  reqBackend(endpoint, params = {}, signal = undefined, timeout = 10 * 60 * 1000) {
    return this._commonWebSocketRequest(
      { type: 'req_backend', endpoint, params },
      signal,
      timeout,
      this.pendingBackendRequests,
    );
  }

  // ========== req_backend 本地处理 ==========

  /**
   * 本地处理 req_backend 请求
   */
  async _handleReqBackendLocal(endpoint, params, signal, timeout) {
    switch (endpoint) {
      case 'contacts':
        return await this._getContacts();
      case 'messages':
        return await this._getMessages(params);
      case 'get_msg':
        return await this._getMsg(params);
      case 'sync':
        return await this._syncMessagesLocal(params);
      default:
        throw new Error(`Unknown backend endpoint: ${endpoint}`);
    }
  }

  /**
   * 获取联系人列表（合并数据库 + OneBot API 最近联系人）
   */
  async _getContacts() {
    const dbContacts = await virtualDB.getContacts();
    let apiContacts = [];
    try {
      apiContacts = await this.handler.getRecentContacts();
    } catch (e) {
      console.warn('[VB] getRecentContacts error:', e);
    }

    // 合并
    const contactMap = new Map();
    for (const c of dbContacts) {
      contactMap.set(`${c.contact_id}:${c.type}`, { ...c });
    }
    for (const c of apiContacts) {
      const key = `${c.contact_id}:${c.type}`;
      if (contactMap.has(key)) {
        const existing = contactMap.get(key);
        if (c.latest_msg && c.has_message) existing.latest_msg = c.latest_msg;
        existing.temp = c.temp;
        if (c.last_timestamp) existing.last_timestamp = c.last_timestamp;
        existing.name = c.name;
        existing.real_name = c.real_name;
        existing.remark = c.remark;
      } else {
        contactMap.set(key, c);
      }
    }

    // 排序：按 last_timestamp 降序
    const contacts = Array.from(contactMap.values());
    contacts.sort((a, b) => {
      const aTime = a.last_timestamp ?? new Date(a.last_time).getTime();
      const bTime = b.last_timestamp ?? new Date(b.last_time).getTime();
      return bTime - aTime;
    });

    return { status: 'success', data: contacts };
  }

  /**
   * 获取消息列表（合并数据库 + OneBot API）
   */
  async _getMessages(params) {
    const limit = parseInt(params.limit, 10) || 20;
    const cursor = params.cursor ? parseInt(params.cursor, 10) : null;
    const cursorType = params.cursor_type || 'id';
    const direction = params.direction || 'prev';
    const includeCursor = params.include_cursor === true || params.include_cursor === 'true';
    const messageId = parseInt(params.message_id, 10) || 0;
    const cursorTime = params.cursor_time ? parseInt(params.cursor_time, 10) : null;
    const noticeMessage = params.notice_message === true || params.notice_message === 'true';
    const noticeBeforeCursor = parseInt(params.notice_before_message, 10) || -1;
    const noticeAfterCursor = parseInt(params.notice_after_message, 10) || -1;

    const groupId = parseInt(params.group_id, 10) || -1;
    const targetId = parseInt(params.target_id, 10) || -1;
    const userId = parseInt(params.user_id, 10) || -1;
    const messageType = params.message_type;
    const postType = params.post_type;

    // 构建筛选条件
    const filters = [];
    const msgFilter = {};
    if (postType) msgFilter.post_type = postType;
    if (messageType) msgFilter.message_type = messageType;
    if (groupId !== -1) msgFilter.group_id = groupId;
    if (targetId !== -1) msgFilter.target_id = targetId;
    if (userId !== -1) msgFilter.user_id = userId;

    if (Object.keys(msgFilter).length > 0) {
      filters.push(msgFilter);
    }

    if (postType === undefined && messageType && userId === -1) {
      // 与 Python 后端相同逻辑：同时查消息和通知
      const noticeFilter = {
        sub_type: ['poke', 'add', 'ban', 'lift_ban', 'approve', 'invite', 'kick_me', 'remove'],
        notice_type: ['notify', 'essence', 'group_ban', 'group_increase', 'group_decrease', 'group_msg_emoji_like'],
        post_type: 'notice',
      };
      msgFilter.post_type = ['message', 'message_sent'];
      if (messageType === 'group') {
        msgFilter.sub_type = 'normal';
        noticeFilter.group_id = groupId;
      } else if (messageType === 'private') {
        msgFilter.sub_type = ['friend', 'group'];
        noticeFilter.user_id = targetId;
        noticeFilter.group_id = null;
      }
      filters.push(noticeFilter);
    }

    // 从数据库获取消息
    let dbResult = { messages: [] };
    try {
      dbResult = await virtualDB.getMessages({
        limit,
        cursor,
        direction,
        include_cursor: includeCursor,
        filters: filters.length > 0 ? filters : undefined,
        use_real_seq: cursorType === 'real_seq',
        cursor_time: cursorTime,
      });
    } catch (e) {
      console.warn('[VB] DB getMessages error:', e);
    }

    let dbMessages = dbResult.messages || [];

    // 尝试从 OneBot API 获取更多消息（当 postType 无筛选且 userId 为 -1 且不是纯 notice_message 模式）
    let apiMessages = null;
    if (postType === undefined && userId === -1 && messageType) {
      const contactId = messageType === 'group' ? groupId : targetId;
      let msgId = messageId;
      if (noticeMessage) {
        if (direction === 'prev') {
          msgId = noticeAfterCursor;
          if (msgId === -1) {
            // 尝试找到接近通知的消息
            const nearest = await this._findNearestMessage(cursor, groupId, targetId, 'after');
            msgId = nearest?.message_id || 0;
          }
        } else {
          msgId = noticeBeforeCursor;
          if (msgId === -1) {
            const nearest = await this._findNearestMessage(cursor, groupId, targetId, 'before');
            msgId = nearest?.message_id || 0;
          }
        }
      }

      if (!noticeMessage || msgId !== -1) {
        if (direction === 'prev' || msgId !== 0) {
          try {
            const rawMessages = await this.handler.getMessages(
              contactId,
              messageType,
              limit + 1,
              direction,
              msgId,
            );
            apiMessages = rawMessages.map(convertEventToMessageData);

            // 按时间过滤
            if (cursorTime !== null) {
              if (direction === 'prev') {
                apiMessages = apiMessages.filter(m => (m.time ?? cursorTime + 1) <= cursorTime);
              } else {
                apiMessages = apiMessages.filter(m => (m.time ?? 0) >= cursorTime);
              }
            }
          } catch (e) {
            console.warn('[VB] API getMessages error:', e);
          }
        }
      }
    }

    // 合并 API 消息和数据库消息
    let messages = [];
    if (apiMessages !== null) {
      const merged = new Map();
      const allMsgs = [...apiMessages, ...dbMessages];
      for (const msg of allMsgs) {
        const realSeq = msg.real_seq ?? msg.message_seq;
        if (realSeq !== null && realSeq !== undefined && !Number.isNaN(realSeq)) {
          const key = `${msg.post_type}_${realSeq}`;
          merged.set(key, msg);
        } else {
          // 用 (time, idx) 保证唯一性
          merged.set(`${msg.time}_${Math.random()}`, msg);
        }
      }

      messages = Array.from(merged.values());
      messages.sort((a, b) => {
        return (a.time ?? 0) - (b.time ?? 0) ||
          (a.real_seq ?? 0) - (b.real_seq ?? 0) ||
          (a.id ?? 0) - (b.id ?? 0);
      });

      if (!includeCursor && messageId) {
        messages = messages.filter(m => m.message_id !== messageId);
      }

      if (direction === 'prev') {
        messages = messages.slice(-limit);
      } else {
        messages = messages.slice(0, limit);
      }
    } else {
      messages = dbMessages;
    }

    // 转换消息格式
    for (const idx in messages) {
      messages[idx] = convertWrappedMsgSL(messages[idx]);
    }

    // 获取 max_real_seq
    let maxRealSeq = null;
    if (messageId === 0 && messages.length > 0) {
      maxRealSeq = parseInt(messages[messages.length - 1]?.real_seq ?? -1, 10);
    }

    return {
      status: 'success',
      data: {
        messages,
        max_id: dbResult.max_id ?? -1,
        min_id: dbResult.min_id ?? -1,
        max_real_seq: maxRealSeq !== -1 ? maxRealSeq : null,
      },
    };
  }

  /**
   * 查找接近通知的最近消息
   */
  async _findNearestMessage(noticeId, groupId, targetId, direction) {
    try {
      const notice = await virtualDB.messages.get(parseInt(noticeId, 10));
      if (!notice) return null;

      let collection = virtualDB.messages
        .where('id')
        [direction === 'after' ? 'above' : 'below'](notice.id)
        .filter(m =>
          (m.post_type === 'message' || m.post_type === 'message_sent') &&
          (m.message_type === 'group' || m.post_type === 'private') &&
          (m.sub_type === 'normal' || m.sub_type === 'friend' || m.sub_type === 'group')
        );

      if (groupId && groupId !== -1) {
        const msgs = await collection.toArray();
        const filtered = msgs.filter(m => m.group_id === groupId);
        return filtered[direction === 'after' ? 0 : filtered.length - 1] || null;
      }
      if (targetId && targetId !== -1) {
        const msgs = await collection.toArray();
        const filtered = msgs.filter(m => m.target_id === targetId);
        return filtered[direction === 'after' ? 0 : filtered.length - 1] || null;
      }

      const msgs = await collection.toArray();
      return msgs[direction === 'after' ? 0 : msgs.length - 1] || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取单条消息
   */
  async _getMsg(params) {
    const id = params.id ? parseInt(params.id, 10) : null;
    const messageId = params.message_id ? parseInt(params.message_id, 10) : null;

    const type = id !== null ? 'id' : 'message_id';
    const value = id !== null ? id : messageId;

    let msg = await virtualDB.getMessage(value, type);

    if (!msg && messageId) {
      try {
        const apiData = await this.onebotWS.callAction('get_msg', { message_id: messageId });
        const data = apiData?.data || apiData;
        if (data) {
          msg = convertEventToMessageData(data);
        }
      } catch (e) {
        throw new Error(`Failed to get message from API: ${e}`);
      }
    }

    if (!msg) {
      throw new Error(`Message not found: ${JSON.stringify(params)}`);
    }

    return { status: 'success', data: msg };
  }

  /**
   * 同步新消息
   */
  async _syncMessagesLocal(params) {
    const lastId = parseInt(params.last_id, 10) || 0;
    const messages = await virtualDB.getNewMessages(lastId);
    const newLastId = messages.length > 0
      ? Math.max(...messages.map(m => m.id))
      : lastId;
    return {
      status: 'success',
      data: {
        messages,
        last_id: newLastId,
      },
    };
  }

  // ========== 消息处理（兼容原接口） ==========

  onReceiveMessage(message, echoMsg = false) {
    // 处理 send_action 响应（兼容原接口格式）
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

    // 处理 req_backend 响应
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

    // 处理消息
    if (message.id > this.lastMessageId.value) {
      this.lastMessageId.value = message.id;
    }
    message = convertWrappedMsgSL(message);
    if (echoMsg) {
      console.log(message.post_type === 'notice' ? '收到新通知:' : '收到新消息:', message);
    }
    this._onMessageFromHandler(message);
  }

  syncMessages() {
    this._syncMessages();
  }

  async _syncMessages() {
    try {
      const result = await this._syncMessagesLocal({ last_id: this.lastMessageId.value });
      if (result.data?.messages) {
        for (const msg of result.data.messages) {
          this.onReceiveMessage(msg);
        }
      }
      this.shouldSync.value = false;
    } catch (error) {
      console.error('Sync failed:', error);
      setTimeout(() => this._syncMessages(), 5000);
    }
  }

  handleNewMessage(message) {
    if (!['message', 'message_sent'].includes(message.post_type)) return;
    this.callbacks.onMessage?.(message);

    const contactId = message.message_type === 'group'
      ? message.group_id
      : (message.target_id || message.user_id);
    const contactType = message.message_type;
    let event = typeof message.event === 'string' ? JSON.parse(message.event) : message.event;
    const contactName = event?.group_name || event?.sender?.nickname;

    this.callbacks.onNewContact?.({
      contact_id: contactId,
      type: contactType,
      name: contactName,
      last_time: message.created_at,
      latest_msg: JSON.stringify(event),
      max_cursor: { type: 'real_seq', value: message.real_seq },
    });
  }

  handleNewNotice(notice) {
    if (notice.post_type !== 'notice') return;
    this.callbacks.onNotice?.(notice);

    if (isSupportedNoticeMessage(notice)) {
      const type = notice.group_id ? 'group' : 'private';
      const contactId = notice.group_id || notice.user_id;
      this.callbacks.onNewContact?.({
        contact_id: contactId,
        type,
        name: null,
        last_time: notice.created_at,
        latest_msg: notice.event,
        max_cursor: { type: 'id', value: notice.id },
      });
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
    this.handler.destroy();
    this.disconnect();
    this.onebotWS.destroy();
  }
}