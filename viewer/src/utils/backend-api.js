// 获取显示名称的函数
import axios from "axios";
import { ref, toRaw } from "vue";
import { useGlobalStore } from "../store/global.js";
import { showToast } from "./toast.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

const fetchAPI = async (endpoint, params = {}, method = 'POST', data = null) => {
  try {
    const config = {
      method: method.toLowerCase(), // 确保方法小写
      url: `${apiBaseUrl}/api/${endpoint}`,
      params: method.toUpperCase() === 'GET' ? params : (data === null ? {} : params),
      data: method.toUpperCase() === 'POST' ? data || params : {} // POST请求使用data
    };

    const response = await axios(config);
    return response.data;
  } catch (e) {
    showToast("error", `${method} API ${endpoint} error`);
    console.error(`${method} API ${endpoint} error: `, e);
    throw new Error(`${method} API ${endpoint} error`);
  }
};

const fetchDataInfo = async (endpoint, params) => {
  const response = await fetchAPI(endpoint, params)
  if (response.code === 200) {
    return response.data;
  }
  // showToast("error", `Request ${endpoint} error`)
  throw new Error(`Request ${endpoint} error: ` + JSON.stringify(response))
}

export const fetchGroupInfo = async (group_id) => {
  return await fetchDataInfo('get_group_info', { group_id: group_id })
}

const fetchStrangerInfo = async (user_id) => {
  return await fetchDataInfo("get_stranger_info", { user_id: user_id })
}

const fetchGroupMemberInfo = async (group_id, user_id) => {
  return await fetchDataInfo("get_group_member_info", { group_id: group_id, user_id: user_id })
}

const fetchGroupMemberList = async (group_id) => {
  return await fetchDataInfo("get_group_member_list", { group_id: group_id })
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
    FriendListCache.list = await fetchDataInfo("get_friend_list")
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
  return fetchAPI(
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
}

const fetchMsg = async (msg_id) => {
  return fetchDataInfo('get_msg', { message_id: msg_id })
}

const fetchForwardMessage = async (id) => {
  return (await fetchDataInfo('get_forward_msg', { message_id: id })).messages
}

const fetchSendMessage = async (contact, message) => {
  const data = { message }
  data[contact.type === 'group' ? "group_id" : "user_id"] = contact.contact_id
  return await fetchAPI('send_message', data)
}

const fetchEssenceMessages = async (group_id, only_real_seq) => {
  return fetchDataInfo('get_essence_msg_list', { group_id, only_real_seq })
}

const fetchChangeEssenceMsg = async (message_id, set) => {
  return await fetchAPI(set ? 'set_essence_msg' : 'delete_essence_msg', { message_id })
}

const fetchRecallMessage = async (message_id) => {
  return await fetchAPI('recall_msg', { message_id })
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

const fetchSendFiles = async (contact, files) => {
  const message = [];
  for (const file of files) {
    try {
      const base64 = await fileToBase64(file);
      message.push({
        type: 'file',
        data: {
          file: base64,
          name: file.name
        }
      });
    } catch (error) {
      console.error(`文件 ${file.name} 转换 Base64 失败:`, error);
      showToast('error', `文件 ${file.name} 发送失败:`)
    }
  }
  if (message?.length) {
    await fetchSendMessage(contact, message)
  }
}

const fetchCategoricalFriends = async () => {
  return fetchDataInfo('get_friends_with_category')
}

const fetchGroupList = async () => {
  return fetchDataInfo('get_group_list')
}

const fetchForwardSingleMsg = async (message_id, contact) => {
  return await fetchAPI('forward_single_msg', {
    message_id,
    [contact.type === 'group' ? "group_id" : "user_id"]: contact.contact_id
  })
}

const fetchGroupNotice = async (group_id) => {
  return fetchDataInfo('get_group_notice', { group_id })
}

const fetchLoginInfo = async (group_id) => {
  return fetchDataInfo('get_login_info', { group_id })
}

const fetchSetGroupRemark = async (group_id, remark) => {
  return await fetchAPI('set_group_remark', { group_id, remark })
}

const fetchSetGroupMemberRemark = async (group_id, user_id, card) => {
  return await fetchAPI('set_group_card', { group_id, user_id, card })
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
      ['is_robot', 'level', 'role', 'title'].forEach(prop => {
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
      } else {
        data1 = await fetchUserInfo(user_id)
        try {
          data2 = await fetchGroupMemberInfo(group_id, user_id)
        } catch (e) {

        }
        name = data2?.card || data1?.remark || data2?.nickname || data1.nickname;
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
  try {
    return fetchAPI("contacts")
  } catch (error) {
    throw new Error(error)
  }
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
    file_id = data.data.file_id || data.data.file
  }
  return `${apiBaseUrl}/api/get_stream_file_data?file_id=${encodeURIComponent(file_id)}`
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
  setGroupUserNameCache
}