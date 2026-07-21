import { h } from "vue";
import {
  fetchDisplayName, fetchMsg,
  getCacheName,
  getFileDataUrl,
  getMultimediaProxyUrl,
  getStreamFileDataUrl
} from "./backend-api.js";
import { useGlobalStore } from "../store/global.js";
import TroopShareCard from "../components/MessageTypes/MessageJSON/TroopShareCard.vue";
import MiniAPP01 from "../components/MessageTypes/MessageJSON/MiniAPP01.vue";
import MarkdownMessage from "../components/MessageTypes/MarkdownMessage.vue";
import AudioMessage from "../components/MessageTypes/AudioMessage.vue";
import FileMessage from "../components/MessageTypes/FileMessage.vue";
import { getFileIcon } from "../components/MessageTypes/FileMessage.vue";
import Mannounce from "../components/MessageTypes/MessageJSON/Mannounce.vue";
import ReplyMessage from "../components/MessageTypes/ReplyMessage.vue";
import ViewNews from "../components/MessageTypes/MessageJSON/ViewNews.vue";
import ForwardMessage from "../components/MessageTypes/ForwardMessage.vue";
import ShakePokeMessage from "../components/MessageTypes/ShakePokeMessage.vue";
import LoadingImage from "../components/utils/LoadingImage.vue";
import MultiMsg from "../components/MessageTypes/MessageJSON/MultiMsg.vue";
import FeedLua from "../components/MessageTypes/MessageJSON/FeedLua.vue";
import ContactLua from "../components/MessageTypes/MessageJSON/ContactLua.vue";
import LottieDot from "../components/utils/LottieDot.vue";
import { formatTimeOptions, parseJSON } from "./others.js";
import UnparsedJSON from "../components/MessageTypes/MessageJSON/UnparsedJSON.vue";
import ActivityMD from "../components/MessageTypes/MessageJSON/ActivityMD.vue";
import UnparsedMessage from "../components/MessageTypes/UnparsedMessage.vue";

const formatTime = (message) => {
  if (!message?.time) return

  return formatTimeOptions({
    timestamp: message.time
  })
}

function convertMessageTextHTMLSyntax(text, emoji = false) {
  if (!text) return [];

  return text.split(/([\n ])/).map((part) => {
    if (part === '\n') return h('br');
    if (part === ' ') return h('span', { innerHTML: '&nbsp;' });
    return emoji ? convertEmojiToImages(part) : part;
  });
}

function convertEmojiToImages(text, emojiids) {
  if (emojiids === undefined) {
    emojiids = useGlobalStore().emojiEmojiids
  }
  const regex = new RegExp(`(${emojiids.join('|')})`, 'g');

  const parts = text.split(regex);

  return parts
    .filter(part => part.length > 0)
    .map(part => emojiids.includes(part) ? h('img', {
      alt: '',
      src: getEmojiPublicPath(part, 'png'),
      class: 'msg-preview-emoji',
      'data-emoji-id': part
    }) : part);
}

const getEmojiPublicPath = (emoji_id, type, emoji_id_suffix = '', suffix = undefined) => {
  if (!suffix) {
    suffix = ({ 'png': '.png', 'apng': '.png', 'lottie': '.json' })[type]
  }
  return `/QQ/EmojiSystermResource/${encodeURIComponent(emoji_id)}/${type}/${encodeURIComponent(emoji_id)}${emoji_id_suffix}${suffix}`
}

const getEmojiPngPath = emoji_id => getEmojiPublicPath(emoji_id, 'png')
const getEmojiApngPath = emoji_id => getEmojiPublicPath(emoji_id, 'apng')

const getEmojiLottiePath = (emoji_id, suffix) => getEmojiPublicPath(emoji_id, 'lottie', suffix)

const messagePreviewDirectConversionTypes = {
  "record": "语音",
  "video": "视频",
  "shake": "窗口抖动",
  "location": "位置",
  "music": "音乐",
  "forward": "聊天记录"
}

const createDisplayNameSpan = (is_group, group_id, user_id, promises) => {
  const type = is_group ? "group_user" : "private";
  const id_list = [group_id, user_id];

  let name

  const vnode = h("span", {
    async onVnodeMounted(vnode) {
      await promise
      if (vnode?.el && name) {
        vnode.el.textContent = name;
      }
    },
    innerText: getCacheName(id_list, type) || user_id
  })

  const promise = (async () => {
    const result = await fetchDisplayName(id_list, type, (newName) => {
      if (vnode?.el) {
        vnode.el.textContent = newName;
      }
    })
    if (!result.error) {
      name = result.name
    }
  })()

  if (Array.isArray(promises)) {
    promises.push(promise)
  }

  return vnode
}

const createNameSpanByMessageId = (message_id, promises) => {
  let name;
  const vnode = h("span", {
    async onVnodeMounted(vnode) {
      await promise
      if (vnode?.el && name) {
        vnode.el.textContent = name;
      }
    },
    innerText: '未知用户'
  })
  const promise = (async () => {
    const msg = parseJSON((await fetchMsg(message_id))?.event);
    if (msg) {
      const sender = msg?.sender
      name = msg.user_id === msg.self_id ? '你' : sender?.card || sender?.nickname;
    } else {
      name = '未知'
    }
  })()
  if (Array.isArray(promises)) {
    promises.push(promise)
  }
  return vnode
}

const parseMessagePreview = (message, returnPromise = false, replyMode = false) => {
  const promises = []
  const r = (data) => {
    if (returnPromise) {
      return (async () => {
        await Promise.all(promises)
        return data
      })()
    } else {
      return data
    }
  }
  try {
    const event = parseJSON(message);

    if (event.message && Array.isArray(event.message)) {
      const children = [];

      for (const [index, item] of event.message.entries()) {
        if (item.type === "text") {
          children.push(item.data.text || '');
        } else if (replyMode && item.type === 'video') {
          children.push(
            // h("video", {
            //   src: item.data.url,
            //   class: 'message-reply-video',
            //   controls: false,
            //   'data-fallback-link': getStreamFileDataUrl(item)
            // }),
            h(LoadingImage, {
              src: item.data.url,
              class: 'message-reply-video',
              controls: false,
              fallbackSrc: getStreamFileDataUrl(item),
              videoMode: true,
              decideMaxWidth: '.message-container',
              maxHeight: '80px',
              placeholderWidth: '128px',
              placeholderHeight: '80px'
            })
          )
          break
        } else if (messagePreviewDirectConversionTypes.hasOwnProperty(item.type)) {
          children.push(`[${messagePreviewDirectConversionTypes[item.type]}]`);
        } else if (item.type === 'json') {
          try {
            if (item.data?.data) {
              const data = JSON.parse(item.data.data);
              if (data.app === 'com.tencent.multimsg') {
                children.push("[聊天记录]");
                continue;
              }
              if (data.prompt) {
                children.push(data.prompt);
                continue;
              }
            }
          } catch (e) {
            // 忽略错误
          }
          children.push('[JSON]');
        } else if (['dice', 'rps', 'face'].includes(item.type)) {
          const face_id = item.type === 'face' ? item.data.id : {
            'dice': 358,
            'rps': 359
          }[item.type]

          children.push(
            h('img', {
              alt: '',
              src: getEmojiPngPath(face_id),
              class: 'msg-preview-emoji',
              'data-emoji-id': face_id
            })
          );
        } else if (item.type === 'image') {
          if (replyMode && index === 0) {
            children.push(
              h(LoadingImage, {
                src: item.data.url,
                class: 'message-reply-image',
                alt: "",
                fallbackSrc: item.data.hasOwnProperty("emoji_id") ? getMultimediaProxyUrl(item.data.url) : getStreamFileDataUrl(item),
                decideMaxWidth: '.message-container',
                maxHeight: '80px',
                placeholderWidth: '128px',
                placeholderHeight: '80px'
              })
            )
            break
          }
          if (item.data.summary) {
            children.push(item.data.summary)
          } else {
            children.push('[图片]')
          }
        } else if (item.type === 'at') {
          children.push(
            "@",
            createDisplayNameSpan(
              event.message_type === 'group',
              event.group_id,
              item.data.qq,
              promises,
            )
          );
        } else if (item.type === 'file') {
          if (replyMode) {
            return [
              h(
                "img",
                {
                  src: `/QQ/fileIcon/${getFileIcon(item.data.file)}`,
                  class: "message-reply-file-icon",
                  alt: ""
                }
              ),
              h(
                "span",
                {
                  class: "message-reply-file text-truncate"
                },
                [item.data.file]
              )
            ]
          }
          const data = item.data;
          if (data.file) {
            children.push(data.file)
          } else {
            children.push("[文件]")
          }
        } else if (item.type === 'poke') {
          const poke_id = item.data.id
          const poke_name = ({
            1: '戳一戳',
            2: '比心',
            3: '点赞',
            4: '心碎',
            5: '666',
            6: "放大招"
          })[poke_id]
          children.push(`[${poke_name || '未解析的戳一戳'}]`)
          if (!poke_name) {
            console.log("Unparsed poke message segment:", item)
          }
        }
      }

      return r(children.length ? children : ['']);
    }
    return r([event.raw_message || '']);
  } catch (e) {
    console.error('Message preview parse error:', e);
    return r(['']);
  }
};

const parseMessage = (wrappedMsg) => {
  try {
    const event = parseJSON(wrappedMsg.event);
    const message = event.message
    if (Array.isArray(message)) {
      const children = [];

      // 单独存在与混排有较大效果差异的消息
      if (message.length === 1) {
        const item = message[0];
        if (['dice', 'rps', 'face'].includes(item.type)) {
          const is_face = item.type === 'face'
          const face_id = is_face ? item.data.id : {
            'dice': 358,
            'rps': 359
          }[item.type]

          let resultId

          if (!is_face) {
            resultId = item.data.result
          }
          if (item.data.resultId) {
            resultId = item.data.resultId
          }

          const emojiFiles = useGlobalStore().emojiFiles;
          const lottiePath = getEmojiLottiePath(face_id, resultId ? `_${resultId}` : '');

          if (emojiFiles.includes(lottiePath)) {
            // 加载 Lottie
            children.push(
              h(LottieDot, {
                animationUrl: lottiePath,
                loop: is_face && Number.parseInt(face_id) !== 114,
                autoplay: true,
                class: 'message-super-emoji-lottie message-box-less',
                'data-face-id': face_id,
              })
            );
          }
        }
        if (children?.length) {
          return children
        }
      }

      // 只能单独存在的消息
      if (message.length) {
        for (const item of message) {
          if (item.type === 'record') {
            children.push(
              h(AudioMessage, {
                width: '200px',
                maxWidth: '100%,',
                src: getFileDataUrl(item),
                cursorColor: event.user_id === event.self_id ? 'rgba(255, 255, 255, 0.8)' : 'rgba(204, 235, 255, 0.8)'
              })
            );
          } else if (item.type === 'file') {
            children.push(
              h(FileMessage, {
                url: getStreamFileDataUrl(item),
                name: item.data.file,
                size: item.data.file_size,
              })
            );
          } else if (item.type === 'poke') {
            children.push(
              h(ShakePokeMessage, {
                id: item.data.id,
                type: item.data.type,
                out: event.self_id === event.user_id
              })
            )
          } else if (item.type === 'forward') {
            children.push(
              h(ForwardMessage, {
                id: item.data.id,
                content: item.data.content,
              })
            )
          } else if (item.type === 'json') {
            const data = JSON.parse(item.data.data);
            const components_map = {
              "com.tencent.troopsharecard": TroopShareCard,
              "com.tencent.miniapp_01": MiniAPP01,
              "com.tencent.mannounce": Mannounce,
              "com.tencent.multimsg": MultiMsg,
              "com.tencent.feed.lua": FeedLua,
              "com.tencent.contact.lua": ContactLua,
              "com.tencent.activity.md": ActivityMD
            }
            const view_components_map = {
              "news": ViewNews
            }
            const component = view_components_map[data?.view] || components_map[data.app] || UnparsedJSON;
            if (component) {
              children.push(
                h(component, {
                  json: data
                })
              )
            }
          }
          if (children?.length) {
            break
          }
        }
        if (children?.length) {
          return children
        }
      }

      // 其它只在第一个元素的消息
      if (message.length) {
        const item = message[0]
        if (item.type === 'markdown') {
          children.push(
            h(MarkdownMessage, {
              content: message[0].data.content,
              class: 'message-markdown-box',
            })
          );

          return children;
        } else if (item.type === 'reply') {
          children.push(
            h('div', [
              h(ReplyMessage, {
                id: item.data.id,
                out: event.self_id === event.user_id
              })
            ])
          )
        }
      }

      // 混排消息
      for (const item of message) {
        if (item.type === 'text') {
          children.push(...convertMessageTextHTMLSyntax(item.data.text));
        } else if (['dice', 'rps', 'face'].includes(item.type)) {
          const face_id = item.type === 'face' ? item.data.id : {
            'dice': 358,
            'rps': 359
          }[item.type]

          const apngPath = getEmojiApngPath(face_id);
          const pngPath = getEmojiPngPath(face_id);

          const emojiFiles = useGlobalStore().emojiFiles;

          let path = pngPath;
          if (emojiFiles.includes(apngPath)) {
            path = apngPath
          }
          children.push(
            h('img', {
              alt: '',
              src: path,
              class: 'message-emoji-png',
            })
          );
        } else if (item.type === 'at') {
          const id = item.data.qq;

          const isGroup = event.message_type === 'group'
          const type = isGroup ? "group_user" : "nickname"
          const id_list = [event.group_id, id];

          children.push(
            h("span", {
              onVnodeMounted: (vnode) => {
                fetchDisplayName(id_list, type, newName => {
                  if (vnode?.el) {
                    vnode.el.textContent = `@${newName}`;
                    vnode.el.dataset.displayName = newName
                  }
                });
              },
              class: "at-somebody-link message-execute-command",
              innerText: `@${getCacheName(id_list, type) || id}`,
              'data-user-id': id,
              'data-command': 'at-somebody',
              'data-display-name': "未获取"
            })
          )
        } else if (item.type === 'image') {
          let image_src = item.data.url
          children.push(
            h(LoadingImage, {
              src: image_src,
              alt: "",
              class:
                'message-image' +
                ((message.length === 1) ? " message-box-less" : "") +
                (item.data.hasOwnProperty("emoji_id") || item.data.summary === '[动画表情]' ? " message-emoji-picture" : ""),
              fallbackSrc: item.data.hasOwnProperty("emoji_id") ? getMultimediaProxyUrl(item.data.url) : getStreamFileDataUrl(item),
              decideMaxWidth: '.message-container'
            })
          );
        } else if (item.type === 'video') {
          children.push(
            h(LoadingImage, {
              src: item.data.url,
              class: 'message-video' + ((message.length === 1) ? " message-box-less" : ""),
              controls: true,
              fallbackSrc: getStreamFileDataUrl(item),
              videoMode: true,
              decideMaxWidth: '.message-container'
            })
          );
        }
      }

      // console.log(children)

      return children.length ? children : [h(UnparsedMessage, { event })];
    }
    return [event.raw_message || ''];
  } catch (e) {
    console.error("Load message error", e);
    return [wrappedMsg.event || ''];
  }
};

const parseBanDuration = duration => {
  if (duration === 0) return "0秒";

  const timeUnits = [
    { value: 86400, unit: "天" },
    { value: 3600, unit: "小时" },
    { value: 60, unit: "分钟" },
    { value: 1, unit: "秒" }
  ];

  let result = [];

  for (const { value, unit } of timeUnits) {
    if (duration >= value) {
      const count = Math.floor(duration / value);
      result.push(`${count}${unit}`);
      duration %= value;
    }
  }

  return result.join("");
};

const parseNoticePreview = (notice, returnPromise = false) => {
  const promises = []
  let children = []
  try {
    const event = parseJSON(notice);
    if (event.sub_type === 'poke') {
      const raw_info = event.raw_info
      if (raw_info && Array.isArray(raw_info)) {
        const poke_sender = event.sender_id
        const poke_target = event.target_id
        let qq_user_count = 0
        const qq_user = {
          1: poke_sender,
          2: poke_target
        }
        for (const item of raw_info) {
          if (item.type === 'qq') {
            qq_user_count++
            const uin = qq_user[qq_user_count]
            if (uin) {
              children.push(
                createDisplayNameSpan(
                  ![null, undefined].includes(event.group_id),
                  event.group_id,
                  uin,
                  promises,
                )
              )
            } else {
              children.push(item.uid)
            }
          } else if (item.type === 'nor') {
            children.push(item.txt)
          } else if (item.type === 'img') {
            children.push(
              h('img', {
                alt: '',
                src: getMultimediaProxyUrl(item.src),
                class: 'msg-preview-emoji',
              })
            )
          }
        }
      }
    } else if (event.notice_type === 'essence' && event.sub_type === 'add') {
      const essence_user = event.user_id

      children.push(
        essence_user ? createDisplayNameSpan(
          true,
          event.group_id,
          essence_user,
          promises,
        ) : "未知",
        '的消息被设为了精华消息'
      )
    } else if (event.notice_type === 'group_ban' && ['ban', 'lift_ban'].includes(event.sub_type)) {
      if (event.duration <= 0 && String(event.user_id) === '0') {
        children.push(
          event.operator_id === event.self_id ? "你" :
            createDisplayNameSpan(
              true,
              event.group_id,
              event.operator_id,
              promises,
            ),
          event.sub_type === 'ban' ? '开启' : "关闭",
          "了全员禁言"
        )
      } else {
        children.push(
          createDisplayNameSpan(
            true,
            event.group_id,
            event.user_id,
            promises,
          ),
          '被',
          createDisplayNameSpan(
            true,
            event.group_id,
            event.operator_id,
            promises,
          ),
          event.sub_type === 'ban' ? '禁言' : "解除禁言",
        )
        if (event.sub_type === 'ban') {
          children.push(parseBanDuration(event.duration))
        }
      }
    } else if (event.notice_type === 'group_increase' && ['approve', 'invite'].includes(event.sub_type)) {
      if (event.sub_type === 'invite') {
        children.push(
          createDisplayNameSpan(
            true,
            event.group_id,
            event.operator_id,
            promises,
          ),
          '邀请'
        )
      }
      children.push(
        createDisplayNameSpan(
          true,
          event.group_id,
          event.user_id,
          promises,
        ),
        '加入了群聊'
      )
    } else if (event.notice_type === 'group_decrease' && event.sub_type === 'kick_me') {
      children.push('你已被移出群聊')
    } else if (event.notice_type === 'group_msg_emoji_like') {
      const face_id = event?.likes?.[0]?.emoji_id
      children.push(
        event.operator_id === event.self_id ? '你' : createDisplayNameSpan(
          true,
          event.group_id,
          event.operator_id,
          promises,
        ),
        event.sub_type === 'add' ? '回应了' : "取消回应了",
        createNameSpanByMessageId(event.message_id, promises),
        '的消息',
        ': ',
        h('img', {
          alt: '',
          src: getEmojiPngPath(face_id),
          class: 'msg-preview-emoji',
          'data-emoji-id': face_id
        })
      )
    }
  } catch (e) {
    console.error("Notice preview parse error:", e)
    children = ['']
  }

  if (returnPromise) {
    return (async () => {
      await Promise.all(promises)
      return children
    })()
  } else {
    return children
  }
}

const createNoticeExecuteCommand = (type, arg2, arg3, arg4) => {
  let props, children, command
  if (Array.isArray(arg2)) {
    children = arg2
    command = arg3
  } else if (Array.isArray(arg3)) {
    children = arg3
    props = arg2
    command = arg4
  } else {
    command = arg4
  }
  if (typeof props !== 'object') {
    props = {}
  }
  return h(type, {
    ...props,
    class: (props.class ? props.class : "") + " notice-execute-command",
    "data-command": command
  }, children)
}

const parseNotice = notice => {
  let children = []
  try {
    const event = parseJSON(notice.event);
    if (event.sub_type === 'poke') {
      const raw_info = event.raw_info
      if (raw_info && Array.isArray(raw_info)) {
        const poke_sender = event.sender_id || event.user_id
        const poke_target = event.target_id
        let qq_user_count = 0
        const qq_user = {
          1: poke_sender,
          2: poke_target
        }
        raw_info.forEach(item => {
          if (item.type === 'qq') {
            qq_user_count++
            const uin = qq_user[qq_user_count]
            if (uin) {
              children.push(
                createNoticeExecuteCommand('span', [
                  createDisplayNameSpan(
                    ![null, undefined].includes(event.group_id),
                    event.group_id,
                    uin
                  )
                ], 'view-user-info-' + uin)
              )
            } else {
              children.push(item.uid)
            }
          } else if (item.type === 'nor') {
            children.push(item.txt)
          } else if (item.type === 'img') {
            let element = h('img', {
              alt: '',
              src: getMultimediaProxyUrl(item.src),
              class: 'notice-emoji-png',
            })
            const jumpLink = item.jp
            if (jumpLink) {
              element = h("a", {
                target: '_blank',
                href: jumpLink,
              }, [element])
            }
            children.push(element)
          }
        })
      }
    } else if (event.notice_type === 'essence' && event.sub_type === 'add') {
      const essence_user = event.user_id

      children.push(
        essence_user ? createNoticeExecuteCommand(
          "span",
          [
            createDisplayNameSpan(
              true,
              event.group_id,
              essence_user
            ),
            '的消息'
          ],
          "jump-to-msg-" + event.message_id
        ) : "未知的消息",
        '被设为了',
        createNoticeExecuteCommand('span', ['精华消息'], 'open-essence-window'),
      )
    } else if (event.notice_type === 'group_ban' && ['ban', 'lift_ban'].includes(event.sub_type)) {
      if (event.duration <= 0 && String(event.user_id) === '0') {
        children.push(
          event.operator_id === event.self_id ? "你" :
            createNoticeExecuteCommand('span', [
              createDisplayNameSpan(
                true,
                event.group_id,
                event.operator_id,
              ),
            ], 'view-user-info-' + event.operator_id),
          event.sub_type === 'ban' ? '开启' : "关闭",
          "了全员禁言"
        )
      } else {
        children.push(
          createNoticeExecuteCommand('span', [
            createDisplayNameSpan(
              true,
              event.group_id,
              event.user_id,
            ),
          ], 'view-user-info-' + event.user_id),
          '被',
          createNoticeExecuteCommand('span', [
            createDisplayNameSpan(
              true,
              event.group_id,
              event.operator_id,
            ),
          ], 'view-user-info-' + event.operator_id),
          event.sub_type === 'ban' ? '禁言' : "解除禁言",
        )
        if (event.sub_type === 'ban') {
          children.push(parseBanDuration(event.duration))
        }
      }
    } else if (event.notice_type === 'group_increase' && ['approve', 'invite'].includes(event.sub_type)) {
      if (event.sub_type === 'invite') {
        children.push(
          createNoticeExecuteCommand('span', [
            createDisplayNameSpan(
              true,
              event.group_id,
              event.operator_id,
            ),
          ], 'view-user-info-' + event.operator_id),
          '邀请'
        )
      }
      children.push(
        createNoticeExecuteCommand('span', [
          createDisplayNameSpan(
            true,
            event.group_id,
            event.user_id,
          ),
        ], 'view-user-info-' + event.user_id),
        '加入了群聊'
      )
    } else if (event.notice_type === 'group_decrease' && event.sub_type === 'kick_me') {
      children.push('你已被移出群聊')
    } else if (event.notice_type === 'group_msg_emoji_like') {
      const face_id = event?.likes?.[0]?.emoji_id
      children.push(
        event.operator_id === event.self_id ? '你' : createNoticeExecuteCommand('span', [
          createDisplayNameSpan(
            true,
            event.group_id,
            event.operator_id,
          ),
        ], 'view-user-info-' + event.operator_id),
        event.sub_type === 'add' ? '回应了' : "取消回应了",
        createNoticeExecuteCommand(
          "span",
          [
            createNameSpanByMessageId(event.message_id),
            '的消息'
          ],
          "jump-to-msg-" + event.message_id
        ),
        ': ',
        h('img', {
          alt: '',
          src: getEmojiPngPath(face_id),
          class: 'msg-preview-emoji',
          'data-emoji-id': face_id
        })
      )
    }
  } catch (e) {
    console.error("Notice parse error:", e)
    children = ['']
  }

  return children
}

const isSupportedNoticeMessage = notice => {
  return (
    notice.sub_type === 'poke' ||
    (notice.notice_type === 'essence' && notice.sub_type === 'add') ||
    (notice.notice_type === 'group_ban' && ['ban', 'lift_ban'].includes(notice.sub_type)) ||
    (notice.notice_type === 'group_increase' && ['approve', 'invite'].includes(notice.sub_type)) ||
    (notice.notice_type === 'group_decrease' && notice.sub_type === 'kick_me') ||
    (notice.notice_type === 'group_msg_emoji_like' && ['add', 'remove'].includes(notice.sub_type))
  )
}

export {
  parseMessagePreview,
  formatTime,
  parseMessage,
  convertMessageTextHTMLSyntax,
  parseNoticePreview,
  parseNotice,
  isSupportedNoticeMessage,
}