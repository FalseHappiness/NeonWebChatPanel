<script setup>
import { computed, h, ref } from "vue";
import { getGroupNoticePicUrl, getMultimediaProxyUrl } from "../../../utils/backend-api.js";
import { Base64 } from 'js-base64'
import { convertMessageTextHTMLSyntax } from "../../../utils/parse-message.js";

const props = defineProps({
  json: Object
})

const mannounce = computed(() => {
  return props.json?.meta?.mannounce || {}
})

const content = computed(() => {
  return h(
    'div',
    {
      class: 'text-container',
      style: {
        '--lines': props.json?.meta?.mannounce.pic ? 6 : 13
      }
    },
    convertMessageTextHTMLSyntax(
      Base64.decode(props.json?.meta?.mannounce.text)
    ),
  )
})

const images = computed(() => {
  const images = []
  const pictures = props.json?.meta?.mannounce.pic
  if (pictures && Array.isArray(pictures)) {
    for (const pic of pictures) {
      images.push({
        height: pic.height,
        width: pic.width,
        url: getMultimediaProxyUrl(getGroupNoticePicUrl(pic.url))
      })
    }
  }
  return images
})

</script>

<template>
  <div class="message-box-less message-mannounce">
    <div class="header">
      <img alt="" src="/QQ/app/img/mannounce.png">
      <span class="text-muted">{{ Base64.decode(mannounce.title) }}</span>
    </div>
    <div class="content">
      <content></content>
      <img
        v-for="(image, index) in images"
        :key="index"
        :src="image.url"
        alt=""
        class="picture"
        :style="{ '--width': image.width, '--height': image.height }"
      >
    </div>
    <p class="find-out-more message-execute-command" data-command="show-group-notice">查看详情</p>
  </div>
</template>

<style scoped>
.message-mannounce {
  width: 270px;
  max-width: 100%;
  display: block;
  background-color: white;
  color: black;
  border-radius: 4px;
  padding: 14px 20px;
  height: auto;
}

.header {
  margin-bottom: 10px;
}

.header img {
  height: 16px;
  width: 16px;
  vertical-align: center;
}

.header span {
  vertical-align: center;
  margin-left: 5px;
}


.text-muted {
  font-size: 100%;
}

.find-out-more {
  font-weight: bold;
  text-align: center;
  font-size: 14px;
  cursor: pointer;
  margin: 0;
}

.content {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 隐藏超出部分 */
}

.text-container {
  flex: 1; /* 占据剩余空间 */
  overflow: hidden; /* 隐藏超出文本 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  --lines: 6;
  -webkit-line-clamp: var(--lines, 6);
  line-height: 1.5; /* 行高 */
}

.picture {
  max-width: min(100%, 150px);
  max-height: 150px;
  width: auto;
  height: auto;
  --width: 1;
  --height: 1;
  aspect-ratio: var(--width) / var(--height);
  object-fit: contain;
  margin-top: 20px;
}
</style>