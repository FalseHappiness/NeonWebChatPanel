<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: "ColorSvg",
  props: {
    src: String,
    size: { type: Number, default: 100 }
  },
  computed: {
    svg() {
      return this.$refs.svg
    }
  }
})
</script>

<template>
  <div :style="{
    maskImage: `url(${src})`,
    '-webkit-mask-image': `url(${src})`,
    maskSize: `${size}% ${size}%`,
    '-webkit-mask-size': `${size}% ${size}%`,
  }" ref="svg" class="color-svg">
  </div>
</template>

<style scoped>
.color-svg {
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}
</style>