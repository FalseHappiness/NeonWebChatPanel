<script>
import { defineComponent } from 'vue'
import SimpleBar from "simplebar-vue";
import 'simplebar-vue/dist/simplebar.min.css';

export default defineComponent({
  name: "CustomScrollBar",
  components: {
    SimpleBar
  }
})
</script>

<template>
  <SimpleBar class="custom-scroll-bar" data-simplebar data-simplebar-auto-hide="false">
    <slot/>
  </SimpleBar>
</template>

<style>
.custom-scroll-bar {
  height: 100%;
}
</style>

<style>
.custom-scroll-bar .resizable-r {
  width: 8px !important;
}

.custom-scroll-bar .simplebar-scrollbar {
  visibility: hidden;
  opacity: 0.3;
}

.custom-scroll-bar .simplebar-scrollbar:before {
  width: 7px;
  left: 3.5px;
}

.custom-scroll-bar:hover .simplebar-scrollbar, .custom-scroll-bar.simplebar-dragging .simplebar-scrollbar {
  visibility: visible;
}
</style>