<template>
  <div class="virtual-scroller">
    <!-- 可滚动的父容器，绝对定位占满virtual-scroller -->
    <div class="scroll-container" ref="container" @scroll="handleScroll">
      <!-- 内层内容容器，用于撑开总高度以启用滚动 -->
      <div class="content" :style="{ height: `${totalHeight}px` }">
        <!-- 视口容器，只渲染可见项，应用偏移 -->
        <div class="viewport" :style="{ transform: `translateY(${startOffset}px)` }">
          <slot v-for="(item, index) in visibleItems" :key="start + index" :item="item" :index="start + index"></slot>
        </div>
      </div>
    </div>
    <!-- 自定义滚动条，与scroll-container同层级 -->
    <div class="scrollbar" ref="scrollbar" :style="{ width: `${thumbWidth}px`, right: `${thumbRight}px` }">
      <div class="track" ref="track">
        <div
          class="thumb"
          ref="thumb"
          :style="{ height: `${thumbHeight}px`, top: `${thumbTop}px` }"
          @mousedown="startDrag"
          :class="{ dragging: isDragging }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'VirtualScroller',
  props: {
    // 数据项数组
    items: {
      type: Array,
      required: true,
      default: () => []
    },
    // 每个项的固定高度（像素）
    itemHeight: {
      type: Number,
      required: true
    },
    // 可选：缓冲区大小（上下各缓冲多少项，默认为5，提高平滑性）
    buffer: {
      type: Number,
      default: 5
    },
    // 可选：是否设置容器高度为最大高度
    autoHeight: {
      type: Boolean,
      default: false
    },
    // 可选：最小滑块高度
    minThumbHeight: {
      type: Number,
      default: 18
    },
    // 可选：滑块宽度
    thumbWidth: {
      type: Number,
      default: 8
    },
    // 可选：距离右侧
    thumbRight: {
      type: Number,
      default: 3
    }
  },
  data() {
    return {
      containerHeight: 0, // 容器实际高度（从样式动态获取）
      start: 0, // 可见项起始索引
      end: 0, // 可见项结束索引
      thumbHeight: 0, // 滚动条滑块高度
      thumbTop: 0, // 滚动条滑块顶部位置
      isDragging: false, // 是否正在拖动滑块
      dragStartY: 0, // 拖动起始Y坐标
      dragStartTop: 0, // 拖动起始滑块位置
    };
  },
  computed: {
    // 总内容高度
    totalHeight() {
      return this.items.length * this.itemHeight;
    },
    // 可见项数量（基于容器高度 + 缓冲）
    visibleCount() {
      return Math.ceil(this.containerHeight / this.itemHeight) + this.buffer * 2;
    },
    // 实际渲染的可见项
    visibleItems() {
      return this.items.slice(this.start, this.end);
    },
    // 起始偏移（用于translateY）
    startOffset() {
      return this.start * this.itemHeight;
    },
    // 最大滚动距离
    maxScroll() {
      return this.totalHeight - this.containerHeight;
    },
  },
  mounted() {
    // 获取容器高度（从ref获取实际clientHeight，考虑min-height, max-height, height等样式影响）
    this.updateContainerHeight();
    // 初始化可见范围
    this.updateVisibleRange();
    // 更新滚动条
    this.updateScrollbar();
    // 监听resize以更新高度
    this.initObserver();
    // 监听鼠标移动和抬起（全局，用于拖动）
    document.addEventListener('mousemove', this.handleDrag);
    document.addEventListener('mouseup', this.stopDrag);

    this.setAutoHeight()
  },
  beforeDestroy() {
    if (this.observer) {
      this.observer.disconnect();
    }

    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.stopDrag);
  },
  watch: {
    items() {
      this.updateVisibleRange();
      this.updateScrollbar();
      this.setAutoHeight()
    },
    itemHeight() {
      this.updateVisibleRange();
      this.updateScrollbar();
      this.setAutoHeight()
    }
  },
  methods: {
    // 滚动距离顶部
    scrollTop() {
      return this.$refs.container?.scrollTop || 0
    },
    // 更新容器高度（从ref获取实际clientHeight，考虑min-height, max-height, height等样式影响）
    updateContainerHeight() {
      if (this.$refs.container) {
        this.containerHeight = this.$refs.container.clientHeight;
      }
    },
    // 处理resize事件
    handleResize() {
      this.updateContainerHeight();
      this.updateVisibleRange();
      this.updateScrollbar();
    },
    // 更新可见项范围
    updateVisibleRange() {
      const scrollTop = this.scrollTop();
      this.start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.buffer);
      this.end = Math.min(this.items.length, this.start + this.visibleCount);
    },
    // 处理容器滚动事件（浏览器原生滚动）
    handleScroll() {
      if (!this.isDragging) {
        this.updateVisibleRange();
        this.updateScrollbar();
      }
    },
    // 更新自定义滚动条状态
    updateScrollbar() {
      if (this.totalHeight <= this.containerHeight) {
        // 无需滚动条
        this.thumbHeight = 0;
        this.thumbTop = 0;
        return;
      }
      // 计算滑块高度：(可见高度 / 总高度) * 轨道高度
      const trackHeight = this.$refs.track ? this.$refs.track.clientHeight : this.containerHeight;
      this.thumbHeight = Math.max(this.minThumbHeight, (this.containerHeight / this.totalHeight) * trackHeight); // 最小25px
      // 计算滑块位置：(scrollTop / maxScroll) * (轨道高度 - 滑块高度)
      const scrollTop = this.scrollTop();
      this.thumbTop = (scrollTop / this.maxScroll) * (trackHeight - this.thumbHeight);
    },
    // 开始拖动滑块
    startDrag(event) {
      this.isDragging = true;
      this.dragStartY = event.clientY;
      this.dragStartTop = this.thumbTop;
      event.preventDefault(); // 防止默认行为
    },
    // 处理拖动
    handleDrag(event) {
      if (!this.isDragging) return;
      const deltaY = event.clientY - this.dragStartY;
      const trackHeight = this.$refs.track.clientHeight;
      // 计算新滑块位置（限制边界）
      let newTop = this.dragStartTop + deltaY;
      newTop = Math.max(0, Math.min(newTop, trackHeight - this.thumbHeight));
      this.thumbTop = newTop;
      // 计算并更新容器scrollTop：(thumbTop / (轨道高度 - 滑块高度)) * maxScroll
      const scrollRatio = newTop / (trackHeight - this.thumbHeight);
      this.$refs.container.scrollTop = scrollRatio * this.maxScroll;
      // 更新可见范围
      this.updateVisibleRange();
    },
    // 停止拖动
    stopDrag() {
      this.isDragging = false;
    },

    // 初始化观察器
    initObserver() {
      this.observer = new ResizeObserver(() => {
        this.handleResize();
      });

      this.observer.observe(this.$el);
    },

    setAutoHeight() {
      if (this.autoHeight || this.$el.style.height === 'auto') {
        this.$el.style.height = `${this.totalHeight}px`;
      }
    },

    /**
     * 滚动到指定索引的项
     * @param {number} index - 要滚动到的项目索引
     * @param {Object} [options] - 滚动选项
     * @param {string} [options.behavior='auto'] - 滚动行为 ('auto' 或 'smooth')
     * @param {string} [options.align='center'] - 对齐方式 ('start', 'center', 'end', 'nearest')
     */
    scrollToIndex(index, options = {}) {
      const {
        behavior = 'auto',
        align = 'center'
      } = options;

      // 确保索引在有效范围内
      const validIndex = Math.max(0, Math.min(index, this.items.length - 1));

      // 计算目标滚动位置
      let scrollTop = validIndex * this.itemHeight;

      // 根据对齐方式调整位置
      if (align === 'center') {
        scrollTop = scrollTop - this.containerHeight / 2 + this.itemHeight / 2;
      } else if (align === 'end') {
        scrollTop = scrollTop - this.containerHeight + this.itemHeight;
      } else if (align === 'nearest') {
        const currentScroll = this.scrollTop();
        const itemTop = validIndex * this.itemHeight;
        const itemBottom = itemTop + this.itemHeight;

        if (itemTop < currentScroll) {
          // 项目在当前视口上方，滚动到顶部
          scrollTop = itemTop;
        } else if (itemBottom > currentScroll + this.containerHeight) {
          // 项目在当前视口下方，滚动到底部
          scrollTop = itemBottom - this.containerHeight;
        } else {
          // 项目已经在视口中，不需要滚动
          return;
        }
      }

      // 限制滚动范围
      scrollTop = Math.max(0, Math.min(scrollTop, this.maxScroll));

      // 执行滚动
      this.$refs.container.scrollTo({
        top: scrollTop,
        behavior
      });

      // 立即更新可见范围（不等待滚动动画）
      this.start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.buffer);
      this.end = Math.min(this.items.length, this.start + this.visibleCount);

      // 更新滚动条位置
      this.updateScrollbar();
    }
  }
};
</script>

<style scoped>
.virtual-scroller {
  position: relative;
  width: 100%;
}

.scroll-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow-y: scroll; /* 启用垂直滚动 */
  /* 隐藏原生滚动条（浏览器兼容） */
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}

.scroll-container::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

.content {
  position: relative;
}

.viewport {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.scrollbar {
  position: absolute;
  top: 0;
  right: 2px;
  width: 8px;
  height: 100%;
  background: transparent;
}

.track {
  width: 100%;
  height: 100%;
  background: transparent;
  border-radius: 5px;
}

.thumb {
  position: absolute;
  left: 0;
  width: 100%;
  background: #888;
  opacity: 0.3;
  border-radius: 5px;
  cursor: pointer;
  visibility: hidden;
}

.thumb:hover {
  background: #666;
}

.virtual-scroller:hover .thumb, .thumb.dragging {
  visibility: visible;
}
</style>
