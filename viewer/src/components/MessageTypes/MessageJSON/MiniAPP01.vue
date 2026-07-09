<script setup>
import { computed, ref } from "vue";
import { getMultimediaProxyUrl } from "../../../utils/backend-api.js";

const props = defineProps({
  json: Object
})

const detail = computed(() => {
  return props.json?.meta?.detail_1 || {}
})

const isLoaded = ref(false)

</script>

<template>
  <a class="message-box-less message-mini-app-01" target="_blank"
     :href="detail.url.startsWith('http')?'':'https://'+detail.url">
    <div class="header">
      <img alt="" :src="detail.icon">
      <span class="text-muted">{{ detail.title }}</span>
    </div>
    <span class="desc">{{ detail.desc }}</span>
    <img :style="{ height: isLoaded ? 'auto' : '196px' }" @load="isLoaded = true" alt="" :src="getMultimediaProxyUrl(detail.preview)"
         class="preview-image"/>
    <hr>
    <div class="footer">
      <img alt="" src="/QQ/app/img/qq_mini_app.ico">
      <span class="text-muted">QQ小程序</span>
    </div>
  </a>
</template>

<style scoped>
.message-mini-app-01 {
  width: 270px;
  max-width: 100%;
  display: block;
  background-color: white;
  color: black;
  text-decoration: none !important;
  border-radius: 4px;
  padding: 8px 12px 5px 12px;
  height: auto;
}

.header img {
  height: 18px;
  width: 18px;
  vertical-align: center;
  border-radius: 2px;
}

.header span {
  vertical-align: center;
  margin-left: 5px;
}

.preview-image {
  width: 100%;
  border-radius: 3px;
}

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
}

.text-muted {
  font-size: 80%;
}

.desc {
  font-size: 15px;
  margin-top: 3px;
  display: inline-block;
}
</style>