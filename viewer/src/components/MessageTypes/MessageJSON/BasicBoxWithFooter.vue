<script>
import { defineComponent } from 'vue'
import BasicBox from "./BasicBox.vue";

export default defineComponent({
  name: "BasicBoxWithFooter",
  components: { BasicBox },
  props: {
    footerIcon: String,
    footerText: String,
    jumpUrl: { String, default: "" }
  }
})
</script>

<template>
  <BasicBox :jump-url="jumpUrl">
    <slot></slot>
    <hr>
    <div class="footer">
      <img v-if="footerIcon" alt="" :src="footerIcon">
      <span class="text-muted">{{ footerText }}</span>
    </div>
  </BasicBox>
</template>

<style scoped>
hr {
  height: 0;
  border: 0;
  margin: 4px 0 2px 0;
  width: 100%;
  border-bottom: 1px solid #e1e1e3;
}

.footer {
  display: flex;
  align-items: center;
}

.footer img {
  height: 15px;
  width: 15px;
  vertical-align: center;
}

.footer span {
  vertical-align: center;
  margin-left: 5px;
  font-size: 80%;
}
</style>