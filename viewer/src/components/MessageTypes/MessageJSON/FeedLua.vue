<script>
import { defineComponent } from 'vue'
import BasicBoxWithFooter from "./BasicBoxWithFooter.vue";
import { getMultimediaProxyUrl } from "../../../utils/backend-api.js";

export default defineComponent({
  name: "FeedLua",
  methods: { getMultimediaProxyUrl },
  components: { BasicBoxWithFooter },
  props: { json: Object },
  computed: {
    detail() {
      return this.json?.meta?.feed;
    }
  }
})
</script>

<template>
  <BasicBoxWithFooter class="message-feed-lua" :footer-icon="detail.tagIcon" :footer-text="detail.tagName">
    <img alt="" :src="detail.cover" class="cover-img">
    <p class="forward-message-text text-muted">{{ detail.forwardMessage }}</p>
    <p class="title-text">{{ detail.title }}</p>
  </BasicBoxWithFooter>
</template>

<style scoped>
.cover-img {
  width: 100%;
  max-height: 500px;
  border-radius: 5px;
  margin: 5px 0;
}

.forward-message-text {
  font-size: 80%;
}

p {
  margin: 0;
}
</style>