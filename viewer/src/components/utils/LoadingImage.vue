<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: "LoadingImage",
  props: {
    src: {
      type: String,
      required: true
    },
    fallbackSrc: {
      type: String,
      default: null
    },
    placeholderWidth: {
      type: String,
      default: '400px'
    },
    placeholderHeight: {
      type: String,
      default: '250px'
    },
    maxHeight: {
      type: String,
      default: '500px'
    },
    scrollerElement: {
      type: [Element, undefined, null],
      default: undefined
    },
    videoMode: {
      type: Boolean,
      default: false
    },
    controls: {
      type: Boolean,
      default: true
    },
    decideMaxWidth: {
      type: String,
      default: undefined
    },
    maxWidth: {
      type: String,
      default: '70%'
    }
  },
  data() {
    return {
      loading: true,
      failed: false,
      image: null,
      loadedOriginal: false,
    }
  },
  watch: {
    // 监听 src 变化
    src(newSrc) {
      this.loadImage(newSrc)
    },
    // 监听 fallbackSrc 变化
    fallbackSrc(newFallbackSrc) {
      if (this.failed && newFallbackSrc) {
        this.loadImage(newFallbackSrc)
        this.loadedOriginal = true
      }
    },
    maxHeight(newMaxHeight) {
      if (this.image) {
        this.image.style.maxHeight = newMaxHeight
      }
    },
  },
  mounted() {
    this.loadImage(this.src)
  },
  methods: {
    loadImage(src) {
      const This = this
      const imageContainer = this.$refs.imageContainer

      // 重置状态
      this.loading = true
      this.failed = false
      this.loadedOriginal = false

      imageContainer.innerHTML = ''
      const image = this.image = document.createElement(this.videoMode ? "video" : "img")
      if (this.videoMode) {
        image.controls = this.controls
      }
      image.src = src
      image.style.maxHeight = this.maxHeight

      image.onload = () => {
        imageContainer.innerHTML = ''
        if (this.getDecideMaxWidthElement()) {
          const imageSize = this.getRealSize({
            width: image.width,
            height: image.height
          })
          const placeholderSize = this.getRealSize({
            width: parseInt(this.placeholderWidth),
            height: parseInt(this.placeholderHeight)
          })
          // 减少页面布局抖动
          const scroller = this.getScroller()
          // console.log(scroller)
          // console.log(imageSize, placeholderSize)
          if (scroller && (this.$refs.loadingImageContainer.getBoundingClientRect().top < 0)) {
            // console.log(imageSize.height - placeholderSize.height)
            // scroller.scrollTop += imageSize.height - placeholderSize.height
          }
        }
        imageContainer.append(image)
        This.loading = This.failed = false
      }

      image.onerror = () => {
        imageContainer.innerHTML = ''
        if (this.loadedOriginal || !this.fallbackSrc) {
          This.loading = false
          This.failed = true
        } else {
          this.loadedOriginal = true
          image.src = This.fallbackSrc
          This.loading = true
        }
      }
    },
    getNearestVerticalScrollableParent(element) {
      if (!element) return document.scrollingElement || document.documentElement;

      let parent = element.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        const isScrollableY = style.overflowY === 'auto' || style.overflowY === 'scroll';
        const hasVerticalScrollbar = parent.scrollHeight > parent.clientHeight;

        if ((isScrollableY || style.overflow === 'auto' || style.overflow === 'scroll') ||
          hasVerticalScrollbar) {
          return parent;
        }

        parent = parent.parentElement;
      }

      return document.scrollingElement || document.documentElement;
    },
    getRealSize(size) {
      const { width, height } = size
      const maxWidth = this.getMaxWidth()
      // console.log(maxWidth)
      const firstWidth = Math.min(width, maxWidth)
      const firstHeight = height * (firstWidth / width)
      const realHeight = Math.min(firstHeight, parseInt(this.maxHeight))
      const realWidth = firstWidth * (realHeight / firstHeight)
      return {
        height: realHeight,
        width: realWidth
      }
    },
    getScroller() {
      if (this.scrollerElement) {
        return this.scrollerElement
      } else if (this.scrollerElement === undefined) {
        return this.getNearestVerticalScrollableParent(this.$refs.loadingImageContainer)
      } else if (this.scrollerElement === null) {
        return null
      }
    },
    getDecideMaxWidthElement() {
      if (this.decideMaxWidth === undefined) {
        return this.$refs.loadingImageContainer
      } else if (typeof this.decideMaxWidth === 'string') {
        return this.$refs.loadingImageContainer?.closest(this.decideMaxWidth)
      } else {
        return null
      }
    },
    getMaxWidth() {
      const maxWidth = this.maxWidth;
      if (maxWidth.endsWith('px')) {
        return parseInt(maxWidth);
      } else if (maxWidth.endsWith('%')) {
        const element = this.getDecideMaxWidthElement();
        if (!element) {
          return Infinity;
        }

        // 获取起始元素
        let currentElement = this.$refs.loadingImageContainer;
        let totalWidth = element.clientWidth;
        let totalPadding = 0;

        // 从当前元素向上遍历直到目标元素
        while (currentElement && currentElement !== element) {
          const style = getComputedStyle(currentElement);
          totalPadding += parseInt(style.paddingLeft) + parseInt(style.paddingRight);
          currentElement = currentElement.parentElement;
        }

        // 最后处理目标元素本身的padding
        const elementStyle = getComputedStyle(element);
        totalPadding += parseInt(elementStyle.paddingLeft) + parseInt(elementStyle.paddingRight);

        const elementWidth = totalWidth - totalPadding;
        return elementWidth * parseInt(maxWidth) / 100;
      } else {
        return Infinity;
      }
    }
  },
  computed: {
    loadingImageContainerStyle() {
      const style = {
        maxHeight: this.maxHeight,
      }
      if (this.loading || this.failed) {
        style.width = this.placeholderWidth
        style.height = this.placeholderHeight
      }
      return style
    }
  }
})
</script>

<template>
  <div class="loading-image-container"
       :style="loadingImageContainerStyle"
       ref="loadingImageContainer"
       :data-src="src"
       :data-fallback-src="fallbackSrc || ''">
    <div v-if="loading" class="loading-image-placeholder"
         :style="{ width: placeholderWidth, height: placeholderHeight, maxHeight }">
      <img src="/QQ/app/img/loading.png" alt="">
    </div>
    <div v-if="failed" class="failed-image-placeholder"
         :style="{ width: placeholderWidth, height: placeholderHeight, maxHeight }">
      <img :src="videoMode ? '/QQ/icons/video_off_24.svg' : '/QQ/app/img/qui_image_broken.png'" alt="">
      <p><b>原链接: </b>{{ src }}</p>
      <p v-if="fallbackSrc"><b>后备链接: </b>{{ fallbackSrc }}</p>
    </div>
    <div class="image-container" ref="imageContainer"></div>
  </div>
</template>

<style scoped>
.loading-image-container, .loading-image-placeholder, .failed-image-placeholder, .image-container, .image-container:deep(img) {
  max-height: 500px;
  max-width: 100%;
}

.loading-image-placeholder, .failed-image-placeholder {
  width: 400px;
  height: 250px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  flex-wrap: nowrap;
  background-color: #e7eaf1;
  border-radius: 8px;
  overflow: hidden;
}

.failed-image-placeholder p {
  margin: 5px;
  text-align: center;
  font-size: 10px;
  line-height: 10px;
}

.loading-image-placeholder img, .failed-image-placeholder img {
  width: 40px;
  height: 40px;
  margin: 5px;
}

.loading-image-placeholder img {
  opacity: 0.5;
}

.failed-image-placeholder img {
  opacity: 0.3;
}
</style>