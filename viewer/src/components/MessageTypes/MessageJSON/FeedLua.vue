<script>
import { defineComponent } from 'vue'
import BasicBoxWithFooter from "./BasicBoxWithFooter.vue";

export default defineComponent({
  name: "FeedLua",
  components: { BasicBoxWithFooter },
  props: { json: Object },
  computed: {
    feed() {
      return this.json?.meta?.feed;
    }
  }
})
</script>

<template>
  <BasicBoxWithFooter
    class="message-feed-lua"
    :footer-icon="feed.tagIcon"
    :footer-text="feed.tagName"
    :jump-url="feed.jumpUrl">
    <img alt="" :src="feed.cover" class="cover-img">
    <p class="forward-message-text text-muted">{{ feed.forwardMessage }}</p>
    <p class="title-text">{{ feed.title }}</p>
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