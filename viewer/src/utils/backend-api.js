// 获取显示名称的函数
import axios from "axios";
import { toRaw } from "vue";
import { useGlobalStore } from "../store/global.js";
import { showToast } from "./toast.js";
import { createSHA256 } from 'hash-wasm';
import { nanoid } from 'nanoid';
import { CalledEmitter } from "../composables/event-bus.js";
import { convertEssenceMsgListSL, convertGroupAlbumListSL, convertWrappedMsgSL } from "./snow-luma-translator.js";

let apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
let wsUri = import.meta.env.VITE_WS_URI;

if (import.meta.env.PROD) {
  console.log('当前是生产环境');
  const { protocol, host } = window.location;
  // http/https 接口地址
  apiBaseUrl = `${protocol}//${host}`;
  // ws/wss 地址：http → ws，https → wss
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  wsUri = `${wsProtocol}//${host}/ws/frontend`;
}

const fetchOptionsAction = async ({ endpoint, data, signal, timeout }) => {
  try {
    if (signal instanceof AbortController) {
      signal = signal.signal
    }
    return await CalledEmitter.emit("sendAction", endpoint, data, signal, timeout)
  } catch (e) {
    showToast("error", `Fetch action ${endpoint} error`);
    console.error(`Fetch action ${endpoint} error`, e);
    throw e;
  }
}

const fetchAction = async (endpoint, data, signal, timeout) => {
  return await fetchOptionsAction({ endpoint, data, signal, timeout })
}

const fetchActionData = async (endpoint, params, signal) => {
  const response = await fetchAction(endpoint, params, signal)
  if (response.status === 'ok') {
    return response.data;
  }
  throw new Error(`Action ${endpoint} error: ` + JSON.stringify(response))
}

/**
 * 通过 WebSocket 的 req_backend 类型请求后端（FastAPI 本地接口）
 * @param {string} endpoint - 后端端点名 (contacts / get_msg / messages / sync)
 * @param {object} [params] - 请求参数
 * @param {AbortSignal|AbortController} [signal] - 中断信号
 * @returns {Promise<any>} 后端响应数据
 */
const fetchBackend = async (endpoint, params = {}, signal) => {
  try {
    if (signal instanceof AbortController) {
      signal = signal.signal
    }
    return await CalledEmitter.emit("reqBackend", endpoint, params, signal)
  } catch (e) {
    showToast("error", `Fetch backend ${endpoint} error`);
    console.error(`Fetch backend ${endpoint} error`, e);
    throw e;
  }
}

const fetchBackendData = async (endpoint, params, signal) => {
  const response = await fetchBackend(endpoint, params, signal)
  if (['success', 'ok'].includes(response.status)) {
    return response.data;
  }
  throw new Error(`Backend ${endpoint} error: ` + JSON.stringify(response))
}

const fetchAPI = async (endpoint, params = {}, method = 'POST', data = null, signal = null) => {
  try {
    if (signal instanceof AbortController) {
      signal = signal.signal
    }
    const config = {
      method: method.toLowerCase(), // 确保方法小写
      url: `${apiBaseUrl}/api/${endpoint}`,
      params: method.toUpperCase() === 'GET' ? params : (data === null ? {} : params),
      data: method.toUpperCase() === 'POST' ? data || params : {} // POST请求使用data
    };
    if (signal instanceof AbortSignal) {
      config['signal'] = signal
    }

    const response = await axios(config);
    return response.data;
  } catch (e) {
    showToast("error", `${method} API ${endpoint} error`);
    console.error(`${method} API ${endpoint} error: `, e);
    throw new Error(`${method} API ${endpoint} error`);
  }
};

const fetchOptionsAPI = (endpoint, options) => {
  if (options instanceof Object) {
    if (options.controller instanceof AbortController) {
      options.signal = options.controller.signal
    }
    return fetchAPI(endpoint, options.params, options.method, options.data, options.signal)
  }
}

const fetchDataInfo = async (endpoint, params) => {
  const response = await fetchAPI(endpoint, params)
  if (response.code === 200) {
    return response.data;
  }
  // showToast("error", `Request ${endpoint} error`)
  throw new Error(`Request ${endpoint} error: ` + JSON.stringify(response))
}

export const fetchGroupInfo = async (group_id) => {
  return await fetchActionData('get_group_info', { group_id: group_id })
}

const fetchStrangerInfo = async (user_id) => {
  return await fetchActionData("get_stranger_info", { user_id: user_id })
}

const fetchGroupMemberInfo = async (group_id, user_id) => {
  return await fetchActionData("get_group_member_info", { group_id: group_id, user_id: user_id })
}

const fetchGroupMemberList = async (group_id) => {
  return await fetchActionData("get_group_member_list", { group_id: group_id })
}

const FriendListCache = {
  list: [],
  expired_time: 3600000, // 1小时
  save_time: 0,
  expired: function () {
    return Date.now() - (this.save_time || 0) > this.expired_time
  }
}

const fetchFriendList = async (force = false) => {
  if (FriendListCache.expired() || force) {
    FriendListCache.list = await fetchActionData("get_friend_list")
  }
  return FriendListCache.list
}

const fetchFriendInfo = async (user_id) => {
  return (await fetchFriendList()).find(user => user.user_id === user_id);
}

const fetchUserInfo = async (user_id) => {
  let user = await fetchFriendInfo(user_id)
  if (!user) {
    user = await fetchStrangerInfo(user_id)
  }
  return user
}

const fetchMessages = async (params) => {
  const result = await fetchBackendData(
    'messages',
    Object.assign(
      {},
      {
        limit: 20,
        direction: 'prev',
      },
      params,
    )
  )
  const messages = result.messages
  if (Array.isArray(messages)) {
    for (const index in messages) {
      messages[index] = convertWrappedMsgSL(messages[index])
    }
  }
  return result
}

const fetchMsg = async (msg_id) => {
  return await fetchBackendData('get_msg', { message_id: msg_id })
}

const fetchSyncMessages = async last_id => {
  return await fetchBackendData('sync', { last_id })
}

const fetchForwardMessage = async (id) => {
  return (await fetchActionData('get_forward_msg', { message_id: id })).messages
}

/**
 * 发送消息接口封装
 * @param {object} contact 联系人对象 { type: 'group'|'private', contact_id: number }
 * @param {string | Array} message 消息内容，字符串或消息段数组
 * @param {AbortSignal} signal 中断信号
 * @param [timeout] 超时时间
 * @returns {Promise<any>} OneBot接口返回结果
 */
const fetchSendMessageOptions = async ({ contact, message, signal, timeout = undefined }) => {
  const isGroup = contact.type === 'group';

  // 字符串JSON解析
  message = typeof message === 'string' ? JSON.parse(message) : message;

  // 戳一戳特殊逻辑
  if (Array.isArray(message) && message.length > 0) {
    const firstSeg = message[0];
    if (firstSeg.type === 'poke' && firstSeg.data) {
      const pokeData = firstSeg.data;
      const pokeUser = pokeData.user_id ?? -1;
      const pokeGroup = pokeData.group_id ?? -1;
      const pokeTarget = pokeData.target_id ?? -1;

      const reqData = {
        user_id: pokeUser || pokeTarget,
        target_id: pokeTarget || pokeUser,
      };
      if (pokeGroup !== -1) {
        reqData.group_id = pokeGroup;
      }

      if (pokeUser !== -1) {
        return await fetchAction("send_poke", reqData, signal, timeout);
      }
    }
  }

  // 组装普通消息请求参数
  const reqData = { message };
  reqData[isGroup ? 'group_id' : 'user_id'] = contact.contact_id
  // 拼接接口 endpoint
  const endpoint = isGroup ? "send_group_msg" : "send_private_msg";

  return await fetchAction(endpoint, reqData, signal);
}


const fetchSendMessage = async (contact, message, signal) => {
  return await fetchSendMessageOptions({ contact, message, signal })
}

const fetchEssenceMessages = async (group_id, only_real_seq) => {
  const data = convertEssenceMsgListSL(await fetchActionData('get_essence_msg_list', { group_id, only_real_seq }))
  return only_real_seq ? data.map(item => item.msg_seq) : data
}

const fetchChangeEssenceMsg = async (message_id, set) => {
  return await fetchAction(set ? 'set_essence_msg' : 'delete_essence_msg', { message_id })
}

const fetchRecallMessage = async (message_id) => {
  return await fetchAction('delete_msg', { message_id })
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

const fetchSendFiles = async ({ contact, files, signal, controller, type = 'file' }) => {
  if (!(signal instanceof AbortSignal) && controller instanceof AbortController) {
    signal = controller.signal
  }
  const message = [];
  if (!Array.isArray(files)) {
    files = [files]
  }
  for (const file of files) {
    try {
      const base64 = await fileToBase64(file);
      message.push({
        type,
        data: {
          file: base64,
          name: file.name
        }
      });
    } catch (error) {
      console.error(`文件 ${file.name} 转换 Base64 失败:`, error);
      showToast('error', `文件 ${file.name} 发送失败`)
    }
  }
  if (message?.length) {
    if (signal?.aborted || signal?.signal?.aborted) {
      return
    }
    return await fetchSendMessageOptions({ contact, message, signal, timeout: 20 * 60 * 1000 })
  }
}

/**
 * 分片计算文件SHA256，兼容http不安全上下文
 * @param file File对象
 * @param chunkSize 分片大小 默认2MB
 * @param onProgress 进度回调 (0~1)
 * @returns sha256 十六进制字符串
 */
export async function calcFileSha256(file, chunkSize = 2 * 1024 * 1024, onProgress) {
  // 创建独立sha256实例
  const hasher = await createSHA256()
  hasher.init()

  const totalSize = file.size
  let offset = 0

  while (offset < totalSize) {
    // 截取文件分片
    const slice = file.slice(offset, offset + chunkSize)
    const buf = await slice.arrayBuffer()
    const uint8 = new Uint8Array(buf)

    // 流式更新哈希
    hasher.update(uint8)

    offset += buf.byteLength
    // 进度回调
    if (onProgress) {
      onProgress(offset / totalSize)
    }
  }

  // 输出十六进制哈希
  return hasher.digest('hex')
}

/**
 * 通过 sendAction 分块上传大文件（每块 64KB）
 * 参考 test_upload_stream.py 的 upload_file_stream_batch 实现
 *
 * @param {object} task - 上传任务
 * @param {object} task.contact - 联系人信息 { contact_id, type }
 * @param {File} task.file - 要上传的文件对象
 * @param {AbortController} task.controller - 中止控制器
 * @param {number} task.start_timestamp
 * @param {number} task.chunk_size
 * @param {number} task.chunk_index
 * @param {number} task.total_chunks
 * @param {boolean} task.is_calc_hash
 * @param {string} [task.type='file'] - 发送消息类型
 * @returns {Promise<object>} 上传完成后的消息响应
 */
const fetchSendFileStream = async (task) => {
  const { contact, file, controller } = task
  const CHUNK_SIZE = 64 * 1024; // 64KB
  const streamId = nanoid();
  const fileName = file.name;
  const sha256 = await calcFileSha256(file);
  const startTimestamp = Date.now();
  const uploadName = `${fileName}-${sha256}`;

  // console.log(`[fetchSendFileStream] 开始上传文件: ${fileName}`);
  // console.log(`[fetchSendFileStream] 文件大小: ${file.size} 字节`);
  // console.log(`[fetchSendFileStream] 分块大小: ${CHUNK_SIZE} 字节 (64KB)`);
  // console.log(`[fetchSendFileStream] 流ID: ${streamId}`);

  task.start_timestamp = startTimestamp
  task.chunk_size = CHUNK_SIZE
  task.is_calc_hash = false

  // 分片懒读取工具：只读取当前需要的片段，不加载完整文件
  const readSingleChunk = async (start, end) => {
    const blob = file.slice(start, end);
    return await blob.arrayBuffer();
  };

  try {
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    task.total_chunks = totalChunks

    console.log(`[fetchSendFileStream] 文件 ${fileName} 读取完成, 总块数: ${totalChunks}, SHA256: ${sha256}`);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      // 检查是否被中止
      if (controller?.signal?.aborted) {
        throw new Error(`${fileName} 上传已取消`);
      }
      task.chunk_index = chunkIndex

      // 提取当前块数据（按需切片读取，不再一次性加载全部buffer）
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunkData = await readSingleChunk(start, end);

      // 将块数据编码为 base64
      const chunkBytes = new Uint8Array(chunkData);
      let binary = '';
      for (let i = 0; i < chunkBytes.length; i++) {
        binary += String.fromCharCode(chunkBytes[i]);
      }
      const chunkBase64 = btoa(binary);

      // 构建 upload_file_stream 参数
      const params = {
        stream_id: streamId,
        chunk_data: chunkBase64,
        chunk_index: chunkIndex,
        total_chunks: totalChunks,
        file_size: totalSize,
        filename: uploadName,
        file_retention: 3 * 60 * 1000, // ms = 3 min
        expected_sha256: sha256
      };

      // console.log(`[fetchSendFileStream] 发送分片 ${chunkIndex + 1}/${totalChunks} (${chunkBytes.length} 字节, 已耗时 ${((Date.now() - startTimestamp) / 1000).toFixed(1)}s)`);

      // 通过 sendAction 发送分片
      const response = await fetchActionData('upload_file_stream', params);

      // console.log(`[fetchSendFileStream] 分片 ${chunkIndex + 1}/${totalChunks} 响应:`, response);

      if (response?.status !== 'chunk_received') {
        throw new Error(`上传分片 ${chunkIndex} 失败: ${JSON.stringify(response)}`);
      }
    }

    // 所有分片发送完成，发送完成信号
    console.log(`[fetchSendFileStream] ${fileName} 所有分片发送完成, 请求文件合并...`);

    const completeParams = {
      stream_id: streamId,
      is_complete: true,
      total_chunks: totalChunks,
      file_size: totalSize,
      filename: uploadName,
      start_timestamp: startTimestamp
    };

    const completeResponse = await fetchActionData('upload_file_stream', completeParams);

    // console.log(`[fetchSendFileStream] 合并响应:`, completeResponse);

    const result = completeResponse || {};

    if (result.status === 'file_complete') {
      // const elapsed = ((Date.now() - startTimestamp) / 1000).toFixed(1);
      // console.log(`[fetchSendFileStream] ✅ 文件上传成功!`);
      // console.log(`[fetchSendFileStream]    - 文件路径: ${result.file_path}`);
      // console.log(`[fetchSendFileStream]    - 文件大小: ${result.file_size} 字节`);
      // console.log(`[fetchSendFileStream]    - SHA256: ${result.sha256}`);
      // console.log(`[fetchSendFileStream]    - 总计耗时: ${elapsed}s`);

      // 现在发送文件到聊天
      const message = [{
        type: 'file',
        data: {
          file: result.file_path,
          name: fileName
        }
      }];

      return await fetchSendMessage(contact, message, controller)
    } else {
      throw new Error(`文件状态异常: ${JSON.stringify(result)}`);
    }

  } catch (error) {
    console.error(`[fetchSendFileStream] ❌ 上传失败:`, error);
    throw error;
  }
};

const fetchCategoricalFriends = async () => {
  return await fetchActionData('get_friends_with_category')
}

const fetchGroupList = async () => {
  return fetchActionData('get_group_list')
}

const fetchForwardSingleMsg = async (message_id, contact) => {
  const isGroup = contact.type === 'group'
  return await fetchAction(`forward_${isGroup ? "group" : "friend"}_single_msg`, {
    message_id,
    [isGroup ? "group_id" : "user_id"]: contact.contact_id
  })
}

const fetchGroupNotice = async (group_id) => {
  return fetchActionData('_get_group_notice', { group_id })
}

const fetchLoginInfo = async (group_id) => {
  return fetchActionData('get_login_info', { group_id })
}

const fetchSetGroupRemark = async (group_id, remark) => {
  return await fetchAction('set_group_remark', { group_id, remark })
}

const fetchSetGroupMemberRemark = async (group_id, user_id, card) => {
  return await fetchAction('set_group_card', { group_id, user_id, card })
}

const fetchSetLongNick = async (longNick) => {
  return await fetchAction('set_self_longnick', { longNick })
}

const fetchRemainGroupAtAll = async (group_id) => {
  return await fetchActionData('get_group_at_all_remain', { group_id })
}

const fetchAPIVersionInfo = async () => {
  return await fetchActionData("get_version_info")
}

/**
 * 将 QQ 的 [em]e数字[/em] 格式还原为真实 Unicode 表情
 * @param {string} text - 包含 [em] 标签的原始字符串
 * @returns {string} 还原后的字符串
 */
function decodeQQEmoji(text) {
  if (typeof text !== 'string') return text;

  return text.replace(/\[em]e(\d+)\[\/em]/g, (match, num) => {
    const codePoint = parseInt(num, 10) - 200000; // 核心算法
    // 用 String.fromCodePoint 将 Unicode 码点转成字符
    return String.fromCodePoint(codePoint);
  });
}


const fetchGroupAlbumList = async (group_id, attach_info) => {
  const snowLumaEndpoint = "get_group_album_list"
  const params = { group_id, attach_info }
  if (isSnowLuma()) {
    return convertGroupAlbumListSL(await fetchActionData(snowLumaEndpoint, params));
  } else {
    const ncData = await fetchActionData("get_qun_album_list", params)
    if (ncData.album_list?.length && Object.keys(ncData.album_list[0]).length === 1) { // SnowLuma get_qun_album_list 只有 album_id
      return convertGroupAlbumListSL(await fetchActionData(snowLumaEndpoint, params));
    }
    return ncData;
  }
}

const isObject = (variable) => {
  return typeof variable === 'object' && !Array.isArray(variable);
};

const isObjectProp = (obj, key, elseSetEmptyObj = false, returnObj = false) => {
  if (!isObject(obj)) {
    return returnObj ? obj : false;
  }
  const is = isObject(obj[key]);
  if (!is && elseSetEmptyObj) {
    obj[key] = {};
  }
  return returnObj ? obj[key] : is;
};

const NameCachesUtil = {
  expired_time: 3600000, // 1小时
  validTypes: ['group', 'group_name', 'group_user', 'private', 'nickname'],

  init(id, type) {
    if (!this.validTypes.includes(type)) {
      throw new Error("Invalid 'type' parameter");
    }

    const nameCaches = toRaw(useGlobalStore().nameCaches); // 使用原始对象

    this.validTypes.forEach(key => {
      isObjectProp(nameCaches, key, true);
    });

    const [groupId, userId] = type === 'group_user' ?
      (Array.isArray(id) ? id : [null, id]) :
      [null, id];

    let targetObj = nameCaches[type];
    let userInfo = targetObj[userId];

    if (type === 'group_user') {
      isObjectProp(nameCaches.group_user, groupId, true);
      const groupObj = nameCaches.group_user[groupId];
      userInfo = isObjectProp(groupObj, userId, true, true);
      return { nameCaches, groupObj, userId, userInfo };
    }

    return { nameCaches, groupObj: null, userId, userInfo: isObjectProp(targetObj, userId, true, true) };
  },

  expired(id, type) {
    const { nameCaches, groupObj, userId, userInfo } = this.init(id, type);
    const now = Date.now();
    const cacheExpired = now - (userInfo.save_time || 0) > this.expired_time;

    if (cacheExpired) {
      const emptyObj = {};
      if (type === 'group_user') {
        groupObj[userId] = emptyObj;
      } else {
        nameCaches[type][userId] = emptyObj;
      }
      return { nameCaches, groupObj, userId, userInfo: emptyObj };
    }

    return { nameCaches, groupObj, userId, userInfo };
  },

  get(id, type) {
    const { userInfo } = this.expired(id, type);
    return userInfo.name || undefined;
  },

  set(id, type, name, groupUserInfo) {
    const { userInfo } = this.init(id, type);
    if (!name) return;

    userInfo.save_time = Date.now();
    userInfo.name = name;

    if (type === 'group_user' && isObject(groupUserInfo)) {
      ['is_robot', 'level', 'role', 'title'].forEach(prop => {
        if (prop in groupUserInfo) {
          userInfo[prop] = groupUserInfo[prop];
        }
      });
    }
  },

  setGroupUsersInBatches(group_id, group_users, friends) {
    const { groupObj } = this.init([group_id, 0], "group_user");

    const friend_map = friends.reduce((obj, item) => {
      obj[item.user_id] = item.remark;
      return obj;
    }, {});

    for (const info of group_users) {
      const user_info = isObjectProp(groupObj, info.user_id, true, true);
      ['is_robot', 'level', 'role', 'title', 'card', 'nickname'].forEach(prop => {
        if (prop in info) {
          user_info[prop] = info[prop];
        }
      });
      user_info.name = info.card || friend_map[info.user_id] || info.nickname;
      user_info.save_time = Date.now();
    }
  },

  clearGroupUsers() {
    const { nameCaches } = this.init(0, "private");
    nameCaches['group_user'] = {}
  },

  getGroupLevelTitle(group_id, user_id) {
    const { userInfo } = this.expired([group_id, user_id], "group_user");
    return userInfo;
  },

  setFriendsInBatches(friends) {
    const { nameCaches } = this.init(0, "private");

    for (const info of friends) {
      const user_info = isObjectProp(nameCaches.private, info.user_id, true, true)
      user_info.name = info.remark || info.nickname;
      user_info.save_time = Date.now();
    }
  },

  getGroupUsers(group_id) {
    // 初始化确保数据结构存在
    this.init([group_id, 0], "group_user");

    const rawNameCaches = toRaw(useGlobalStore().nameCaches);
    const groupUsers = rawNameCaches.group_user[group_id];

    // 如果没有群用户数据，直接返回空对象
    if (!groupUsers) return {};

    const now = Date.now();
    const result = {};

    // 遍历群内所有用户
    for (const user_id in groupUsers) {
      const userInfo = groupUsers[user_id];

      // 跳过空对象或无效缓存
      if (Object.keys(userInfo).length === 0) continue;

      // 检查缓存是否过期
      if (now - (userInfo.save_time || 0) > this.expired_time) {
        // 过期则清空缓存
        groupUsers[user_id] = {};
      } else {
        // 有效缓存添加到结果
        result[user_id] = { ...userInfo };
      }
    }

    return result;
  },
};

const getCacheName = function () {
  return NameCachesUtil.get(...arguments);
};

const getCacheGroupLevelTitle = function () {
  return NameCachesUtil.getGroupLevelTitle(...arguments)
}

const getGroupUsers = function (group_id) {
  return NameCachesUtil.getGroupUsers(group_id)
}

const fetchDisplayName = async (
  id,
  type,
  nameChangedCallback = newName => {
  },
  force = false
) => {
  const result = {
    name: "",
    error: false
  }
  const changeName = value => {
    result.name = value;
    nameChangedCallback(value)
  }
  if (type !== 'group_user' && Array.isArray(id)) {
    id = id[1]
  }
  let user_id = id
  if (type === 'group_user') {
    user_id = id[1]
  }
  try {
    const cacheName = NameCachesUtil.get(id, type)
    let name;
    if (!force && cacheName) {
      changeName(cacheName)
      return result
    }
    // name = `${user_id} (名称获取中)`;
    // changeName(name)

    let data
    if (['group', 'group_name'].includes(type)) {
      data = await fetchGroupInfo(id)
      if (type === 'group') {
        name = data.group_remark || data.group_name;
      } else {
        name = data.group_name;
      }
      changeName(name || `Group ${id}`)
    } else if (['private', 'nickname'].includes(type)) {
      data = await fetchUserInfo(id)
      if (type === 'private') {
        name = data.remark || data.nickname;
      } else {
        name = data.nickname;
      }
      changeName(name || `User ${id}`)
    } else if (type === 'group_user') {
      const group_id = id[0];
      let data1
      let data2
      if (user_id === 'all') {
        name = data2 = '全体成员'
      } else if (user_id) {
        data1 = await fetchUserInfo(user_id)
        try {
          data2 = await fetchGroupMemberInfo(group_id, user_id)
        } catch (e) {

        }
        name = data2?.card || data1?.remark || data2?.nickname || data1.nickname;
      } else {
        name = data2 = 'Invalid user'
      }
      changeName(name || `User ${user_id}`)
      NameCachesUtil.set(id, type, name, data2)
    }

    NameCachesUtil.set(id, type, name)
  } catch (error) {
    console.error('获取名称失败:', id, type, error)
    showToast('error', `获取名称失败: ${id} ${type}`)
    result.error = true
    // changeName(`${user_id} (名称获取失败)`)
    // NameCachesUtil.set(id, type, null)
  }
  return result;
}

const getGroupUsersDisplayName = async (group_id) => {
  NameCachesUtil.clearGroupUsers();
  const [group_users, friends] = await Promise.all([
    fetchGroupMemberList(group_id),
    fetchFriendList(),
  ]);
  NameCachesUtil.setGroupUsersInBatches(group_id, group_users, friends)
}

const getFriendsDisplayName = async () => {
  NameCachesUtil.setFriendsInBatches(await fetchFriendList())
}

const setGroupNameCache = (group_id, name) => {
  NameCachesUtil.set(group_id, 'group', name)
}

const setGroupUserNameCache = (group_id, user_id, name) => {
  NameCachesUtil.set([group_id, user_id], 'group_user', name)
}

const fetchContacts = async () => {
  return await fetchBackendData("contacts")
}

const getMultimediaProxyUrl = (url) => {
  return `${apiBaseUrl}/api/proxy_multimedia?url=${encodeURIComponent(url)}`
}

const getFileDataUrl = (file_id, type) => {
  if (typeof file_id === 'object') {
    const data = file_id
    file_id = data.data.file_id || data.data.file
    type = data.type
    if (['video'].includes(type)) {
      type = 'file'
    }
  }

  type = type || 'file'
  return `${apiBaseUrl}/api/get_file_data?type=${encodeURIComponent(type)}&file_id=${encodeURIComponent(file_id)}`
}

const getStreamFileDataUrl = file_id => {
  if (typeof file_id === 'object') {
    const data = file_id
    file_id = data?.data?.file_id || data?.data?.file
  }
  return `${apiBaseUrl}/api/get_stream_file_data?file_id=${encodeURIComponent(file_id)}`
}

const getGroupLogo = (group_id, size = 100) => {
  return `https://p.qlogo.cn/gh/${group_id}/${group_id}/${size}`
}

const getUserLogo = (user_id, size = 100) => {
  return `https://q1.qlogo.cn/g?b=qq&nk=${user_id}&s=${size}`
}

const getGroupNoticePicUrl = (pic_url) => {
  return `https://gdynamic.qpic.cn/gdynamic/${pic_url}/0`
}

const isSnowLuma = () => {
  return useGlobalStore().apiVersionInfo?.app_name?.includes("SnowLuma")
}

export {
  fetchDisplayName,
  fetchContacts,
  fetchMessages,
  getCacheName,
  getMultimediaProxyUrl,
  getGroupUsersDisplayName,
  getCacheGroupLevelTitle,
  getFileDataUrl,
  getFriendsDisplayName,
  fetchMsg,
  fetchForwardMessage,
  fetchSendMessage,
  fetchEssenceMessages,
  fetchChangeEssenceMsg,
  getGroupUsers,
  getStreamFileDataUrl,
  fetchSendFiles,
  fetchRecallMessage,
  fetchCategoricalFriends,
  fetchGroupList,
  fetchForwardSingleMsg,
  fetchGroupNotice,
  fetchLoginInfo,
  fetchGroupMemberInfo,
  fetchSetGroupRemark,
  fetchSetGroupMemberRemark,
  setGroupNameCache,
  setGroupUserNameCache,
  fetchSendFileStream,
  apiBaseUrl,
  wsUri,
  getGroupLogo,
  getUserLogo,
  fetchStrangerInfo,
  fetchSetLongNick,
  fetchSyncMessages,
  fetchRemainGroupAtAll,
  getGroupNoticePicUrl,
  fetchAPIVersionInfo,
}