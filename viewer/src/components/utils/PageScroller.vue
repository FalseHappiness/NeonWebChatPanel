<template>
  <div class="chat-container" :class="containerClass">
    <div class="chat-wrapper" ref="chatWrapper" @scroll="handleScroll" :class="wrapperClass">
      <!-- 消息列表 -->
      <slot name="empty" v-if="initializing || isNoMsg" :initializing="initializing">
        <div style="text-align: center">
          {{ initializing ? '加载中' : '暂无消息' }}
        </div>
      </slot>
      <div
        v-for="(message, index) in visibleMessages"
        :key="getMsgId(message)"
        :ref="'message-' + getMsgId(message)"
        class="message-item"
        :class="typeof itemClass === 'function' ? itemClass(message) : itemClass"
        v-else
      >
        <slot name="message" :message="message" :index="index" :messages="visibleMessages">
          <!-- 默认的消息渲染 -->
          <div class="message-content">
            <div class="message-avatar">{{ getMsgId(message) % 10 }}</div>
            <div class="message-body">
              <div class="message-text">消息 {{ getMsgId(message) }}</div>
              <div class="message-time">{{ formatTime(message.timestamp) }}</div>
            </div>
          </div>
        </slot>
      </div>
    </div>

    <!-- 滚动到底部按钮 -->
    <slot
      name="scroll-to-bottom-btn"
      v-if="!isAtBottom && showScrollToBottom && this.scrollDirection === 'bottom'"
      :scrollToBottom="scrollToBottomButton"
    >
      <button
        class="scroll-to-bottom-btn"
        :style="{ '--text-color': themeColors.toBottomText, '--color': themeColors.toBottomBtn, '--hover-color': themeColors.toBottomBtnHover }"
        @click="scrollToBottomButton"
      >
        滚动到底部
      </button>
    </slot>

    <!-- 加载提示 -->
    <slot
      name="loading-indicator"
      v-if="messageLoading"
      :messageLoadingTop="messageLoadingTop"
      :messageLoadingBottom="messageLoadingBottom"
    >
      <div
        class="loading-indicator"
        :style="{ top: messageLoadingTop, bottom: messageLoadingBottom }"
      >
        <div class="loading-spinner" :style="{ '--color': themeColors.loadingSpinner }"></div>
        <span :style="{ color: themeColors.loadingText }">获取消息中...</span>
      </div>
    </slot>

    <!-- 加载提示 -->
    <slot
      name="no-more-msg-indicator"
      v-if="noMoreMsgTip"
      :noMoreMsgTipTop="noMoreMsgTipTop"
      :noMoreMsgTipBottom="noMoreMsgTipBottom"
    >
      <div
        class="loading-indicator"
        :style="{ top: noMoreMsgTipTop, bottom: noMoreMsgTipBottom }"
      >
        <span :style="{ color: themeColors.loadingText }">没有更多消息了</span>
      </div>
    </slot>
  </div>
</template>

<script>
export default {
  name: 'PageScroller',
  props: {
    // 绑定 class
    containerClass: {
      type: [String, Object, Array],
      default: ''
    },
    wrapperClass: {
      type: [String, Object, Array],
      default: ''
    },
    itemClass: {
      type: [String, Object, Array, Function],
      default: ''
    },
    // 获取更早消息的方法
    getOlderMessages: {
      type: Function,
      required: true
    },
    // 获取更新消息的方法
    getNewerMessages: {
      type: Function,
      required: true
    },
    // 消息ID键名
    idKey: {
      type: String,
      default: "id"
    },
    // 获取消息ID方法
    getIdFunction: {
      type: Function,
      default: null
    },
    // 获取最小消息ID方法
    getMinMsgIdFunction: {
      type: Function,
      default: null
    },
    // 获取最大消息ID方法
    getMaxMsgIdFunction: {
      type: Function,
      default: null
    },
    // 最小消息ID
    minMessageId: {
      type: [Number, String],
      default: 0
    },
    // 最大消息ID
    maxMessageId: {
      type: [Number, String],
      default: 0
    },
    // 检测是否为最新消息
    detectIsLatestMsgFunction: {
      type: Function,
      default: null
    },
    // 检测是否为最旧消息
    detectIsOldestMsgFunction: {
      type: Function,
      default: null
    },
    // 每页显示的消息数量
    pageSize: {
      type: Number,
      default: 15
    },
    // 最大页倍数
    maxPageMultiple: {
      type: Number,
      default: 5
    },
    // 删除页倍数
    removePageMultiple: {
      type: Number,
      default: 2
    },
    // 触发加载的距离
    nearEdgeDistance: {
      type: Number,
      default: 100
    },
    // 判断在底部的距离
    atBottomDistance: {
      type: Number,
      default: 10
    },
    // 是否显示滚动到底部按钮
    showScrollToBottom: {
      type: Boolean,
      default: true
    },
    // 颜色
    colors: {
      type: Object,
      default: {}
    },
    // 初始是否滚动到底部
    initialScrollToBottom: {
      type: Boolean,
      default: true
    },
  },
  data() {
    return {
      // 当前显示的消息
      visibleMessages: [],
      // 加载状态
      messageLoading: false,
      messageLoadingTop: '',
      messageLoadingBottom: '',
      initializing: true,
      // 没有更多消息
      noMoreMsgTip: false,
      noMoreMsgTipTimer: null,
      noMoreMsgTipTop: '',
      noMoreMsgTipBottom: '',
      // 滚动相关
      wrapper: undefined, // 用于判断滚动的元素
      scrollTop: 0,
      scrollHeight: 0,
      chatWrapperHeight: 0,
      isAtBottom: true,
      scrollDirection: 'bottom',
      // 防抖
      scrollTimeout: null,
      // 记录锚点消息ID，用于保持位置
      anchorMessageId: null,
      anchorOffset: 0,
      // 颜色
      themeColors: {
        loadingSpinner: "#4CAF50",
        loadingText: "black",
        toBottomBtn: "#4CAF50",
        toBottomBtnHover: "#45a049",
        toBottomText: "white",
      }
    }
  },
  computed: {
    // 页面最多消息数
    maxSize() {
      return this.pageSize * this.maxPageMultiple
    },
    // 超过 maxSize 时删除消息数
    removeSize() {
      return this.pageSize * this.removePageMultiple
    },
    // 是否无消息
    isNoMsg() {
      return this.visibleMessages.length === 0
    },
  },
  async mounted() {
    this.changeWrapperElement(this.$refs.chatWrapper)

    this.$emit('mounted');

    this.themeColors = Object.assign({}, this.themeColors, this.colors)

    if (this.initialScrollToBottom) {
      await this.scrollToBottom()
    } else {
      await this.scrollToTop()
    }
    this.initializing = false
    if (this.initialScrollToBottom) this.initScrollToBottom()
  },
  unmounted() {
    this.wrapper.removeEventListener('scroll', this.handleScroll)
  },
  methods: {
    // 发出加载消息事件，会在删除溢出消息前发送
    emitLoadMessage() {
      this.$emit('load-messages', this.visibleMessages)
    },

    detectIsLatestMsg(msg) {
      msg = msg || this.visibleMessages[this.visibleMessages.length - 1]
      if (!msg) {
        return false
      }
      if (typeof this.detectIsLatestMsgFunction === 'function') {
        return this.detectIsLatestMsgFunction(msg)
      }
      return this.getMsgId(msg) === this.maxMessageId
    },

    detectIsOldestMsg(msg) {
      msg = msg || this.visibleMessages[0]
      if (!msg) {
        return false
      }
      if (typeof this.detectIsOldestMsgFunction === 'function') {
        return this.detectIsOldestMsgFunction(msg)
      }
      return this.getMsgId(msg) === this.minMessageId
    },

    getMsgId(msg) {
      if (typeof this.getIdFunction === 'function') {
        return this.getIdFunction(msg)
      } else {
        return msg[this.idKey]
      }
    },

    // 初始化消息数据
    async initMessages(reverse = true) {
      let messages
      if (reverse) {
        messages = await this.getOlderMessages(undefined, this.maxMessageId, this.pageSize, true)
      } else {
        messages = await this.getNewerMessages(undefined, this.minMessageId, this.pageSize, true)
      }
      this.visibleMessages = messages
      this.emitLoadMessage()
    },

    // 初始化滚动到底部
    initScrollToBottom() {
      this.$nextTick(() => {
        this.scrollToVisibleBottom()
      })
    },

    // 滚动到显示的底部
    scrollToVisibleBottom() {
      const wrapper = this.wrapper
      if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight
        this.isAtBottom = true
      }
    },
    // 滚动到显示的顶部
    scrollToVisibleTop() {
      const wrapper = this.wrapper
      if (wrapper) {
        wrapper.scrollTop = 0
        this.isAtBottom = false
      }
    },

    // 滚动到最新消息
    async scrollToBottom() {
      await this.initMessages()
      this.initScrollToBottom()
      this.updateScrollInfo()
    },

    // 滚动到某条消息
    async scrollToMidway(info) {
      let msg_obj
      let id = info
      if (typeof info === 'object') {
        msg_obj = info
        id = this.getMsgId(info)
      }
      this.visibleMessages = [
        ...await this.getOlderMessages(msg_obj, id, this.pageSize, false),
        ...await this.getNewerMessages(msg_obj, id, this.pageSize, true)
      ]
      this.emitLoadMessage()
    },

    // 滚动到最旧消息
    async scrollToTop() {
      await this.initMessages(false)
      this.updateScrollInfo()
    },

    // 滚动到最新消息
    async scrollToBottomButton() {
      if (this.detectIsLatestMsg()) {
        this.scrollToVisibleBottom()
        this.updateScrollInfo()
      } else {
        this.messageLoading = true
        await this.scrollToBottom()
        this.messageLoading = false
      }
    },

    // 滚动到最旧消息
    async scrollToTopButton() {
      if (this.detectIsOldestMsg()) {
        this.scrollToVisibleTop()
        this.updateScrollInfo()
      } else {
        this.messageLoading = true
        await this.scrollToTop()
      }
    },

    /**
     * 高亮指定元素
     * @param {HTMLElement} element - 要高亮的DOM元素
     */
    highlightElement(element) {
      // 检查元素是否已经有高亮动画相关的样式或类
      // const isHighlighting = element.dataset.highlighting === 'true';
      const isInHighlightPhase = element.dataset.highlightPhase === 'highlight';
      const isInReturnPhase = element.dataset.highlightPhase === 'return';

      // 如果当前正在返回阶段，取消返回动画，直接开始新的高亮
      if (isInReturnPhase) {
        element.style.transition = 'background-color 0.3s';
        element.style.backgroundColor = '#80808030';
        element.dataset.highlightPhase = 'highlight';

        // 设置1秒后开始返回
        clearTimeout(element.highlightTimeout);
        element.highlightTimeout = setTimeout(() => {
          element.style.transition = 'background-color 0.3s';
          element.style.backgroundColor = '';
          element.dataset.highlighting = 'false';
          element.dataset.highlightPhase = '';
        }, 1000);
        return;
      }

      // 如果当前正在高亮阶段，只是重置计时器
      if (isInHighlightPhase) {
        clearTimeout(element.highlightTimeout);
        element.highlightTimeout = setTimeout(() => {
          element.style.transition = 'background-color 0.3s';
          element.style.backgroundColor = '';
          element.dataset.highlighting = 'false';
          element.dataset.highlightPhase = '';
        }, 1000);
        return;
      }

      // 如果没有在动画中，开始新的高亮动画
      element.dataset.highlighting = 'true';
      element.dataset.highlightPhase = 'highlight';
      element.style.transition = 'background-color 0.3s';
      element.style.backgroundColor = '#80808030';

      // 设置1秒后开始返回
      element.highlightTimeout = setTimeout(() => {
        element.style.transition = 'background-color 0.3s';
        element.style.backgroundColor = '';
        element.dataset.highlighting = 'false';
        element.dataset.highlightPhase = '';
      }, 1000);
    },

    // 滚动到某条消息
    async scrollToMidwayButton(msg, highlight) {
      const id = this.getMsgId(msg)
      if (
        !this.visibleMessages.find(
          msg?.findVisibleMsg || (item => this.getMsgId(item) === id)
        )
      ) {
        this.messageLoading = true
        await this.scrollToMidway(msg)
        await this.$nextTick()
        await this.$nextTick()
        this.messageLoading = false
      }
      const el = this.$refs['message-' + id]?.[0]
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });
        if (highlight) {
          this.highlightElement(el)
        }
      }
    },

    // 更改 chatWrapper （用于判断滚动的元素）
    changeWrapperElement(element) {
      if (this.wrapper) {
        this.wrapper.removeEventListener('scroll', this.handleScroll)
      }
      this.wrapper = element
      element.addEventListener('scroll', this.handleScroll);
    },

    // 获取 chatWrapper 滚动偏移量
    wrapperScrollOffset() {
      const wrapper = this.wrapper
      if (wrapper) {
        const { scrollTop, scrollHeight, clientHeight } = wrapper;
        return {
          top: scrollTop,
          bottom: scrollHeight - clientHeight - scrollTop,
          scrollHeight: scrollHeight,
          clientHeight: clientHeight,
          scrollTop: scrollTop,
        }
      } else {
        return {}
      }
    },

    // 更新滚动信息
    updateScrollInfo() {
      const wrapper = this.wrapperScrollOffset()
      if (wrapper) {
        const currentScrollPosition = wrapper.scrollTop
        const lastScrollPosition = this.scrollTop

        // 判断用户是向上还是向下滚动
        if (currentScrollPosition < lastScrollPosition) {
          // 向上滚动
          this.scrollDirection = 'top'
        } else if (currentScrollPosition > lastScrollPosition) {
          // 向下滚动
          this.scrollDirection = 'bottom'
        }

        this.scrollTop = wrapper.scrollTop
        this.scrollHeight = wrapper.scrollHeight
        this.chatWrapperHeight = wrapper.clientHeight
        // this.isAtBottom = this.scrollTop + this.chatWrapperHeight >= this.scrollHeight - this.atBottomDistance
        this.isAtBottom = wrapper.bottom <= this.atBottomDistance
      }
    },

    // 滚动事件处理
    handleScroll() {
      if (this.initializing) return

      this.updateScrollInfo()

      // 如果在加载消息，则重新记录锚点
      if (this.messageLoading) {
        this.recordAnchorPosition()
      }

      // 防抖处理
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout)
      }

      this.scrollTimeout = setTimeout(() => {
        this.checkLoadMore()
      }, 100)
    },

    // 检查是否需要加载更多
    checkLoadMore() {
      const wrapper = this.wrapper
      if (!wrapper) return

      const scrollOffset = this.wrapperScrollOffset()

      // 如果在加载消息，则不在继续加载消息
      if (this.messageLoading) return;

      // 滚动到顶部，加载更早的消息
      if (scrollOffset.top <= this.nearEdgeDistance && !this.detectIsOldestMsg()) {
        this.loadEarlierMessages()
      }
      // 滚动到底部，加载更新的消息
      else if (scrollOffset.bottom <= this.nearEdgeDistance && !this.detectIsLatestMsg()) {
        this.loadLaterMessages()
      }
    },

    showNoMoreMessage(position) {
      if (position === 'top') {
        this.noMoreMsgTipTop = '10px'
        this.noMoreMsgTipBottom = ''
      } else {
        this.noMoreMsgTipTop = ''
        this.noMoreMsgTipBottom = '10px'
      }
      this.noMoreMsgTip = true
      if (this.noMoreMsgTipTimer) {
        clearTimeout(this.noMoreMsgTipTimer)
      }
      this.noMoreMsgTipTimer = setTimeout(() => {
        this.noMoreMsgTip = false
        this.noMoreMsgTipTimer = null
      }, 500)
    },

    showMsgLoadingTip(position = 'top') {
      if (position === 'top') {
        this.messageLoadingTop = '10px'
        this.messageLoadingBottom = ''
      } else {
        this.messageLoadingTop = ''
        this.messageLoadingBottom = '10px'
      }
    },

    // 加载更早的消息
    async loadEarlierMessages() {
      this.messageLoading = true
      this.showMsgLoadingTip()
      this.recordAnchorPosition()

      const firstVisibleMsg = this.visibleMessages[0]
      const newMessages = await this.getOlderMessages(
        firstVisibleMsg,
        firstVisibleMsg ? this.getMsgId(firstVisibleMsg) : this.maxMessageId,
        this.pageSize
      )

      if (newMessages.length === 0) {
        this.showNoMoreMessage('top')
      } else {
        // 添加新消息到顶部
        this.visibleMessages = [...newMessages, ...this.visibleMessages]

        this.emitLoadMessage()

        // 如果消息太多，从底部移除一些
        if (this.visibleMessages.length > this.maxSize) {
          // const removeCount = this.visibleMessages.length - this.pageSize * 2
          this.removeBottomMessage(this.removeSize)
        }
      }

      await this.$nextTick(() => {
        this.restoreAnchorPosition()
        this.messageLoading = false
      })
    },

    // 加载更新的消息
    async loadLaterMessages() {
      this.messageLoading = true
      this.showMsgLoadingTip('bottom')
      this.recordAnchorPosition()

      const lastVisibleMsg = this.visibleMessages[this.visibleMessages.length - 1]
      const newMessages = await this.getNewerMessages(
        lastVisibleMsg,
        lastVisibleMsg ? this.getMsgId(lastVisibleMsg) : this.minMessageId,
        this.pageSize
      )

      if (newMessages.length === 0) {
        this.showNoMoreMessage('bottom')
      } else {
        // 添加新消息到底部
        this.visibleMessages = [...this.visibleMessages, ...newMessages]

        this.emitLoadMessage()

        // 如果消息太多，从顶部移除一些
        if (this.visibleMessages.length > this.maxSize) {
          // const removeCount = this.visibleMessages.length - this.pageSize * 2
          this.removeTopMessage(this.removeSize,false)
        }
      }

      await this.$nextTick(() => {
        this.restoreAnchorPosition()
        this.messageLoading = false
      })
    },

    //移除顶部消息
    removeTopMessage(count, anchor = false) {
      if (anchor) this.recordAnchorPosition();

      this.visibleMessages.splice(0, count)

      if (anchor) this.restoreAnchorPosition();
    },

    //移除底部消息
    removeBottomMessage(count) {
      this.visibleMessages.splice(-count)
    },

    // 记录锚点位置
    recordAnchorPosition() {
      const wrapper = this.wrapper
      if (!wrapper) return

      const scrollTop = wrapper.scrollTop
      const viewportCenter = scrollTop + wrapper.clientHeight / 2

      // 找到最接近视口中心的消息作为锚点
      let closestDistance = Infinity
      let anchorMessage = null

      for (const message of this.visibleMessages) {
        const messageEl = this.$refs[`message-${this.getMsgId(message)}`]?.[0]
        if (messageEl) {
          const messageTop = messageEl.offsetTop
          const messageCenter = messageTop + messageEl.offsetHeight / 2
          const distance = Math.abs(messageCenter - viewportCenter)

          if (distance < closestDistance) {
            closestDistance = distance
            anchorMessage = message
            this.anchorOffset = viewportCenter - messageCenter
          }
        }
      }

      if (anchorMessage) {
        this.anchorMessageId = this.getMsgId(anchorMessage)
      }
    },

    // 恢复锚点位置
    restoreAnchorPosition() {
      if (!this.anchorMessageId) return

      const wrapper = this.wrapper
      const anchorEl = this.$refs[`message-${this.anchorMessageId}`]?.[0]

      if (wrapper && anchorEl) {
        const anchorTop = anchorEl.offsetTop
        const anchorCenter = anchorTop + anchorEl.offsetHeight / 2
        const targetScrollTop = anchorCenter - wrapper.clientHeight / 2 + this.anchorOffset

        wrapper.scrollTop = Math.max(0, targetScrollTop)
      }

      this.anchorMessageId = null
      this.anchorOffset = 0
    },

    // 格式化时间
    formatTime(timestamp) {
      const date = new Date(timestamp)
      return date.toLocaleTimeString()
    },

    // 外部调用 - 添加新消息
    addMessage(message) {
      const currentIsNewestMsg = this.detectIsLatestMsg() || this.detectIsLatestMsg(message)

      const isAtBottom = this.isAtBottom

      // 如果当前显示的是最新消息，直接添加
      if (currentIsNewestMsg) {
        this.visibleMessages.push(message)

        this.emitLoadMessage()

        // 如果用户在底部，自动滚动到新消息
        if (isAtBottom) {
          this.$nextTick(() => {
            this.scrollToVisibleBottom()
          })
        }

        if (this.visibleMessages.length > this.maxSize) {
          const scrollOffset = this.wrapperScrollOffset()
          if (scrollOffset.top < scrollOffset.bottom) {
            // console.log("更接近顶部");
            this.removeBottomMessage(1)
          } else {
            // console.log("更接近底部");
            this.removeTopMessage(1, true)
          }
        }
      }
    }
  },
  watch: {
    initializing: {
      handler(newVal, oldVal) {
        if (newVal !== oldVal) {
          this.$emit('initializing-change', newVal); // 触发事件
        }
      },
      immediate: true,
    },
  }
}
</script>

<style scoped>
.message-content {
  display: flex;
  align-items: flex-start;
  width: 100%;
  background: white;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #4CAF50;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 12px;
  flex-shrink: 0;
}

.message-body {
  flex: 1;
  min-width: 0;
}

.message-text {
  font-size: 14px;
  line-height: 1.4;
  color: #333;
  margin-bottom: 4px;
}

.message-time {
  font-size: 12px;
  color: #999;
}

.loading-indicator {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.9);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 14px;
  color: #666;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e0e0e0;
  --color: #4CAF50;
  border-top: 2px solid var(--color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.scroll-to-bottom-btn {
  position: absolute;
  right: 20px;
  bottom: 10px;
  --color: #4CAF50;
  --text-color: white;
  --hover-color: #45a049;
  background: var(--color);
  color: var(--text-color);
  border: none;
  outline: none;
  border-radius: 20px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: background 0.3s;
}

.scroll-to-bottom-btn:hover {
  background: var(--hover-color);
}
</style>

<style>
@keyframes midway-message-highlight-animation {
  0% {
    background-color: transparent;
  }
  33% {
    background-color: #80808030;
  }
  80% {
    background-color: #80808030;
  }
  100% {
    background-color: transparent;
  }
}

.midway-highlight-animating {
  animation: midway-message-highlight-animation 1.6s ease-in-out;
}
</style>