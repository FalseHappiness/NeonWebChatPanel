import { isMobile, isSafari } from '@tenrok/vue3-device-detect'
import { pinyin } from 'pinyin-pro';

const hasMouseSupport = () => {
  const support_list = []
  if (window.matchMedia) {
    support_list.push(window.matchMedia('(pointer: fine)').matches)
    support_list.push(window.matchMedia('(hover: hover)').matches)
    support_list.push(window.matchMedia('(any-hover: hover)').matches)
  }
  if (typeof navigator.maxTouchPoints === 'number') {
    support_list.push(navigator.maxTouchPoints === 0)
  }
  if (typeof navigator.msMaxTouchPoints === 'number') {
    support_list.push(navigator.msMaxTouchPoints === 0)
  }
  if (!isSafari) {
    support_list.push(window.orientation === undefined)
  }
  support_list.push(!('ontouchstart' in window))
  support_list.push(!isMobile)
  return support_list.filter(Boolean).length > support_list.length / 2
}

const formatRelativeTime = (timeStr, alwaysHm) => {
  if (!timeStr) return '';

  const inputDate = new Date(timeStr);
  const now = new Date();

  // 检查是否是有效日期
  if (isNaN(inputDate.getTime())) return '';

  // 获取各时间部分
  const inputYear = inputDate.getFullYear();
  const inputMonth = inputDate.getMonth();
  const inputDay = inputDate.getDate();
  const inputWeekday = inputDate.getDay();

  const nowYear = now.getFullYear();

  // 计算本周开始时间（周日为第一天）
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  // 计算昨天开始时间
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(now.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  // 计算今天开始时间
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const HH_mm = inputDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const MM_DD = `${(inputMonth + 1).toString().padStart(2, '0')}/${inputDay.toString().padStart(2, '0')}`

  alwaysHm = alwaysHm ? ` ${HH_mm}` : ''

  // 判断时间范围
  if (inputDate >= todayStart) {
    // 今天：返回时间 HH:mm
    return HH_mm;
  } else if (inputDate >= yesterdayStart) {
    // 昨天：返回"昨天 HH:MM"
    return `昨天 ${HH_mm}`;
  } else if (inputDate >= weekStart) {
    // 本周：返回星期几
    return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][inputWeekday] + alwaysHm;
  } else if (inputYear === nowYear) {
    // 今年：返回 MM/DD
    return MM_DD + alwaysHm;
  } else {
    // 其他：返回 YYYY/MM/DD
    return `${inputYear.toString()}/${MM_DD}${alwaysHm}`;
  }
};

/*群成员排序*/
// 角色权重
const ROLE_WEIGHT = {
  owner: 0,
  admin: 1,
  member: 2
};

// 获取字符的排序键
function getCharSortKey(char) {
  if (!char) return { type: 5, key: '' }; // 其它

  // 中文
  if (/[\u4e00-\u9fa5]/.test(char)) {
    return {
      type: 0, // 中文类型
      key: pinyin(char, { toneType: 'none', type: 'array' })[0].slice(0, 1) // 拼音
    };
  }

  // 英文字母
  if (/[a-zA-Z]/.test(char)) {
    return {
      type: 1, // 字母类型
      key: char.toLowerCase(), // 统一转为小写比较
      caseOrder: char === char.toUpperCase() ? 0 : 1 // 大写优先
    };
  }

  // 中文标点符号
  if (/[\u3000-\u303F\uff00-\uffef]/.test(char)) {
    return {
      type: 2, // 中文标点符号类型
      key: char
    };
  }

  // 英文标点符号（新增）
  if (/[!-/:-@[-`{-~]/.test(char)) {
    return {
      type: 3, // 英文标点符号类型（排在中文标点之后）
      key: char
    };
  }

  // 数字
  if (/[0-9]/.test(char)) {
    return {
      type: 4, // 数字类型
      key: char
    };
  }

  // 其他特殊字符
  return {
    type: 5, // 其他类型
    key: char
  };
}

// 比较两个字符串的优先级
function compareStrings(a, b) {
  const aStr = a || '';
  const bStr = b || '';

  for (let i = 0; i < Math.max(aStr.length, bStr.length); i++) {
    const aChar = aStr[i];
    const bChar = bStr[i];

    // 如果一个字符串已经结束
    if (aChar === undefined) return -1;
    if (bChar === undefined) return 1;

    // 如果字符相同则继续比较下一个
    if (aChar === bChar) continue;

    const aKey = getCharSortKey(aChar);
    const bKey = getCharSortKey(bChar);

    const c_a = aKey.type === 0 && bKey.type === 1
    const a_c = aKey.type === 1 && bKey.type === 0

    // 不同类型按类型排序
    if (aKey.type !== bKey.type && !c_a && !a_c) {
      return aKey.type - bKey.type;
    }

    // 中英文
    if (c_a || a_c) {
      // 先比较字母顺序
      const cmp = aKey.key.localeCompare(bKey.key);
      if (cmp !== 0) return cmp;

      if (c_a) {
        return -1
      }
      if (a_c) {
        return 1
      }

      // 字母相同则大写优先
      if (aKey.caseOrder !== bKey.caseOrder) {
        return aKey.caseOrder - bKey.caseOrder;
      }
    } else { // 数字或其他
      const cmp = aKey.key.localeCompare(bKey.key);
      if (cmp !== 0) return cmp;
    }
  }

  return 0;
}

// 主排序函数
function sortGroupUsers(users) {
  return [...users].sort((a, b) => {
    // 首先按角色排序
    const roleDiff = ROLE_WEIGHT[a.role] - ROLE_WEIGHT[b.role];
    if (roleDiff !== 0) return roleDiff;

    // 角色相同则按名称排序
    return compareStrings(a.name, b.name);
  });
}

function isString(str) {
  return typeof str === 'string'
}

function parseJSON(json) {
  return isString(json) ? JSON.parse(json) : json
}

function stringifyJSON(json) {
  return isString(json) ? json : JSON.stringify(json)
}

export {
  hasMouseSupport,
  formatRelativeTime,
  sortGroupUsers,
  parseJSON,
  stringifyJSON
}