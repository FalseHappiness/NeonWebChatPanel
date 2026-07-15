<script>
import { defineComponent } from 'vue'
import BasicBoxWithFooter from "./BasicBoxWithFooter.vue";

export default defineComponent({
  name: "ActivityMD",
  components: { BasicBoxWithFooter },
  props: { json: Object },
  computed: {
    activity() {
      return this.json?.meta?.activity;
    }
  },
  methods: {
    handleButton(e) {
      e.stopPropagation()
    }
  }
})

</script>

<template>
  <BasicBoxWithFooter
    class="message-activity-md"
    :footer-icon="activity.tagIcon"
    :footer-text="activity.tag"
    :jump-url="activity.jumpUrl?.jumpUrl">
    <img alt="" :src="activity.preview" class="activity-md-preview-img">
    <p class="desc-text">{{ activity.desc }}</p>
    <a class="activity-md-button"
       v-if="activity.isEnabledButton"
       @click="handleButton"
       :href="activity.buttonJumpUrl?.jumpUrl"
       target="_blank">
      {{ activity.buttonText }}
    </a>
  </BasicBoxWithFooter>
</template>

<style scoped>
.activity-md-preview-img {
  width: 100%;
  max-height: 500px;
  border-radius: 5px;
  margin: 5px 0;
}

.desc-text {
  font-size: 80%;
  margin: 2px 0;
}

.activity-md-button {
  color: white;
  border-radius: 15px;
  background-color: #0099ff;
  margin: 5px 0 10px 0;
  padding: 5px;
  text-align: center;
  cursor: pointer;
  font-size: 12px;
  display: block;
}
</style>