import Dexie from 'dexie';

/**
 * 本地 Dexie.js 数据库，仅存储消息，
 * 替代 Python 后端的 SQLite 数据库。
 * 联系人数据从 messages 表派生，与 Python 后端设计一致。
 */
class VirtualDB extends Dexie {
  constructor() {
    super('QirenoVirtualBackend');

    // 定义数据库表结构
    this.version(1).stores({
      // messages: 消息存储，自增主键，索引字段与 Python db.py 一致
      messages: '++id, message_id, real_seq, time, self_id, sender_id, post_type, message_type, notice_type, sub_type, group_id, user_id, operator_id, target_id, *created_at',
      // meta: 元数据存储
      meta: 'key',
    });

    /**
     * 保存消息到数据库
     * @param {object} messageData - 标准化后的消息数据
     * @returns {Promise<number>} 消息自增ID
     */
    this.saveMessage = async (messageData) => {
      const id = await this.messages.add({
        message_id: messageData.message_id ?? null,
        real_seq: messageData.real_seq ?? null,
        time: messageData.time ?? Math.floor(Date.now() / 1000),
        self_id: messageData.self_id ?? null,
        sender_id: messageData.sender_id ?? null,
        post_type: messageData.post_type ?? null,
        message_type: messageData.message_type ?? null,
        notice_type: messageData.notice_type ?? null,
        sub_type: messageData.sub_type ?? null,
        group_id: messageData.group_id ?? null,
        user_id: messageData.user_id ?? null,
        operator_id: messageData.operator_id ?? null,
        target_id: messageData.target_id ?? null,
        event: messageData.event ?? null,
        created_at: messageData.created_at ?? new Date().toISOString(),
      });
      return id;
    };

    /**
     * 根据 message_id 或 id 查询消息
     * 对应 Python db.py 的 get_msg
     * @param {number|string} id - 查询值
     * @param {'message_id'|'id'} type - 查询类型
     * @returns {Promise<object|null>}
     */
    this.getMessage = async (id, type = 'message_id') => {
      if (type === 'id') {
        return await this.messages.get(id) ?? null;
      }
      // message_id 查询，只返回 message/message_sent 类型
      const msg = await this.messages
        .where('message_id')
        .equals(id)
        .filter(m => ['message', 'message_sent'].includes(m.post_type))
        .first();
      return msg ?? null;
    };

    /**
     * 获取消息列表（支持游标分页、筛选）
     * 对应 Python db.py 的 get_messages
     * @param {object} opts
     * @returns {Promise<{messages: Array, max_id: number, min_id: number}>}
     */
    this.getMessages = async (opts = {}) => {
      const {
        limit = 100,
        cursor = null,
        direction = 'prev',
        include_cursor = false,
        filters = null,
        use_real_seq = false,
        cursor_time = null,
      } = opts;

      // 构建筛选条件
      let collection = this.messages.toCollection();

      if (filters) {
        const filterList = Array.isArray(filters) ? filters : [filters];
        collection = collection.filter(msg => {
          return filterList.some(filterDict => {
            return Object.entries(filterDict).every(([field, value]) => {
              if (value === null || value === undefined) return true;
              const msgVal = msg[field];
              if (Array.isArray(value)) {
                return value.includes(msgVal);
              }
              return msgVal === value;
            });
          });
        });
      }

      // 获取所有符合条件的ID
      const allIds = await collection.primaryKeys();
      let filteredIds = allIds;

      // 处理游标
      const idField = use_real_seq ? 'real_seq' : 'id';
      if (cursor !== null) {
        if (cursor_time !== null && use_real_seq) {
          filteredIds = [];
          const allMsgs = await collection.toArray();
          for (const msg of allMsgs) {
            const cursorVal = msg[idField];
            const timeVal = msg.time;
            if (direction === 'prev') {
              if (timeVal < cursor_time || (timeVal === cursor_time && cursorVal < cursor)) {
                filteredIds.push(msg.id);
              }
            } else {
              if (timeVal > cursor_time || (timeVal === cursor_time && cursorVal > cursor)) {
                filteredIds.push(msg.id);
              }
            }
          }
        } else {
          const allMsgs = await collection.toArray();
          filteredIds = [];
          for (const msg of allMsgs) {
            const cursorVal = msg[idField];
            if (direction === 'prev') {
              if (include_cursor ? cursorVal <= cursor : cursorVal < cursor) {
                filteredIds.push(msg.id);
              }
            } else {
              if (include_cursor ? cursorVal >= cursor : cursorVal > cursor) {
                filteredIds.push(msg.id);
              }
            }
          }
        }
      }

      // 排序和分页
      const allMsgs = await this.messages.where(':id').anyOf(filteredIds).toArray();
      allMsgs.sort((a, b) => {
        const aVal = a[idField] ?? 0;
        const bVal = b[idField] ?? 0;
        return aVal - bVal;
      });

      if (cursor === null) {
        filteredIds = allMsgs.slice(-limit).map(m => m.id);
      } else {
        if (direction === 'prev') {
          filteredIds = allMsgs.slice(-limit).map(m => m.id);
        } else {
          filteredIds = allMsgs.slice(0, limit).map(m => m.id);
        }
      }

      const messages = await this.messages.where(':id').anyOf(filteredIds).toArray();
      messages.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

      // 计算最大最小ID
      let maxId = -1, minId = -1;
      if (allIds.length > 0) {
        maxId = Math.max(...allIds);
        minId = Math.min(...allIds);
      }

      return {
        messages,
        max_id: maxId,
        min_id: minId,
      };
    };

    /**
     * 获取联系人列表（从 messages 表派生，对应 Python db.py 的 get_contacts）
     * @returns {Promise<Array>}
     */
    this.getContacts = async () => {
      const messages = await this.messages.toArray();

      // 私聊联系人
      const privateMap = new Map();
      // 群聊联系人
      const groupMap = new Map();

      for (const msg of messages) {
        const postType = msg.post_type;
        const subType = msg.sub_type;
        const groupId = msg.group_id;
        const targetId = msg.target_id;
        const userId = msg.user_id;
        const noticeType = msg.notice_type;

        let event = null;
        try {
          event = msg.event ? JSON.parse(msg.event) : null;
        } catch {
        }

        // 私聊消息
        if (targetId && targetId !== 0 && subType === 'friend' &&
          (postType === 'message' || postType === 'message_sent')) {
          const key = `private_${targetId}`;
          if (!privateMap.has(key) || privateMap.get(key).id < msg.id) {
            privateMap.set(key, {
              contact_id: targetId,
              type: 'private',
              name: event?.sender?.nickname || null,
              last_time: msg.created_at,
              last_timestamp: msg.time,
              latest_msg: msg.event,
            });
          }
        }

        // 私聊戳一戳通知
        if (userId && userId !== 0 && !groupId && subType === 'poke' &&
          noticeType === 'notify' && postType === 'notice') {
          const key = `private_${userId}`;
          if (!privateMap.has(key) || privateMap.get(key).id < msg.id) {
            privateMap.set(key, {
              contact_id: userId,
              type: 'private',
              name: null,
              last_time: msg.created_at,
              last_timestamp: msg.time,
              latest_msg: msg.event,
            });
          }
        }

        // 群聊消息
        if (groupId && groupId !== 0 && subType === 'normal' &&
          (postType === 'message' || postType === 'message_sent')) {
          const key = `group_${groupId}`;
          if (!groupMap.has(key) || groupMap.get(key).id < msg.id) {
            groupMap.set(key, {
              contact_id: groupId,
              type: 'group',
              name: event?.group_name || null,
              last_time: msg.created_at,
              last_timestamp: msg.time,
              latest_msg: msg.event,
            });
          }
        }

        // 群聊通知
        if (groupId && groupId !== 0 && postType === 'notice' &&
          ['poke', 'add', 'ban', 'lift_ban', 'approve', 'invite', 'kick_me', 'remove'].includes(subType) &&
          ['notify', 'essence', 'group_ban', 'group_increase', 'group_decrease', 'group_msg_emoji_like'].includes(noticeType)) {
          const key = `group_${groupId}`;
          if (!groupMap.has(key) || groupMap.get(key).id < msg.id) {
            groupMap.set(key, {
              contact_id: groupId,
              type: 'group',
              name: null,
              last_time: msg.created_at,
              last_timestamp: msg.time,
              latest_msg: msg.event,
            });
          }
        }
      }

      const contacts = [
        ...Array.from(privateMap.values()),
        ...Array.from(groupMap.values()),
      ];

      // 过滤无效联系人
      const validContacts = contacts.filter(c => c.contact_id && c.contact_id !== 0);

      // 排序
      validContacts.sort((a, b) => {
        const aTime = a.last_timestamp ?? new Date(a.last_time).getTime();
        const bTime = b.last_timestamp ?? new Date(b.last_time).getTime();
        return bTime - aTime;
      });

      return validContacts;
    };

    /**
     * 获取新消息（大于指定ID）
     * 对应 Python db.py 的 get_new_messages
     * @param {number} lastId
     * @returns {Promise<Array>}
     */
    this.getNewMessages = async (lastId = 0) => {
      return await this.messages
        .where('id')
        .above(lastId)
        .sortBy('id');
    };

    /**
     * 处理撤回事件，更新原始消息的 event 字段
     * 对应 Python db.py 的 process_recall_event
     * @param {object} event - 撤回事件
     */
    this.processRecallEvent = async (event) => {
      if (event.post_type !== 'notice' ||
        !['group_recall', 'friend_recall'].includes(event.notice_type)) {
        return null;
      }

      const messageId = event.message_id;
      if (!messageId) return null;

      const originalMsg = await this.getMessage(messageId, 'message_id');
      if (!originalMsg) return null;

      let originalEvent = originalMsg.event;
      if (typeof originalEvent === 'string') {
        try {
          originalEvent = JSON.parse(originalEvent);
        } catch {
          return null;
        }
      }

      originalEvent.recall_operator = event.notice_type === 'group_recall'
        ? event.operator_id
        : event.user_id;

      const updatedEvent = JSON.stringify(originalEvent);
      await this.messages.update(originalMsg.id, { event: updatedEvent });

      /**
       * 获取与指定通知消息最接近的前后消息
       * 对应 Python db.py 的 get_nearest_message_to_notice
       * @param {number} noticeId - 通知消息的 ID
       * @param {number|null} groupId - 群组 ID 筛选
       * @param {number|null} targetId - 目标 ID 筛选
       * @param {boolean} getAfter - 是否获取 id 较大的后一条消息
       * @param {boolean} getBefore - 是否获取 id 较小的前一条消息
       * @returns {Promise<{before: object|null, after: object|null}|object|null>}
       */
      this.getNearestMessageToNotice = async (noticeId, groupId = null, targetId = null, getAfter = true, getBefore = true) => {
        const notice = await this.messages.get(parseInt(noticeId, 10));
        if (!notice) return getBefore && !getAfter ? null : getAfter && !getBefore ? null : {
          before: null,
          after: null
        };

        const result = {};

        if (getBefore) {
          let collection = this.messages
            .where('id')
            .below(notice.id)
            .filter(m =>
              (m.post_type === 'message' || m.post_type === 'message_sent') &&
              (m.message_type === 'group' || m.post_type === 'private') &&
              (m.sub_type === 'normal' || m.sub_type === 'friend' || m.sub_type === 'group')
            );
          if (groupId) {
            const msgs = await collection.toArray();
            result.before = msgs.filter(m => m.group_id === groupId).pop() || null;
          } else if (targetId) {
            const msgs = await collection.toArray();
            result.before = msgs.filter(m => m.target_id === targetId).pop() || null;
          } else {
            const msgs = await collection.toArray();
            result.before = msgs.pop() || null;
          }
        }

        if (getAfter) {
          let collection = this.messages
            .where('id')
            .above(notice.id)
            .filter(m =>
              (m.post_type === 'message' || m.post_type === 'message_sent') &&
              (m.message_type === 'group' || m.post_type === 'private') &&
              (m.sub_type === 'normal' || m.sub_type === 'friend' || m.sub_type === 'group')
            );
          if (groupId) {
            const msgs = await collection.toArray();
            result.after = msgs.filter(m => m.group_id === groupId).shift() || null;
          } else if (targetId) {
            const msgs = await collection.toArray();
            result.after = msgs.filter(m => m.target_id === targetId).shift() || null;
          } else {
            const msgs = await collection.toArray();
            result.after = msgs.shift() || null;
          }
        }

        if (!getBefore && getAfter) return result.after;
        if (getBefore && !getAfter) return result.before;
        return result;
      };
    }
  }
}

export const virtualDB = new VirtualDB();