import { virtualDB } from './db.js';
import { convertWrappedMsgSL } from '../../utils/snow-luma-translator.js';
import { isSupportedNoticeMessage } from '../../utils/parse-message.js';

/**
 * 将 OneBot 原始事件转换为标准化的消息数据格式
 * 与 Python 端 convert_event_to_message_data 等效
 */
export function convertEventToMessageData(event) {
  const eventDict = typeof event === 'object' ? { ...event } : {};

  let realSeq = null;
  try {
    realSeq = parseInt(eventDict.real_seq ?? eventDict.message_seq, 10);
  } catch { }

  let userId = eventDict.user_id;
  if (userId === undefined && eventDict.sender?.user_id !== undefined) {
    userId = eventDict.sender.user_id;
  }

  const postType = eventDict.post_type;
  const messageType = eventDict.message_type;
  let targetId = eventDict.target_id;
  const groupId = eventDict.group_id;

  if (postType === 'message' || postType === 'message_sent') {
    if (messageType === 'group') {
      targetId = targetId || groupId;
    }
    if (postType === 'message' && messageType === 'private') {
      targetId = targetId || userId;
    }
  }

  return {
    message_id: eventDict.message_id ?? null,
    real_seq: realSeq,
    time: eventDict.time ?? Math.floor(Date.now() / 1000),
    self_id: eventDict.self_id ?? null,
    sender_id: eventDict.sender_id ?? null,
    post_type: postType,
    notice_type: eventDict.notice_type ?? null,
    message_type: messageType,
    sub_type: eventDict.sub_type ?? null,
    user_id: userId ?? null,
    group_id: groupId ?? null,
    operator_id: eventDict.operator_id ?? null,
    target_id: targetId ?? null,
    event: JSON.stringify(eventDict),
    created_at: new Date().toISOString(),
  };
}

/**
 * 格式化 OneBot 的最近联系人数据
 * 与 Python 端 format_recent_contacts 等效
 */
export function formatRecentContacts(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts.map(contact => {
    const event = contact.lastestMsg;
    const isTemp = event ? ('temp_source' in event) : false;
    const chatType = contact.chatType;
    const type = chatType === 1 || isTemp ? 'private' : 'group';

    const formatted = {
      temp: isTemp,
      type,
      real_name: contact.peerName ?? '',
      remark: contact.remark ?? '',
      last_time: new Date().toISOString(),
      contact_id: parseInt(contact.peerUin, 10) || 0,
      has_message: false,
    };

    if (event) {
      if (event.message_type === 'private') {
        event.target_id = event.peerUin;
      }
      formatted.last_timestamp = event.time;
      formatted.latest_msg = JSON.stringify(event);
      formatted.has_message = !!event.message;
    }
    formatted.name = formatted.remark || formatted.real_name;
    return formatted;
  });
}

/**
 * 业务处理器：处理 OneBot 事件、存储到数据库、维护联系人列表
 */
export class VirtualBackendHandler {
  /**
   * @param {import('./onebot-ws.js').OneBotWSConnection} onebotWS
   * @param {import('./db.js').VirtualDB} db
   * @param {object} callbacks - { onMessage, onNewContact, onNotice }
   */
  constructor(onebotWS, db, callbacks) {
    this.onebotWS = onebotWS;
    this.db = db;
    this.callbacks = callbacks;

    // 注册 OneBot 事件处理器
    this.removeHandler = onebotWS.addEventHandler((data) => this.handleEvent(data));
  }

  /**
   * 处理 OneBot 事件
   */
  async handleEvent(event) {
    if (event.post_type === 'meta_event') return;

    const messageData = convertEventToMessageData(event);

    // 存储到数据库
    const msgId = await this.db.saveMessage(messageData);
    messageData.id = msgId;

    // 处理撤回事件（委托给 db.processRecallEvent）
    if (event.post_type === 'notice' &&
        ['group_recall', 'friend_recall'].includes(event.notice_type)) {
      await this.db.processRecallEvent(event);
    }

    // 准备前端消息格式（与后端广播的格式一致）
    const frontendMessage = {
      id: msgId,
      message_id: messageData.message_id,
      real_seq: messageData.real_seq,
      time: messageData.time,
      self_id: messageData.self_id,
      sender_id: messageData.sender_id,
      post_type: messageData.post_type,
      notice_type: messageData.notice_type,
      message_type: messageData.message_type,
      sub_type: messageData.sub_type,
      user_id: messageData.user_id,
      group_id: messageData.group_id,
      operator_id: messageData.operator_id,
      target_id: messageData.target_id,
      event: messageData.event,
      created_at: messageData.created_at,
    };

    // 转换消息格式
    const converted = convertWrappedMsgSL(frontendMessage);

    // 分发到对应的回调
    if (['message', 'message_sent'].includes(converted.post_type)) {
      this.callbacks.onMessage?.(converted);
      this._handleNewContactFromMessage(converted);
    } else if (converted.post_type === 'notice') {
      this.callbacks.onNotice?.(converted);
      this._handleNewContactFromNotice(converted);
    }
  }

  /**
   * 从消息中更新联系人
   */
  _handleNewContactFromMessage(message) {
    const contactId = message.message_type === 'group'
      ? message.group_id
      : (message.target_id || message.user_id);
    const contactType = message.message_type;

    let eventObj = message.event;
    if (typeof eventObj === 'string') {
      try { eventObj = JSON.parse(eventObj); } catch { eventObj = {}; }
    }

    const contactName = eventObj?.group_name || eventObj?.sender?.nickname || null;

    this.callbacks.onNewContact?.({
      contact_id: contactId,
      type: contactType,
      name: contactName,
      last_time: message.created_at,
      latest_msg: message.event,
      max_cursor: {
        type: 'real_seq',
        value: message.real_seq,
      },
    });
  }

  /**
   * 从通知中更新联系人
   */
  _handleNewContactFromNotice(message) {
    if (!isSupportedNoticeMessage(message)) return;

    const type = message.group_id ? 'group' : 'private';
    const contactId = message.group_id || message.user_id;

    this.callbacks.onNewContact?.({
      contact_id: contactId,
      type,
      name: null,
      last_time: message.created_at,
      latest_msg: message.event,
      max_cursor: {
        type: 'id',
        value: message.id,
      },
    });
  }

  /**
   * 从 OneBot 获取最近联系人，合并数据库联系人
   */
  async getRecentContacts() {
    try {
      const apiContacts = await this.onebotWS.callAction('get_recent_contact', { count: 114514 });
      const formatted = formatRecentContacts(apiContacts?.data || apiContacts || []);
      return formatted;
    } catch (e) {
      console.warn('[VirtualBackend] Failed to fetch recent contacts:', e);
      return [];
    }
  }

  /**
   * 获取消息历史
   */
  async getMessages(id, type, count = 20, direction = null, messageId = 0, selfId = null) {
    const params = {
      count,
      message_seq: messageId,
      message_id: messageId,
    };
    params[type === 'group' ? 'group_id' : 'user_id'] = id;
    if (direction !== null) {
      params.reverse_order = direction === 'prev';
    }

    const action = type === 'group' ? 'get_group_msg_history' : 'get_friend_msg_history';
    const self_id = selfId || this.onebotWS.selfId;

    try {
      const apiData = await this.onebotWS.callAction(action, params);
      let messages = apiData?.data?.messages || apiData?.messages || [];

      for (const msg of messages) {
        if (!msg.post_type) {
          msg.post_type = String(msg.user_id) === String(self_id) ? 'message_sent' : 'message';
        }
        if (!msg.self_id) {
          msg.self_id = parseInt(self_id, 10) || 0;
        }
      }

      if (messages.length >= count) return messages.slice(0, count);
      if (messages.length === 0 || (messages.length === 1 && messages[0].message_id === messageId)) {
        return messages;
      }

      // 递归获取更多
      const remaining = count - messages.length;
      const nextMsgId = direction === 'prev'
        ? messages[0].message_id
        : messages[messages.length - 1].message_id;
      const remainingMessages = await this.getMessages(id, type, remaining + 1, direction, nextMsgId, selfId);

      let combined;
      if (direction === 'prev') {
        combined = [...remainingMessages.slice(0, -1), ...messages];
      } else {
        combined = [...messages, ...remainingMessages.slice(1)];
      }

      if (type === 'private') {
        for (const msg of combined) {
          msg.target_id = id;
        }
      }

      return combined.slice(0, count);
    } catch (e) {
      console.warn('[VirtualBackend] getMessages error:', e);
      return [];
    }
  }

  destroy() {
    this.removeHandler?.();
  }
}