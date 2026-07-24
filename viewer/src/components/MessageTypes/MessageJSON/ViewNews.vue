<script>
import { defineComponent } from 'vue'
import TruncatedText from "../../utils/TruncatedText.vue";
import { getMultimediaProxyUrl } from "../../../utils/backend-api.js"
import BasicBoxWithFooter from "./BasicBoxWithFooter.vue";

export default defineComponent({
  name: "StructMsg",
  components: { BasicBoxWithFooter, TruncatedText },
  props: { json: Object },
  computed: {
    view() {
      return this.json?.meta[this.json?.view]
    },
  },
  methods: {
    getMultimediaProxyUrl
  }
})
</script>

<template>
  <BasicBoxWithFooter
    class="message-struct-msg"
    :footer-icon="view.tagIcon"
    :footer-text="view.tag"
    :jump-url="view.jumpUrl">
    <div class="top-side">
      <p class="title text-truncate">{{ view.title }}</p>
      <div class="middle-content">
        <span class="text-muted">{{ view.desc || '' }}</span>
        <img alt="" :src="view.preview" class="preview-image">
      </div>
    </div>
  </BasicBoxWithFooter>
</template>

<style scoped>
.message-struct-msg {
  width: 270px;
  max-width: 100%;
  display: flex;
  background-color: white;
  color: black;
  text-decoration: none !important;
  border-radius: 8px;
  padding: 8px 8px 2px 8px !important;
  flex-direction: column;
  justify-content: space-between;
}

.title {
  margin-bottom: 10px;
}

.preview-image {
  width: 50px;
  height: 50px;
  margin-left: 10px;
}

.middle-content {
  display: flex;
  justify-content: space-between;
  padding: 5px;
}

.text-muted {
  line-height: 130%;
}
</style>