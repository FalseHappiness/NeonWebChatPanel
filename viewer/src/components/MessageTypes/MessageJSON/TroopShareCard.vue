<script setup>
import { computed } from "vue";

const props = defineProps({
  json: Object
})

const contact = computed(() => {
  return props.json?.meta?.contact || {}
})


</script>

<template>
  <a class="message-box-less message-troop-share-card" :title="contact.contact" target="_blank" :href="contact.jumpUrl">
    <div>
      <img alt="" :src="contact.avatar">
      <span>{{ contact.nickname }}</span>
    </div>
    <hr>
    <span class="text-muted">{{ contact.tag }}</span>
  </a>
</template>

<style scoped>
.message-troop-share-card {
  width: 270px;
  max-width: 100%;
  height: 95px;
  display: block;
  background-color: white;
  color: black;
  text-decoration: none !important;
  border-radius: 8px;
}


.message-troop-share-card hr {
  height: 1px;
  border: 0;
  margin: 10px 0 0 0;
  width: 100%;
  background-color: #f2f2f2;
}

.message-troop-share-card div {
  padding-top: 10px;
}

.message-troop-share-card div img {
  height: 50px;
  width: 50px;
  vertical-align: middle;
  border-radius: 50%;
  margin-left: 10px;
}

.message-troop-share-card div span {
  vertical-align: middle;
  margin: 10px;
}

.text-muted {
  margin-left: 10px;
}
</style>