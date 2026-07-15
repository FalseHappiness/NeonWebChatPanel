import { parseJSON, stringifyJSON } from "./others.js";
import { getStreamFileDataUrl } from "./backend-api.js";

const convertNoticeSL = event => {
  event = parseJSON(event);
  if (event.post_type === 'notice') {
    const notice = { ...event }
    if (notice.notice_type === 'notify') {
      if (notice.sub_type === 'poke') {
        if (notice?.action) {
          notice.raw_info = [
            { type: "qq" },
            { type: "img", src: notice.action_img_url },
            { type: "nor", txt: notice.action },
            { type: "qq" },
            { type: "nor", txt: notice.suffix }
          ]
        }
        if (!notice.sender_id) {
          notice.sender_id = notice.user_id
        }
      }
    }
    return notice
  }
  return event
}

const convertMessageSL = event => {
  event = parseJSON(event);
  if (["message", "message_sent"].includes(event.post_type)) {
    const message = { ...event }
    // NapCatQQ: message_seq=message_id, real_seq 为序列号（顺序递增）
    // SnowLuma: message_id 为消息 id, message_seq 相当于 NapCatQQ 的 real_seq
    if (!message.hasOwnProperty("real_seq")) {
      if (message.hasOwnProperty("message_seq")) {
        message.real_seq = message.message_seq
      }
    }
    return message
  }
  return event
}

const convertWrappedMsgSL = message => {
  return {
    ...message,
    event: stringifyJSON(convertMessageSL(convertNoticeSL(message.event)))
  }
}

/**
 * 将原始 msg_content 数组转为和 parseMessage 兼容的 message 结构
 * @param {Array} msgContent 原始消息内容数组
 * @returns {Array} 兼容格式的 message 数组
 */
function translateEssenceMsgContent(msgContent) {
  return msgContent.map(item => {
    switch (item.msg_type) {
      case 1:
        // 纯文本
        return {
          type: 'text',
          data: {
            text: item.text
          }
        };
      case 2:
        // QQ表情
        return {
          type: 'face',
          data: {
            id: String(item.face_index),
            raw: {
              faceText: item.face_text,
              faceIndex: Number(item.face_index)
            }
          }
        };
      case 3:
        // 图片/GIF
        return {
          type: 'image',
          data: {
            url: item.image_url,
            thumbnail_url: item.image_thumbnail_url
          }
        };
      case 4:
        // 文件消息
        return {
          type: 'file',
          data: {
            file: item.file_name,
            file_size: item.file_size,
            file_id: item.file_id,
            bus_id: item.file_bus_id,
            url: getStreamFileDataUrl(item.file_id),
          }
        };
      default:
        // 未知类型 fallback 文本
        console.error("Translate SnowLuma essence msg unknown type:", item)
        return {
          type: 'text',
          data: {
            text: '无法处理的消息'
          }
        };
    }
  });
}

const convertEssenceMsgListSL = list => {
  if (!Array.isArray(list)) return list;
  const newList = []
  for (const msg of list) {
    if (typeof msg === 'object') {
      const newMsg = { ...msg }
      if (!msg.hasOwnProperty("operator_id")) {
        newMsg.operator_id = msg.add_digest_uin
      }
      if (!msg.hasOwnProperty("operator_nick")) {
        newMsg.operator_nick = msg.add_digest_nick
      }
      if (!msg.hasOwnProperty("operator_time")) {
        newMsg.operator_time = msg.add_digest_time
      }
      if (!msg.hasOwnProperty("sender_id")) {
        newMsg.sender_id = msg.sender_uin
      }
      if (!msg.hasOwnProperty("content") && Array.isArray(msg.msg_content)) {
        newMsg.content = translateEssenceMsgContent(msg.msg_content)
      }
      newList.push(newMsg)
    } else {
      newList.push(msg)
    }
  }
  return newList
}

export {
  convertWrappedMsgSL,
  convertEssenceMsgListSL
}