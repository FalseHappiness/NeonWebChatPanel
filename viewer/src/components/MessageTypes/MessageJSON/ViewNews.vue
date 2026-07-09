<script>
import { defineComponent } from 'vue'
import TruncatedText from "../../utils/TruncatedText.vue";
import { getMultimediaProxyUrl } from "../../../utils/backend-api.js"

export default defineComponent({
  name: "StructMsg",
  components: { TruncatedText },
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
  <a class="message-box-less message-struct-msg" target="_blank" :href="view.jumpUrl">
    <div class="top-side">
      <p class="title text-truncate">{{ view.title }}</p>
      <div class="middle-content">
        <span v-if="view.desc" class="text-muted">{{ view.desc }}</span>
        <img alt="" :src="getMultimediaProxyUrl(view.preview)" class="preview-image">
      </div>
    </div>
    <div class="footer" v-if="view.tag || view.tagIcon">
      <hr>
      <span class="text-muted">{{ view.tag }}</span>
    </div>
  </a>
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
  padding: 12px 10px;
  flex-direction: column;
  justify-content: space-between;
}

hr {
  height: 1px;
  border: 0;
  margin: 10px 0 0 0;
  width: 100%;
  background-color: #f2f2f2;
}

.footer {
  height: 30px;
  white-space: nowrap;
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
}

.text-muted {
  line-height: 130%;
}
</style>