<script>
import { defineComponent } from 'vue'
import { stringifyJSON } from "../../utils/others.js";

export default defineComponent({
  name: "UnparsedMessage",
  methods: { stringifyJSON },
  props: {
    event: [Object, String]
  },
  watch: {
    event(newVal) {
      if (newVal) {
        console.error("Unparsed message event:", newVal)
      }
    }
  }
})
</script>

<template>
  <div class="message-unparsed">
    <p class="message-unparsed-title">未解析的 JSON 消息：</p>
    <span>{{ stringifyJSON(event) }}</span>
  </div>
</template>

<style scoped>
.message-unparsed-title {
  color: red;
  margin: 0;
}
</style>