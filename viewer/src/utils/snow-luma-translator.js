import { parseJSON, stringifyJSON } from "./others.js";
import { getStreamFileDataUrl } from "./backend-api.js";

const convertNoticeSL = event => {
  event = parseJSON(event);
  if (event?.post_type === 'notice') {
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
  if (["message", "message_sent"].includes(event?.post_type)) {
    event = { ...event }
    // NapCatQQ: message_seq=message_id, real_seq 为序列号（顺序递增）
    // SnowLuma: message_id 为消息 id, message_seq 相当于 NapCatQQ 的 real_seq
    if (!event.hasOwnProperty("real_seq")) {
      if (event.hasOwnProperty("message_seq")) {
        event.real_seq = event.message_seq
      }
    }
    if (Array.isArray(event.message)) {
      const contents = []
      for (const content of event.message) {
        if (content.type === 'poke') {
          contents.push({
            ...content,
            data: {
              id: content?.data?.id || content?.data?.type,
              type: content?.data?.type || content?.data?.id
            }
          })
        } else {
          contents.push(content)
        }
      }
      event.message = contents
    }
  }
  return event
}

const convertWrappedMsgSL = message => {
  return {
    ...message,
    event: stringifyJSON(convertMessageSL(convertNoticeSL(message.event)))
  }
}

const convertContactsSL = contacts => {
  if (Array.isArray(contacts)) {
    contacts = [...contacts]
    for (const key in contacts) {
      const contact = contacts[key]
      let latest_msg = contact.latest_msg
      if (latest_msg) {
        latest_msg = stringifyJSON(convertMessageSL(latest_msg))
      }
      contacts[key] = {
        ...contact,
        latest_msg
      }
    }
  }
  return contacts
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

/**
 * 对象字段兼容映射：源对象不存在 mapKey 时，尝试从备选字段取值赋值
 * @param {object | [object, object]} sourcePair 源对象，或 [源对象, 输出对象]
 * @param {Record<string, string | string[]>} fieldMap 映射表 {最终字段:备选字段|[备选字段]}
 * @param {boolean} deleteSourceField 复制完成后是否删除原始备选字段
 * @returns {object} 处理后的目标对象
 */
const objectFieldCompatMap = (sourcePair, fieldMap, deleteSourceField = true) => {
  let sourceObj, targetObj;
  // 如果传入单个对象，则源和目标共用同一个对象；否则解构 [源对象, 目标对象]
  if (!Array.isArray(sourcePair)) {
    sourceObj = sourcePair;
    targetObj = sourcePair;
  } else {
    [sourceObj, targetObj] = sourcePair;
  }

  // finalKey：最终要使用的字段名
  for (const finalKey in fieldMap) {
    // 核心条件：源对象没有最终字段，才进行兼容赋值
    if (!sourceObj.hasOwnProperty(finalKey)) {
      let fallbackFieldList = fieldMap[finalKey];
      if (!Array.isArray(fallbackFieldList)) {
        fallbackFieldList = [fallbackFieldList];
      }

      // fallbackField：旧的备选字段名称
      for (const fallbackField of fallbackFieldList) {
        if (sourceObj.hasOwnProperty(fallbackField)) {
          targetObj[finalKey] = sourceObj[fallbackField];
          if (deleteSourceField) {
            delete sourceObj[fallbackField];
          }
        }
      }
    }
  }
  return targetObj;
};

const convertEssenceMsgListSL = list => {
  if (!Array.isArray(list)) return list;
  const newList = []
  for (const msg of list) {
    if (typeof msg === 'object') {
      const newMsg = { ...msg }

      objectFieldCompatMap([msg, newMsg], {
        operator_id: "add_digest_uin",
        operator_nick: "add_digest_nick",
        operator_time: "add_digest_time",
        sender_id: "sender_id"
      })

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

const compatGroupAlbumImageField = image => {
  return typeof image === 'object' ? objectFieldCompatMap({ ...image }, {
    photo_url: "photoUrls",
    default_url: "defaultUrl",
    is_gif: "isGif",
    has_raw: "hasRaw"
  }) : image
}

function convertGroupAlbum(input) {
  if (typeof input !== 'object') {
    return input
  }
  const coverImage = input.cover?.image
  return {
    album_id: input.id,
    owner: input.owner,
    name: input.name,
    desc: input.desc,
    create_time: String(input.createTime),
    modify_time: "0",
    last_upload_time: String(input.last_upload_time),
    upload_number: String(input.picNum),
    cover: {
      type: 0,
      image: compatGroupAlbumImageField(coverImage),
    },
    creator: {
      nick: input.createnickname,
      uin: input.createuin,
    },
  };
}

const convertGroupAlbumListSL = data => {
  const newData = []
  for (const item of data) {
    newData.push(convertGroupAlbum(item))
  }
  return {
    album_list: newData,
    attach_info: "",
    has_more: false
  }
}

const convertGroupAlbumMediaListSL = data => {
  data = { ...data }
  objectFieldCompatMap(data, {
    media_list: "mediaList",
    next_attach_info: "nextAttachInfo"
  })

  if (!data.hasOwnProperty("next_has_more")) {
    data.next_has_more = !!data.next_attach_info
  }

  const media_list = [...data.media_list]
  for (const key in media_list) {
    let media = media_list[key]
    if (typeof media === 'object') {
      media = { ...media }
      objectFieldCompatMap(media, { batch_id: "batchId", upload_time: "uploadTime" })
      media.image = compatGroupAlbumImageField(media.image)
      let video = media.video
      if (typeof video === 'object') {
        video = objectFieldCompatMap({ ...video }, {
          video_time: "videoTime",
          video_url: ["videoUrl", 'videoUrls']
        })
        video.cover = compatGroupAlbumImageField(video.cover)
        media.video = video
      }
      media_list[key] = media
    }
  }
  data.media_list = media_list
  return data
}

const convertGroupFilesSL = data => {
  data?.folders?.forEach(v => {
    objectFieldCompatMap(v, { creator_name: "create_name" })
  })
  return data
}

export {
  convertWrappedMsgSL,
  convertEssenceMsgListSL,
  convertGroupAlbumListSL,
  convertGroupAlbumMediaListSL,
  convertGroupFilesSL,
  convertContactsSL,
}