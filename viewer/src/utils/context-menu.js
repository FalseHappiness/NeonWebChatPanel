import ContextMenu from '@imengyu/vue3-context-menu';
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css';
import "../styles/content-menu.css"
import { h } from "vue";

let last_open_time = 0
const detect_fn_name = 'custom-context-menu-should-show-detect'
const trigger_fn_name = 'custom-context-menu-trigger'
const has_menu_data_name = "has-custom-context-menu"
const no_menu_data_name = "no-custom-context-menu"
const has_menu_data_prop = "hasCustomContextMenu"
const no_menu_data_prop = "noCustomContextMenu"

function detect(element, event) {
  const detect = element[detect_fn_name]
  return !(detect && !detect(event));
}

function trigger(element, event) {
  return element?.[trigger_fn_name](event)
}

function setContextMenu(element, trigger, detect) {
  enableContextMenu(element)
  if (trigger) {
    element[trigger_fn_name] = trigger
  }
  if (detect) {
    element[detect_fn_name] = detect
  }
}

function removeContextMenu(element) {
  clearContextMenu(element)
  delete element[trigger_fn_name]
  delete element[trigger_fn_name]
}

function clearContextMenu(element) {
  delete element.dataset[no_menu_data_prop]
  delete element.dataset[has_menu_data_prop]
}

function disableContextMenu(element) {
  element.dataset[no_menu_data_prop] = ''
  delete element.dataset[has_menu_data_prop]
}

function enableContextMenu(element) {
  delete element.dataset[no_menu_data_prop]
  element.dataset[has_menu_data_prop] = ''
}

/**
 * 安装指令处理函数
 * @param {HTMLElement} el 目标元素
 * @param {Object} binding 指令绑定对象
 * @param {VNode} vnode Vue虚拟节点
 */
function installHandler(el, binding, vnode) {
  const { value } = binding;

  // 支持多种参数形式
  if (typeof value === 'function') {
    // 简单形式：只提供触发函数
    setContextMenu(el, value);
  } else if (value && (value.trigger || value.detect)) {
    // 对象形式：提供 trigger 和 detect
    setContextMenu(el, value.trigger, value.detect);
  } else if (value && Array.isArray(value.items)) {
    // 兼容旧版：直接提供菜单项数组
    setContextMenu(el, () => value.items);
  }
}

/**
 * 卸载指令处理函数
 * @param {HTMLElement} el 目标元素
 */
function uninstallHandler(el) {
  removeContextMenu(el);
}

const CustomContextMenu = {
  // Vue 2 钩子
  bind(el, binding, vnode) {
    installHandler(el, binding, vnode);
  },
  unbind(el) {
    uninstallHandler(el);
  },

  // Vue 3 钩子
  mounted(el, binding, vnode) {
    installHandler(el, binding, vnode);
  },
  unmounted(el) {
    uninstallHandler(el);
  }
}

function contextDividedItem() {
  return {
    divided: 'self'
  }
}

function basicContextItem(text, onclick, icon_src, condition = true, divided = false) {
  if (!condition) {
    return undefined
  }
  const item = {
    divided: divided,
  }
  const map = {
    label: text,
    onClick: onclick
  }
  for (const key in map) {
    const value = map[key]
    if (value) {
      item[key] = value
    }
  }
  if (icon_src) {
    item.icon = h('img', {
      src: icon_src,
      style: {
        width: '15px',
        height: '15px',
      }
    })
  }
  return item
}

function formatBasicContextItems(items) {
  items = items.filter(item => item !== undefined)
  for (const index in items) {
    if (parseInt(index) === items.length - 1) {
      delete items[index].divided
    }
  }
  items = items.filter(item => Object.keys(item)?.length)
  return items
}

function getPosition(e) {
  // 获取鼠标位置
  const mouseX = e.x;
  let mouseY = e.y;

  // 获取页面尺寸
  const pageWidth = window.innerWidth;
  const pageHeight = window.innerHeight;

  // 计算鼠标与页面边缘的距离
  const left = mouseX;
  const right = pageWidth - mouseX;
  const top = mouseY;
  const bottom = pageHeight - mouseY;
  // 基于鼠标位置和页面尺寸选择合适的方向
  let direction = '';
  // 判断垂直方向（上下）
  if (top > bottom) {
    // 顶部空间更大，选择菜单在顶部显示
    direction += 't';
    // mouseY += 20;//修正偏移
  } else {
    // 底部空间更大，选择菜单在底部显示
    direction += 'b';
  }
  // 判断水平方向（左右）
  if (left > right) {
    // 左边空间更大，选择菜单在左边显示
    direction += 'l';
  } else {
    // 右边空间更大，选择菜单在右边显示
    direction += 'r';
  }
  return {
    x: mouseX,
    y: mouseY,
    direction: direction
  }
}

function processEvent(e) {
  const target = e.target
  const triggerElement = target.closest(`[data-${has_menu_data_name}]`)
  if (triggerElement && !target.closest(`[data-${no_menu_data_name}]`)) {
    if (detect(triggerElement, e)) {
      if ((Date.now() - last_open_time) < 300) {
        return
      }
      const items = trigger(triggerElement, e)
      if (items) {
        const position = getPosition(e);
        // 显示我们的菜单
        ContextMenu.showContextMenu({
          theme: 'mac',
          x: position.x,
          y: position.y,
          items: items,
          // 自动处理
          // direction: position.direction // tl t tr l r bl b br
        });
      }
      e.preventDefault();
      e.stopPropagation();
      last_open_time = Date.now()
      return false;
    }
  }
}

function initContextMenu() {
  document.addEventListener("contextmenu", processEvent);
}

function destroyContextMenu() {
  document.removeEventListener("contextmenu", processEvent);
}

export {
  initContextMenu,
  destroyContextMenu,
  setContextMenu,
  removeContextMenu,
  clearContextMenu,
  enableContextMenu,
  disableContextMenu,
  basicContextItem,
  CustomContextMenu as vCustomMenu,
  contextDividedItem,
  formatBasicContextItems
}