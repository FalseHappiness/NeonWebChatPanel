import { parseJSON, stringifyJSON } from "./others.js";

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

export {
  convertWrappedMsgSL
}