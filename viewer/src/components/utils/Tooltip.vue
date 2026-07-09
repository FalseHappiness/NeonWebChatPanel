<template>
  <!-- 传送以防影响固定定位 -->
  <teleport to="#tooltip-teleport-target-container">
    <div
      class="tooltip-container"
      v-if="show || alwaysExists"
      ref="popover"
      @mouseenter="handleMouseenter"
      @mouseleave="handleMouseleave"
      :style="{ 'z-index': zIndex, display: alwaysExists ? (show ? 'block' : 'none') : 'block' }"
    >
      <slot name="content">
        <div class="tooltip-style tooltip-content" v-if="content">
          <div v-html="content"></div>
        </div>
      </slot>
    </div>
  </teleport>
  <div v-if="useTargetSlot" ref="target">
    <slot name="target"></slot>
  </div>
</template>

<script>
export default {
  name: 'Tooltip',
  props: {
    target: {
      // 支持传入选择器字符串或DOM元素
      type: [String, HTMLElement],
      default: null
    },
    trigger: {
      type: String,
      default: 'hover',
      validator: value => ['hover', 'focus', 'toggle', 'click'].includes(value)
    },
    content: {
      type: String,
      default: ""
    },
    placement: {
      type: String,
      default: 'top',
      validator: value => ['top', 'left', 'right', 'bottom','tr'].includes(value)
    },
    width: {
      type: Number,
      default: 200
    },
    hoverEnterDelay: {
      type: Number,
      default: 100
    },
    hoverLeaveDelay: {
      type: Number,
      default: 0
    },
    distanceFromTarget: {
      type: Number,
      default: 4
    },
    canHoverInteract: {
      type: Boolean,
      default: false
    },
    closeOnClickOutside: {
      type: Boolean,
      default: true
    },
    minLeft: {
      type: [Number, String],
      default: 5
    },
    maxLeft: {
      type: [Number, String],
      default: "max - 5px"
    },
    minTop: {
      type: [Number, String],
      default: 5
    },
    maxTop: {
      type: [Number, String],
      default: "max - 5px"
    },
    zIndex: {
      type: [Number, String],
      default: 1000
    },
    alwaysExists: {
      type: Boolean,
      default: false
    },
    useTargetSlot: {
      type: Boolean,
      default: false
    },
    ignoreTargetParent: {
      type: Boolean,
      default: true,
    },
    tipPosition: {
      type: Object,
      default: undefined
    }
  },
  data() {
    return {
      position: { top: 0, left: 0 },
      show: false,
      showFlag: false,
      listeners: [], // 存储事件监听器
      resizeObserver: null,
      // mutationObserver: null,
      scrollableParents: [],
      targetElement: null,
    }
  },
  watch: {
    show(val) {
      if (val) {
        this.$nextTick(() => {
          this.updatePosition();
          this.initObserver();
        })
      } else {
        this.$nextTick(() => {
          this.removeObserver();
        })
      }
    },
    tipPosition: {
      handler() {
        this.updatePosition()
      },
      deep: true, // 深度监听，适用于对象内部属性变化
    }
  },
  computed: {
    hoverTrigger() {
      return this.trigger === 'hover';
    },
    focusTrigger() {
      return this.trigger === 'focus';
    },
    toggleTrigger() {
      return ['toggle', 'click'].includes(this.trigger);
    },
  },
  methods: {
    toggle() {
      this.show = !this.show;
    },
    updatePosition() {
      if (!this.show) return;

      const popover = this.$refs.popover;
      const targetEl = this.getTargetElement();

      if ((!targetEl && !this.tipPosition) || !popover) return;

      let targetRect = targetEl?.getBoundingClientRect();
      const popoverWidth = popover.offsetWidth;
      const popoverHeight = popover.offsetHeight;

      // 获取窗口尺寸
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      if (this.tipPosition) {
        targetRect = {
          left: this.tipPosition.x,
          right: windowWidth - this.tipPosition.x,
          top: this.tipPosition.y,
          height: 0,
          width: 0
        }
      }

      // 计算max值
      const maxLeftValue = windowWidth - popoverWidth;
      const maxTopValue = windowHeight - popoverHeight;

      switch (this.placement) {
        case 'top':
          this.position.left = targetRect.left + targetRect.width / 2 - popoverWidth / 2;
          this.position.top = targetRect.top - popoverHeight - this.distanceFromTarget;
          break;
        case 'left':
          this.position.left = targetRect.left - popoverWidth - this.distanceFromTarget;
          this.position.top = targetRect.top + targetRect.height / 2 - popoverHeight / 2;
          break;
        case 'right':
          this.position.left = targetRect.right + this.distanceFromTarget;
          this.position.top = targetRect.top + targetRect.height / 2 - popoverHeight / 2;
          break;
        case 'bottom':
          this.position.left = targetRect.left + targetRect.width / 2 - popoverWidth / 2;
          this.position.top = targetRect.bottom + this.distanceFromTarget;
          break;
        case 'tr':
          this.position.left = targetRect.left + this.distanceFromTarget;
          this.position.top = targetRect.top - popoverHeight - this.distanceFromTarget;
          break;
      }

      // 解析限制值的函数
      const parseLimitValue = (value, type) => {
        if (value === null || value === undefined) return null;

        // 如果是数字，直接返回
        if (typeof value === 'number') return value;

        // 如果是字符串
        if (typeof value === 'string') {
          value = value
            // 正则表达式匹配所有var(--xxx)格式的CSS变量
            .replace(/var\((--[a-zA-Z0-9_-]+)\)/g, (match, variableName) => {
              const computedValue = window
                .getComputedStyle(this.$refs.popover)
                .getPropertyValue(variableName)
                .trim();
              return parseLimitValue(computedValue);
            })
            // 处理max
            .replace(/max/g, type === 'left' ? maxLeftValue : maxTopValue)
            // 处理popover尺寸
            .replace(/popoverWidth/g, popoverWidth)
            .replace(/popoverHeight/g, popoverHeight)
            // 处理纯数字+px
            .replaceAll("px", "")
            // 处理百分数
            .replace(/(\d+)%/g, (match, p1) => {
              const percent = parseFloat(p1) / 100;
              return type === 'left' ? (windowWidth * percent) : (windowHeight * percent);
            });

          // 处理计算表达式
          if (value.includes('+') || value.includes('-') || value.includes('*') || value.includes('/') || value.includes('(')) {
            // 计算表达式
            try {
              // 安全评估表达式
              return new Function(`return ${value}`)();
            } catch (e) {
              console.error('Error evaluating limit expression:', e);
              return null;
            }
          }

          return parseFloat(value)
        }

        return null;
      };

      // 解析限制值
      const minLeft = parseLimitValue(this.minLeft, 'left');
      const maxLeft = parseLimitValue(this.maxLeft, 'left');
      const minTop = parseLimitValue(this.minTop, 'top');
      const maxTop = parseLimitValue(this.maxTop, 'top');

      /*
      console.log(
        [this.minLeft, this.maxLeft, this.minTop, this.maxTop],
        [minLeft, maxLeft, minTop, maxTop],
        [this.position.left, this.position.top]
      )
      */

      // 应用限制
      if (minLeft !== null) {
        this.position.left = Math.max(this.position.left, minLeft);
      }
      if (maxLeft !== null) {
        this.position.left = Math.min(this.position.left, maxLeft);
      }
      if (minTop !== null) {
        this.position.top = Math.max(this.position.top, minTop);
      }
      if (maxTop !== null) {
        this.position.top = Math.min(this.position.top, maxTop);
      }

      popover.style.top = `${this.position.top}px`;
      popover.style.left = `${this.position.left}px`;
    },
    getTargetElement() {
      if (this.useTargetSlot) {
        if (this.ignoreTargetParent) {
          return this.targetElement
        }
        return this.$refs.target
      }
      if (typeof this.target === 'string') {
        return document.querySelector(this.target);
      }
      return this.target;
    },
    addListener(target, event, handler, options) {
      target.addEventListener(event, handler, options);
      this.listeners.push({ target, event, handler });
    },
    clearListeners() {
      this.listeners.forEach(({ target, event, handler }) => {
        target.removeEventListener(event, handler);
      });
      this.listeners = [];
    },
    clearListener(target, event, handler) {
      this.listeners = this.listeners.filter(({ t, e, h }) => {
        const matches =
          (target === undefined || target === t) &&
          (event === undefined || event === e) &&
          (handler === undefined || handler === h);

        if (matches) {
          t.removeEventListener(e, h);
        }

        return !matches;
      });
    },
    handleMouseenter(e) {
      if (this.hoverTrigger && (e.target !== this.$refs.popover || this.canHoverInteract)) {
        this.showFlag = true;
        setTimeout(() => this.showFlag && (this.show = true), this.hoverEnterDelay);
      }
    },
    handleMouseleave(e) {
      if (this.hoverTrigger && (e.target !== this.$refs.popover || this.canHoverInteract)) {
        this.showFlag = false;
        setTimeout(() => !this.showFlag && (this.show = false), this.hoverLeaveDelay);
      }
    },
    initObserver() {
      if (!this.show) return;

      const popover = this.$refs.popover;
      const targetEl = this.getTargetElement();

      if ((!targetEl && !this.tipPosition) || !popover) return;

      this.removeObserver(); // 先断开之前的监听

      this.resizeObserver = new ResizeObserver(() => {
        this.updatePosition(); // 重新计算位置
      });

      // 监听 target 和 popover 的尺寸变化
      this.resizeObserver.observe(popover);
      if (targetEl) {
        this.resizeObserver.observe(targetEl);
        this.getAllParents(targetEl).forEach(el => {
          this.resizeObserver.observe(el);
        });
      }

      /*
      this.mutationObserver = new MutationObserver(() => {
        this.updatePosition(); // 重新计算位置
      });

      const mutationConfig = {
        attributes: true, // 监听属性变化（如 style、class）
        childList: true,  // 监听子元素变化
        subtree: true,    // 监听所有后代
        characterData: true
      }

      // 监听 target 的父级或祖先元素的变化
      this.mutationObserver.observe(targetEl, mutationConfig);
      this.mutationObserver.observe(popover, mutationConfig);
       */

      if (targetEl) {
        this.scrollableParents = this.getScrollableAncestors(targetEl);
        this.scrollableParents.forEach((el) => {
          this.addListener(el, "scroll", this.updatePosition, { passive: true })
        });
      }

      // this.addListener(window, "resize", this.updatePosition)
    },
    removeObserver() {
      if (this.resizeObserver) this.resizeObserver.disconnect();
      // if (this.mutationObserver) this.mutationObserver.disconnect();
      this.scrollableParents.forEach((el) => {
        this.clearListener(el, "scroll", this.updatePosition)
      });
      // this.clearListener(window, "resize", this.updatePosition)
    },
    // 获取所有可滚动的祖先元素
    getScrollableAncestors(el) {
      const parents = [];
      while (el.parentElement) {
        el = el.parentElement;
        const style = window.getComputedStyle(el);
        if (style.overflow === 'auto' || style.overflow === 'scroll' || el.scrollHeight > el.clientHeight) {
          parents.push(el);
        }
      }
      return parents;
    },
    getAllParents(element) {
      const parents = [];
      let current = element.parentElement;

      while (current) {
        parents.push(current);
        current = current.parentElement;
      }

      return parents;
    },
  },
  beforeCreate() {
    if (!document.getElementById("tooltip-teleport-target-container")) {
      const container = document.createElement("div")
      container.id = "tooltip-teleport-target-container"
      document.body.append(container)
    }
  },
  mounted() {
    if (this.useTargetSlot && this.ignoreTargetParent) {
      const parent = this.$refs.target
      const newTarget = parent.firstElementChild
      parent.replaceWith(newTarget)
      this.targetElement = newTarget
    }

    const targetEl = this.getTargetElement();
    if (!targetEl) {
      if (this.tipPosition) {
        this.show = true
        return
      }
      console.error('Tooltip: 无法找到目标元素');
      return;
    }

    // 根据trigger类型添加事件监听
    if (this.hoverTrigger) {
      this.addListener(targetEl, 'mouseenter', this.handleMouseenter);
      this.addListener(targetEl, 'mouseleave', this.handleMouseleave);
    } else if (this.focusTrigger) {
      this.addListener(targetEl, 'focus', () => this.show = true);
      this.addListener(targetEl, 'blur', () => this.show = false);
    } else if (this.toggleTrigger) {
      this.addListener(targetEl, 'click', this.toggle);
      if (this.closeOnClickOutside) {
        this.addListener(document, "click", e => {
          if (
            this.show &&
            !this.$refs?.popover?.contains(e.target) &&
            e.target !== targetEl &&
            !targetEl.contains(e.target)
          ) {
            this.show = false
          }
        })
      }
    }
  },
  beforeDestroy() {
    this.clearListeners();
    this.removeObserver();
  }
}
</script>

<style scoped>
.tooltip-container {
  position: fixed;
  visibility: visible;
  z-index: 1000;
  pointer-events: auto;
  opacity: 1;
  display: block;
  margin: 0;
  padding: 0;
}

.tooltip-container:deep(.tooltip-style) {
  border: 1px solid #d5d5d5;
  background: rgb(255 255 255 / 95%);
  line-height: 14px;
  font-size: 13px;
  border-radius: 4px;
  box-shadow: 0 5px 10px 0 rgb(48 48 48 / 21%);
  backdrop-filter: blur(10px);
  padding: 6px;
  overflow: hidden;
}

.tooltip-content {
  text-align: center;
}
</style>