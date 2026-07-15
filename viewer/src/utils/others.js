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

const formatRelativeTime = (timeStr, alwaysHm = false) => {
  return formatTimeOptions({
    timestamp: new Date(timeStr).getTime() / 1000,
    showHm: alwaysHm,
    relative: true,
    showSecond: false,
    alwaysYear: false
  })
};

// (function() {
//   const baseMs = Date.now();
//   const oneDayMs = 86400 * 1000;
//
//   for (let i = 1; i <= 7; i++) {
//     const ts = baseMs - i * oneDayMs;
//     console.log(`${ts} | ${formatRelativeTime(ts)}`);
//   }
// })();

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

/**
 * 格式化秒级时间戳，支持绝对时间与相对时间两种模式。
 *
 * @param {Object} options - 选项对象
 * @param {number | string} options.timestamp - 秒级时间戳
 * @param {string} [options.delimiter1='-'] - 日期内部连接符（如年、月、日之间），相对模式下用于月/日、年/月/日
 * @param {string} [options.delimiter2=' '] - 日期与时间之间的连接符，相对模式下用于“昨天”/星期/日期与时间之间
 * @param {string} [options.delimiter3=':'] - 时间内部连接符（时、分、秒之间）
 * @param {boolean} [options.showHm=true] - 是否显示时分。相对模式下：
 *   - 今天、昨天始终显示时间；
 *   - 2~6天前、今年其他、跨年时，由该参数控制是否附加时间。
 * @param {boolean} [options.showSecond=true] - 是否显示秒，影响时间格式（HH:mm 或 HH:mm:ss）
 * @param {boolean} [options.alwaysMD=true] - 【仅绝对模式】是否始终显示月日，为 `false` 时今天不显示月日。**相对模式下忽略此参数**
 * @param {boolean} [options.alwaysYear=false] - 是否始终显示年份。相对模式下：
 *   - 今天、昨天、2~6天前：不涉及年份；
 *   - 今年其他时间（≥7天前或未来）：若为 `true` 则显示“年/月/日”，否则仅“月/日”；
 *   - 跨年：始终显示年份，忽略此参数。
 * @param {boolean} [options.relative=false] - 是否启用相对时间模式。
 *   - `false`：绝对时间模式，按配置拼接年/月/日 时:分:秒；
 *   - `true`：相对时间模式，返回友好文本，规则如下：
 *       今天 → 只显示时间（如 `12:30` 或 `12:30:45`）
 *       昨天 → `昨天` + 分隔符 + 时间
 *       2~6 天前 → 星期几（如 `星期三`），若 `showHm=true` 则附加时间
 *       今年其他时间（≥7天前/未来）→ `月/日`（或 `年/月/日`），受 `showHm` 和 `alwaysYear` 控制
 *       跨年 → `年/月/日`，受 `showHm` 控制
 *     日期内部分隔符由 `delimiter1` 控制，日期与时间之间由 `delimiter2` 控制。
 *
 * @returns {string|undefined} 格式化后的时间字符串；若时间戳无效则返回 `undefined`
 *
 * @example
 * // 绝对模式（默认）
 * formatTimeOptions({ timestamp: 1718409600 });                         // "06-15 12:00:00"
 * formatTimeOptions({ timestamp: 1718409600, alwaysYear: true });       // "2024-06-15 12:00:00"
 * formatTimeOptions({ timestamp: 1718409600, showSecond: false });      // "06-15 12:00"
 *
 * // 相对模式
 * // 假设今天是 2026-07-15，当前时间任意
 * formatTimeOptions({ timestamp: 当前今天时间戳, relative: true });            // "12:00:00" (例)
 * formatTimeOptions({ timestamp: 昨天时间戳, relative: true });               // "昨天 12:00:00"
 * formatTimeOptions({ timestamp: 2~6天前时间戳, relative: true });            // "星期日 12:00" 或 "星期日"
 * formatTimeOptions({ timestamp: 今年 ≥7天前时间戳, relative: true });        // "07/08 12:00"
 * formatTimeOptions({ timestamp: 今年 ≥7天前时间戳, relative: true, alwaysYear: true, delimiter1: '-' }); // "2026-07-08 12:00"
 * formatTimeOptions({ timestamp: 跨年时间戳, relative: true });              // "2025/12/25 12:00"
 */
const formatTimeOptions = ({
                             timestamp,
                             delimiter1 = '-',
                             delimiter2 = ' ',
                             delimiter3 = ':',
                             showHm = true,
                             showSecond = true,
                             alwaysMD = true,        // 相对模式下忽略
                             alwaysYear = false,
                             relative = false,
                           }) => {
  timestamp = Number.parseInt(timestamp);
  if (!Number.isInteger(timestamp)) return;

  const date = new Date(timestamp * 1000);
  if (isNaN(date.getTime())) return;

  // ---------- 相对时间模式 ----------
  if (relative) {
    const now = new Date();

    const inputYear = date.getFullYear();
    const inputMonth = date.getMonth();
    const inputDay = date.getDate();
    const inputWeekday = date.getDay();

    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    const nowDay = now.getDate();

    // 时间部分
    const HH = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');
    const ss = date.getSeconds().toString().padStart(2, '0');
    const timeStr = HH + delimiter3 + mm + (showSecond ? delimiter3 + ss : '');

    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

    const utcToday = Date.UTC(nowYear, nowMonth, nowDay);
    const utcInput = Date.UTC(inputYear, inputMonth, inputDay);
    const diffDays = (utcToday - utcInput) / 86400000;

    let datePart = '';

    if (diffDays === 0) {
      // 今天：仅时间
      return timeStr;
    } else if (diffDays === 1) {
      // 昨天
      datePart = '昨天';
    } else if (diffDays >= 2 && diffDays <= 6) {
      // 2~6 天前
      datePart = weekdays[inputWeekday];
    } else {
      const month = (inputMonth + 1).toString().padStart(2, '0');
      const day = inputDay.toString().padStart(2, '0');
      const year = inputYear.toString();

      if (inputYear === nowYear) {
        // 今年其他时间
        if (alwaysYear) {
          datePart = year + delimiter1 + month + delimiter1 + day;
        } else {
          datePart = month + delimiter1 + day;
        }
      } else {
        // 跨年
        datePart = year + delimiter1 + month + delimiter1 + day;
      }
    }

    // 昨天和星期几总是显示时间；其他情况由 showHm 控制
    const needTime = (diffDays <= 1) ? true : showHm;

    if (needTime) {
      return datePart + delimiter2 + timeStr;
    }
    return datePart;
  }

  // ---------- 绝对时间模式 ----------
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const showYear = alwaysYear || date.getFullYear() !== now.getFullYear();
  let showMD = alwaysMD;
  if (!alwaysMD) {
    showMD = !isToday;
  }

  const year = showYear ? `${date.getFullYear()}${delimiter1}` : '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  let dateStr = '';
  if (showMD) {
    dateStr = `${year}${month}${delimiter1}${day}${delimiter2}`;
  }

  let timeStr = '';
  if (showHm) {
    timeStr = `${hours}${delimiter3}${minutes}`;
    if (showSecond) {
      timeStr += `${delimiter3}${seconds}`;
    }
  }

  return `${dateStr}${timeStr}`;
};

export {
  hasMouseSupport,
  formatRelativeTime,
  sortGroupUsers,
  parseJSON,
  stringifyJSON,
  formatTimeOptions
}