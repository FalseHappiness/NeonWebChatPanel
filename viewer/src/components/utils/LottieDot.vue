<template>
  <div ref="lottieContainer" class="lottie-container">
    <DotLottieVue
      ref="dotPlayer"
      v-if="animationUrl"
      :src="animationUrl"
      :loop="loop"
      :autoplay="false"
      auto-resize-canvas
      style="width: 100%; height: 100%;"
    />
    <DotLottieVue
      ref="dotPlayer"
      v-else-if="animJsonStr"
      :data="animJsonStr"
      :loop="loop"
      :autoplay="false"
      auto-resize-canvas
      style="width: 100%; height: 100%;"
    />
  </div>
</template>

<script>
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'

export default {
  name: 'LottieDot',
  components: { DotLottieVue },
  props: {
    animationData: { type: Object, default: null },
    animationUrl: { type: String, default: '' },
    loop: { type: Boolean, default: true },
    autoplay: { type: Boolean, default: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    rootMargin: { type: String, default: '0px' }
  },
  data() {
    return {
      observer: null,
      hasLoaded: false,
      animJsonStr: null, // 存序列化后的JSON字符串，不再存Object
      dotInstance: null
    }
  },
  mounted() {
    this.initObserver()
    this.$nextTick(() => {
      this.bindDotInstance()
    })
  },
  beforeDestroy() {
    this.destroyObserver()
  },
  methods: {
    bindDotInstance() {
      const player = this.$refs.dotPlayer
      if (!player) return
      this.dotInstance = player.getDotLottieInstance()
    },
    initObserver() {
      this.observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) this.handleVisible()
            else this.handleHidden()
          })
        },
        { rootMargin: this.rootMargin }
      )
      this.observer.observe(this.$refs.lottieContainer)
    },
    destroyObserver() {
      if (this.observer) {
        this.observer.disconnect()
        this.observer = null
      }
    },
    async handleVisible() {
      if (!this.hasLoaded) {
        await this.loadAnimation()
        this.hasLoaded = true
        if (this.autoplay) this.play()
      } else {
        this.play()
      }
    },
    handleHidden() {
      this.pause()
    },
    async loadAnimation() {
      // 优先本地对象，转字符串
      if (this.animationData) {
        this.animJsonStr = JSON.stringify(this.animationData)
        const box = this.$refs.lottieContainer
        if (this.width && this.height) {
          box.style.width = `${this.width}px`
          box.style.height = `${this.height}px`
        }
        return
      }
      // 远程url不需要处理data，直接走src
      this.animJsonStr = null
    },
    play() {
      this.dotInstance?.play()
    },
    pause() {
      this.dotInstance?.pause()
    },
    stop() {
      this.dotInstance?.stop()
    }
  },
  watch: {
    animationUrl() {
      this.hasLoaded = false
      this.animJsonStr = null
      this.loadAnimation()
    },
    animationData() {
      this.hasLoaded = false
      this.loadAnimation()
    }
  }
}
</script>

<style scoped>
.lottie-container {
  display: inline-block;
  min-height: 1px;
}
</style>