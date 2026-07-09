<script lang="ts">
import {defineComponent} from 'vue'
import BasicBox from "./BasicBox.vue";

export default defineComponent({
  name: "BasicBoxWithFooter",
  components: {BasicBox},
  props: {
    footerIcon: String,
    footerText: String
  }
})
</script>

<template>
  <BasicBox>
    <slot></slot>
    <hr>
    <div class="footer">
      <img alt="" :src="footerIcon">
      <span class="text-muted">{{ footerText }}</span>
    </div>
  </BasicBox>
</template>

<style scoped>
hr {
  height: 1px;
  border: 0;
  margin: 10px 0 5px 0;
  width: 100%;
  background-color: #e1e1e3;
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