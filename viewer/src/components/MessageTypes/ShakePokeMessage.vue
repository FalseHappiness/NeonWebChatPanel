<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: "ShakePokeMessage",
  computed: {
    isSupported() {
      return this.parseId === this.parseType && [1, 2, 3, 4, 5, 6].includes(this.parseId)
    },
    parseId() {
      return parseInt(this.id)
    },
    parseType() {
      return parseInt(this.type)
    },
    size() {
      let size
      if (this.parseId === 1) {
        size = {
          width: 200 / 2.5,
          height: 180 / 2.5
        }
      } else {
        size = {
          height: 120 / 2,
          width: 120 / 2
        }
      }
      return {
        width: `${size.width}px`,
        height: `${size.height}px`
      }
    }
  },
  props: {
    id: {
      type: [Number, String],
      default: 1
    },
    type: {
      type: [Number, String],
      default: 1
    },
    out: {
      type: Boolean,
      default: false,
    }
  },
  data() {
    return {
      isAnimating: false
    }
  },
  methods: {
    handleClick() {
      if (!this.isAnimating) {
        this.isAnimating = true
        setTimeout(() => {
          this.isAnimating = false
        }, 1200)
      }
    }
  }
})
</script>

<template>
  <div class="message-box-less message-shake-poke-message no-darkness-effect"
       v-if="isSupported"
       :class="{ in: !out }"
       :style="size">
    <img alt=""
         @click="handleClick"
         :style="size"
         :class="{ 'no-flipping': parseId === 5 }"
         :src="`/QQ/app/poke/${parseId}/${parseId}.${isAnimating ? 'webp' : 'png'}`"
    >
  </div>
  <div v-else>
    不支持的窗口抖动
  </div>
</template>

<style scoped>
.message-shake-poke-message {
  display: flex;
  align-items: center;
}

.message-shake-poke-message img {
  width: 80px;
  height: 72px;
  margin-bottom: -10px;
  margin-top: -6px;
}

.message-shake-poke-message.in img:not(.no-flipping) {
  transform: scaleX(-1);
}
</style>