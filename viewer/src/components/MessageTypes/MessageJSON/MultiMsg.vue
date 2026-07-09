<script>
import { defineComponent } from 'vue'
import ForwardMessageElement from "../ForwardMessageElement.vue";

export default defineComponent({
  name: "MultiMsg",
  components: { ForwardMessageElement },
  props: { json: Object },
})
</script>

<template>
  <ForwardMessageElement>
    <template #source>
      {{ json?.meta?.detail?.source }}
    </template>
    <template #news>
      <p v-for="(content, index) in json?.meta?.detail?.news"
         v-if="json?.meta?.detail?.news"
         :key="index"
         class="forward-message-preview"
      >
        {{ content?.text }}
      </p>
    </template>
    <template #summary>
      {{ json?.meta?.detail?.summary }}
    </template>
  </ForwardMessageElement>
</template>