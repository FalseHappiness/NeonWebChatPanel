<template>
  <div ref="lottieContainer" class="lottie-container"></div>
</template>

<script>
import lottie from 'lottie-web';

export default {
  name: 'LottieCanvas',
  props: {
    animationData: { type: Object, default: null },
    animationUrl: { type: String, default: '' },
    loop: { type: Boolean, default: true },
    autoplay: { type: Boolean, default: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    // 预加载距离（像素或百分比）
    rootMargin: { type: String, default: '0px' }
  },
  data() {
    return {
      animation: null,
      observer: null,
      hasLoaded: false // 标记是否已加载
    };
  },
  mounted() {
    this.initObserver();
  },
  beforeDestroy() {
    this.destroyObserver();
    this.destroyAnimation();
  },
  methods: {
    initObserver() {
      // 初始化 Intersection Observer
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              this.handleVisible();
              // 可选：首次可见后取消观察（单次触发）
              // this.observer.unobserve(entry.target);
            } else {
              this.handleHidden();
            }
          });
        },
        {
          rootMargin: this.rootMargin // 触发提前量
        }
      );

      this.observer.observe(this.$refs.lottieContainer);
    },
    destroyObserver() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    },
    async handleVisible() {
      if (!this.hasLoaded) {
        await this.loadAnimation();
        this.hasLoaded = true;
      } else if (this.animation) {
        this.animation.play();
      }
    },
    handleHidden() {
      if (this.animation) {
        this.animation.pause(); // 或 stop() 根据需求
      }
    },
    async loadAnimation() {
      if (this.animation) {
        this.animation.destroy();
      }

      let animData = this.animationData;
      if (!animData && this.animationUrl) {
        try {
          const response = await fetch(this.animationUrl);
          animData = await response.json();
        } catch (error) {
          console.error('Failed to load Lottie URL:', error);
          return;
        }
      }

      if (animData) {
        this.animation = lottie.loadAnimation({
          container: this.$refs.lottieContainer,
          renderer: 'canvas',
          loop: this.loop,
          autoplay: this.autoplay,
          animationData: animData,
        });

        if (this.width && this.height) {
          this.$refs.lottieContainer.style.width = `${this.width}px`;
          this.$refs.lottieContainer.style.height = `${this.height}px`;
          this.animation.resize();
        }
      }
    },
    destroyAnimation() {
      if (this.animation) {
        this.animation.destroy();
        this.animation = null;
      }
    },
    play() {
      this.animation?.play();
    },
    pause() {
      this.animation?.pause();
    },
    stop() {
      this.animation?.stop();
    },
  },
  watch: {
    animationUrl() {
      this.hasLoaded = false;
      this.loadAnimation();
    },
    animationData() {
      this.hasLoaded = false;
      this.loadAnimation();
    },
  },
};
</script>

<style scoped>
.lottie-container {
  display: inline-block;
  min-height: 1px; /* 避免未加载时高度为0导致无法观察 */
}

/* 确保 Canvas 不溢出 */
canvas {
  max-width: 100%;
  height: auto;
}
</style>