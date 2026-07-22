<script>
import { defineComponent } from 'vue'
import { fetchDisplayName, fetchForwardMessage, getCacheName } from "../../utils/backend-api.js";
import { parseMessagePreview } from "../../utils/parse-message.js";
import ForwardMessageElement from "./ForwardMessageElement.vue";

export default defineComponent({
  name: "ForwardMessage",
  components: {
    ForwardMessageElement,
    RenderVNode: {
      functional: true,
      props: ['vnode'],
      render() {
        return this.vnode
      }
    }
  },
  props: {
    content: {
      default: undefined,
      type: Array
    },
    id: {
      type: [Number, String],
      required: true
    }
  },
  data() {
    return {
      messages: undefined,
      message_type: undefined,
      private_users: undefined,
      parsedMessages: undefined
    }
  },
  async mounted() {
    if (this.content === undefined) {
      this.messages = await fetchForwardMessage(this.id)
    } else {
      this.messages = this.content
    }
    // console.log(this.messages)
    if (this.messages) {
      const msg = this.messages[0]
      if (msg) {
        this.message_type = msg.message_type
        if (this.message_type === 'private') {
          this.private_users = Object.fromEntries(
            new Map(this.messages.map(message => [message.user_id, message?.sender?.nickname]))
          )
        }
      }
      this.parsedMessages = await Promise.all(
        this.messages.slice(0, 4).map(async message => {
          try {
            return [message?.sender?.nickname, ': ', await parseMessagePreview(message, true)];
          } catch (error) {
            console.error('Failed to parse message:', error);
            return null;
          }
        })
      );
    }
  }
})
</script>

<template>
  <ForwardMessageElement :messages="messages">
    <template #source>
      <span v-if="message_type === 'group'">群聊</span>
      <span v-else-if="message_type === 'private' && typeof private_users === 'object'">{{
          Object.values(private_users).join("和")
        }}</span>
      <span v-else>未知</span>
      <span>的聊天记录</span>
    </template>
    <template #news>
      <p v-for="(vnode, index) in parsedMessages"
         v-if="parsedMessages"
         :key="index"
         class="forward-message-preview"
      >
        <RenderVNode :vnode="vnode"/>
      </p>
    </template>
    <template #summary>
      查看{{ messages === undefined ? "?" : messages.length }}条转发消息
    </template>
  </ForwardMessageElement>
</template>