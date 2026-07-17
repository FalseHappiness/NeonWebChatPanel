<script>
import { defineComponent } from 'vue'
import ColorSvg from "./ColorSvg.vue";

export default defineComponent({
  name: "EnterArrow",
  components: { ColorSvg },
  props: {
    size: {
      type: Number, default: 20
    }
  },
})
</script>

<template>
  <div class="enter-arrow" :style="{ width: size + 'px', height: size + 'px' }">
    <ColorSvg src="/QQ/icons/arrow_right_small_16.svg" style="background-color: #7F7F7F;"></ColorSvg>
  </div>
</template>

<style scoped>
.enter-arrow .color-svg {
  width: 100%;
  height: 100%;
}

.enter-arrow {
  display: inline-block;
  flex-shrink: 0;
}
</style>