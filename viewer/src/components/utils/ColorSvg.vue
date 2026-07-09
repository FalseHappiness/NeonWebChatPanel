<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: "ColorSvg",
  props: {
    src: String
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
    maskSize: '100% 100%'
  }" ref="svg">
  </div>
</template>

<style scoped>

</style>