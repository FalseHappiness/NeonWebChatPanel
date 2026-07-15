<script>
import { defineComponent } from 'vue'

export default defineComponent({
  name: "UnparsedJSON",
  props: {
    json: Object
  },
  watch: {
    json(newVal) {
      if (newVal) {
        console.error("Unparsed JSON message:", newVal)
      }
    }
  }
})
</script>

<template>
  <div class="message-unparsed-json">
    <p class="message-unparsed-json-title">未解析的 JSON 消息：</p>
    <span>{{ JSON.stringify(json) }}</span>
  </div>
</template>

<style scoped>
.message-unparsed-json-title {
  color: red;
  margin: 0;
}
</style>