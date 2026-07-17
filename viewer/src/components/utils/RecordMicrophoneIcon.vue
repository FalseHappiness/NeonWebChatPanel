<script>
import { defineComponent } from 'vue'
import ColorSvg from "./ColorSvg.vue";

export default defineComponent({
  name: "RecordMicrophoneIcon",
  components: { ColorSvg },
  props: {
    active: { type: Boolean, default: false }
  }
})
</script>

<template>
  <div class="record-microphone-icon" :class="{ active }">
    <ColorSvg src="/QQ/icons/microphone_on_24.svg" class="record-microphone-svg"></ColorSvg>
  </div>
</template>

<style scoped>
.record-microphone-icon {
  border-radius: 50%;
  height: 52px;
  outline: rgba(0, 153, 255, 0.2) solid 2px;
  position: relative;
  transition-duration: 0.3s;
  transition-timing-function: ease;
  transition-delay: 0s;
  transition-property: outline-width;
  width: 52px;
  background: radial-gradient(38.02% 38.02% at 50% 50%, rgb(0, 201, 255) 0px, rgb(0, 155, 255) 100%);
  margin: 20px 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.record-microphone-icon.active {
  outline-width: 6px;
  background: radial-gradient(38.02% 38.02% at 50% 50%, rgb(0, 177, 255) 0px, rgb(0, 128, 255) 100%);
}

.record-microphone-svg {
  width: 24px;
  height: 24px;
  display: block;
  background-color: white;
}
</style>