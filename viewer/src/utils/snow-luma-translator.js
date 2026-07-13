import { fetchCategoricalFriends } from "./backend-api.js";

const convertNoticeSL = event => {
  event = event instanceof String ? JSON.parse(event) : event;
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

const convertCategoricalFriendsSL = list => {
  if (!Array.isArray(list?.[0]?.buddyList)) {
    return [{
      categoryId: 1,
      categoryName: "私聊",
      categoryMbCount: list?.length,
      buddyList: Array.isArray(list) ? list : []
    }]
  }
  return list
}

export {
  convertNoticeSL,
  convertCategoricalFriendsSL
}