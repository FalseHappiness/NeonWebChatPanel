<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: "SimplePopUp",
  data() {
    return {
      closed: false
    }
  },
  props: {
    onConfirm: {
      type: Function,
      default: new Function()
    },
    onCancel: {
      type: Function,
      default: new Function()
    },
    containerStyles: {
      type: [String, Object, Array],
      default: {}
    }
  },
  methods: {
    close() {
      this.closed = true
      const mask = this.$refs.simplePopUpMask
      const container = this.$refs.simplePopUpContainer
      this.restartAnimation(mask)
      this.restartAnimation(container)
      setTimeout(() => {
        mask.style.display = container.style.display = 'none'
      }, 300)
    },
    restartAnimation(element) {
      const display = element.style.display
      element.style.display = 'none';
      // 触发重排
      element.offsetWidth;
      element.style.display = display;
    },
    confirm(confirm = true, ...args) {
      this.close()
      setTimeout(() => {
        confirm ? this.onConfirm(...args) : this.onCancel()
      }, 300)
    }
  }
})
</script>

<template>
  <div class="simple-pop-up">
    <teleport to="body">
      <div class="simple-pop-up-mask" :class="{ closed }" ref="simplePopUpMask">
        <div class="simple-pop-up-container" :class="containerStyles" ref="simplePopUpContainer">
          <slot name="default"></slot>
        </div>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
.simple-pop-up-mask {
  position: fixed;
  height: 100%;
  width: 100%;
  background-color: rgba(0, 0, 0, 0.48);
  opacity: 1;
  --anim-time: 0.3s;
  animation: simplePopUpMaskIn var(--anim-time) ease-in-out;
}

.simple-pop-up-mask.closed {
  animation: simplePopUpMaskIn 0.3s ease-in-out reverse;
  opacity: 0;
}

@keyframes simplePopUpMaskIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

:where(.simple-pop-up-container) {
  width: 360px;
  height: 380px;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background-color: white;
  border-radius: 6px;
  box-shadow: 0 0 20px 20px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  padding: 10px 15px 15px 15px;
  --anim-time: 0.3s;
  animation: simplePopUpContainerIn var(--anim-time) ease-in-out;
}

.simple-pop-up-mask.closed .simple-pop-up-container {
  animation: simplePopUpContainerIn 0.3s ease-in-out reverse;
  opacity: 0;
}

@keyframes simplePopUpContainerIn {
  from {
    opacity: 0;
    top: calc(50% - 50px);
  }
  to {
    opacity: 1;
    top: 50%;
  }
}
</style>