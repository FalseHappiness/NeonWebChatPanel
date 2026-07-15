import { defineStore } from 'pinia';
import { reactive } from 'vue';
import { otherFacesDescribes, secretEmojiids } from "../utils/faces-config.js";

function getAllEmojiids(list) {
  // 创建一个 Set 来避免重复的 xxx1
  const result = new Set();

  list.forEach(item => {
    const match = item.match(/^\/QQ\/EmojiSystermResource\/([^\/]+)\/([^\/]+)\//);
    if (match) {
      result.add(match[1]);
    }
  });

  // 将 Set 转换为数组并返回
  return Array.from(result);
}

function filterSuperEmojiResources(list) {
  // 创建一个 Set 来避免重复的 xxx1
  const result = new Set();

  list.forEach(item => {
    // 检查是否以指定模式开头
    const match = item.match(/^\/QQ\/EmojiSystermResource\/([^\/]+)\/([^\/]+)\//);

    if (match && match[2].toLowerCase() === 'lottie') {
      result.add(match[1]); // 添加 xxx1 到结果中
    }
  });

  // 将 Set 转换为数组并返回
  return Array.from(result);
}

function getEmojiDescribesFromDefaultConfig(obj) {
  const result = {};

  const processGroup = (group) => {
    group.SysEmojiList.forEach(emoji => {
      let describe = emoji.describe;
      if (describe.startsWith('/')) {
        describe = describe.substring(1);
      }
      result[emoji.emojiId] = describe;
    });
  };

  obj.normalPanelResult.SysEmojiGroupList.forEach(processGroup);
  obj.redHeartPanelResult.SysEmojiGroupList.forEach(processGroup);

  return result;
}

function getEmojiDescribesFromFaceConfig(obj) {
  const result = {};

  const processGroup = (group) => {
    group.forEach(emoji => {
      let describe = emoji.QDes;
      if (describe.startsWith('/')) {
        describe = describe.substring(1);
      }
      result[emoji.QSid] = describe;
    });
  };

  processGroup(obj.sysface)
  processGroup(obj.emoji)

  return result;
}

function getEmojiDescribes(default_config, face_config) {
  return {
    ...getEmojiDescribesFromDefaultConfig(default_config),
    ...getEmojiDescribesFromFaceConfig(face_config),
    ...otherFacesDescribes
  }
}

/**
 * 将数组中的数字/字符串整数从小到大排序，其他元素按码位排序放到最后
 * @param {Array} arr - 待排序的数组
 * @return {Array} 排序后的数组
 */
function sortNumbersAndOthers(arr) {
  // 分割数组：数字/字符串整数 vs 其他类型
  const numbers = [];
  const others = [];

  arr.forEach(item => {
    // 检查是否是数字或字符串形式的整数
    if (typeof item === 'number' && Number.isInteger(item)) {
      numbers.push(item);
    } else if (typeof item === 'string' && /^-?\d+$/.test(item)) {
      numbers.push(parseInt(item, 10));
    } else {
      others.push(item);
    }
  });

  // 对数字部分从小到大排序
  numbers.sort((a, b) => a - b);

  // 对其他部分按 Unicode 码位排序
  others.sort((a, b) => {
    const strA = String(a);
    const strB = String(b);
    return strA.localeCompare(strB);
  });

  // 合并结果：数字在前，其他在后
  return [...numbers, ...others];
}


export const useGlobalStore = defineStore(
  'global',
  () => {
    const emoji_json = import.meta.glob('/src/assets/EmojiSystermResource/*.json', { eager: true });

    const emojiFiles = emoji_json['/src/assets/EmojiSystermResource/emoji_files.json'].default;

    const allEmojiids = sortNumbersAndOthers(
      getAllEmojiids(emojiFiles)
    );

    const superEmojiids = sortNumbersAndOthers(
      filterSuperEmojiResources(emojiFiles)
    );

    const emojiEmojiids = sortNumbersAndOthers(
      allEmojiids.filter(item => typeof item === 'string' && !/^\d+$/.test(item) && !superEmojiids.includes(item))
    );

    const normalEmojiids = sortNumbersAndOthers(
      allEmojiids.filter(item => !superEmojiids.includes(item) && !emojiEmojiids.includes(item))
    );

    const emojiDescribes = getEmojiDescribes(
      emoji_json['/src/assets/EmojiSystermResource/default_config.json'].default,
      emoji_json['/src/assets/EmojiSystermResource/face_config.json'].default
    )

    const nameCaches = reactive({});

    const apiVersionInfo = {
      app_name: "NapCat.Onebot"
    }

    return {
      normalEmojiids,
      superEmojiids,
      emojiEmojiids,
      secretEmojiids,
      emojiFiles,
      emojiDescribes,
      allEmojiids,
      nameCaches,
      apiVersionInfo,
      isSnowLuma: () => {
        return apiVersionInfo.app_name.includes("SnowLuma")
      }
    };
  },
  // {
  //   persist: {
  //     storage: localStorage,
  //     pick: ['nameCaches'],
  //   }
  // }
);