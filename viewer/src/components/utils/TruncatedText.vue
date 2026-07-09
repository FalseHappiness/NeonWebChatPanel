<template>
  <div ref="container" class="container" :style="{ height: oneLine ? '25px' : '50px' }">
    <div v-if="!oneLine" ref="text" class="text" :class="{ truncated: truncated }" :title="content">
      {{ displayedVisibleText }}
    </div>
    <div v-if="!oneLine" class="text" :class="{ truncated: truncated }" :title="content">
      {{ displayedHiddenText }}
    </div>
    <div v-else ref="text" class="text" :class="{ truncated: truncated }" :title="content">
      {{ displayedVisibleText }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'TruncatedText',
  props: {
    // 接收父组件传递的文本内容
    content: {
      type: String,
      default: ''
    },
    // 单行模式
    oneLine: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      displayedVisibleText: '',
      hiddenText: '',
      displayedHiddenText: '',
      resizeObserver: null,
      truncated: false,
    }
  },
  watch: {
    // 监听 content 变化，重新计算截断文本
    content() {
      this.$nextTick(() => {
        this.truncateText();
      });
    }
  },
  mounted() {
    this.truncateText();
    this.setupResizeObserver();
  },
  beforeDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  },
  methods: {
    truncateText() {
      const element = this.$refs.text;
      if (!element || element.clientWidth === 0) return;

      // 创建临时测量元素
      const temp = document.createElement('div');
      temp.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
    font: ${getComputedStyle(element).font};
  `;
      document.body.appendChild(temp);

      // 1. 测量完整文本宽度
      temp.textContent = this.content;
      const fullWidth = temp.getBoundingClientRect().width;
      const isTruncated = this.truncated = fullWidth > element.clientWidth * (this.oneLine ? 1 : 2);

      if (!isTruncated) {
        this.displayedVisibleText = this.content;
        this.displayedHiddenText = this.hiddenText = '';
        document.body.removeChild(temp);
        return;
      }

      // 2. 测量省略号宽度
      temp.textContent = '...';
      const ellipsisWidth = temp.getBoundingClientRect().width;
      const availableWidth = element.clientWidth - ellipsisWidth;

      if (this.oneLine) {
        // 计算前后部分的最佳长度
        const frontPart = this.binarySearchText(
          this.content,
          availableWidth / 2,
          temp
        );
        const backPart = this.binarySearchText(
          this.content,
          availableWidth / 2,
          temp,
          true
        );

        // 组合前后部分
        this.displayedVisibleText = frontPart + '...' + backPart;
      } else {
        // 3. 使用二分查找计算可见部分
        let visibleText = this.binarySearchText(
          this.content,
          availableWidth,
          temp
        );
        // 至少保留 1 个字符
        visibleText = visibleText || this.content.slice(0, 1)
        this.displayedVisibleText = visibleText + "...";


        // 4. 计算隐藏部分（无需考虑省略号）
        this.hiddenText = this.content.slice(visibleText.length);
        this.displayedHiddenText = this.binarySearchText(
          this.hiddenText,
          element.clientWidth,
          temp,
          true // 从后往前搜索
        );
        // 至少保留 1 个字符
        this.displayedHiddenText = this.displayedHiddenText || this.content.slice(-1)
      }

      document.body.removeChild(temp);
    },

    // 二分查找文本（支持正向和反向搜索）
    binarySearchText(text, maxWidth, temp, reverse = false) {
      let low = 0;
      let high = text.length;
      let result = '';

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const testText = reverse
          ? text.slice(text.length - mid)
          : text.slice(0, mid);

        temp.textContent = testText;
        const width = temp.getBoundingClientRect().width;

        if (width <= maxWidth) {
          result = testText;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      return result;
    },
    setupResizeObserver() {
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.truncateText();
        });
        this.resizeObserver.observe(this.$refs.container);
      } else {
        // 如果不支持 ResizeObserver，可以使用窗口 resize 事件作为回退
        window.addEventListener('resize', this.truncateText);
      }
    }
  }
}
</script>

<style scoped>
.container {
  width: 100%;
  padding: 0;
}

.text {
  display: block;
  width: 100%;
  overflow-wrap: break-word;
  word-break: normal;
  overflow: hidden;
  text-align: left;
}

.text.truncated {
  white-space: nowrap;
}
</style>