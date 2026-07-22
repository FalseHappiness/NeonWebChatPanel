<script>
import { defineComponent } from 'vue'
import ForwardMessageContentsViewer from "../utils/ForwardMessageContentsViewer.vue";

export default defineComponent({
  name: "ForwardMessageElement",
  components: { ForwardMessageContentsViewer },
  props: {
    messages: Array
  },
  data() {
    return {
      isShowMessagesViewer: false
    }
  }
})
</script>

<template>
  <div class="message-box-less message-forward-message no-user-select" @click="isShowMessagesViewer = true">
    <ForwardMessageContentsViewer
      :messages="messages"
      v-if="isShowMessagesViewer && messages"
      :on-close="()=>{isShowMessagesViewer = false}"/>
    <div class="top-side">
      <p class="title text-truncate">
        <slot name="source"></slot>
      </p>
      <slot name="news"></slot>
    </div>
    <div class="footer">
      <hr>
      <span class="forward-message-count">
        <slot name="summary"></slot>
      </span>
    </div>
  </div>
</template>

<style scoped>
.message-forward-message {
  width: 220px;
  max-width: 100%;
  display: flex;
  background-color: white;
  color: black;
  text-decoration: none !important;
  border-radius: 8px;
  padding: 10px;
  flex-direction: column;
  justify-content: space-between;
}

hr {
  height: 1px;
  border: 0;
  margin: 5px 0 0 0;
  width: 100%;
  background-color: #f2f2f2;
}

.footer {
  height: 24px;
  white-space: nowrap;
}

.title {
  margin-bottom: 2px;
}

.forward-message-count {
  color: gray;
  font-size: 12px;
}

.message-forward-message:deep(.forward-message-preview) {
  margin: 0;
  font-size: 12px;
  line-height: 20px;
  color: #999999 !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap
}
</style>