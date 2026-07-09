// double-click-directive.js

const DoubleClick = {
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
};

function installHandler(el, binding, vnode) {
  let clicks = 0;
  let timer = null;
  const delay = binding.value?.delay || 300;

  const handleClick = (originalEvent) => {
    clicks++;

    if (clicks === 1) {
      timer = setTimeout(() => {
        // 触发单击回调
        if (binding.value?.singleClick) {
          binding.value.singleClick(originalEvent);
        } else if (typeof binding.value === 'function') {
          // 向后兼容：如果只传了一个函数，默认是双击回调
        }
        clicks = 0;
      }, delay);
    } else {
      // 双击
      clearTimeout(timer);
      if (typeof binding.value === 'function') {
        binding.value(originalEvent);
      } else if (binding.value?.doubleClick) {
        binding.value.doubleClick(originalEvent);
      }
      clicks = 0;
    }
  };

  el._clickHandler = handleClick;
  el.addEventListener('click', handleClick);
}

function uninstallHandler(el) {
  if (el._clickHandler) {
    el.removeEventListener('click', el._clickHandler);
    delete el._clickHandler;
  }
}

export {
  DoubleClick as vDoubleClick
};