<script>
import { h } from 'vue'
import { fetchDisplayName } from "../../utils/backend-api.js";
import { parseMessagePreview } from "../../utils/parse-message.js";

export default {
  name: "ReplyMessage",
  props: {
    id: [String, Number],
    out: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      msg: {},
      name: '',
    }
  },
  inject: ['scrollToMidwayMsg', 'findMessage'],
  computed: {
    is_group() {
      return this.msg?.message_type === 'group'
    },
    content() {
      const msg = this.msg
      return {
        name: "Content",
        render() {
          let child = []
          if (msg) {
            child = parseMessagePreview(msg.event, false, true)
          }

          return h(
            "div",
            {
              class: "content text-truncate"
            },
            child
          )
        }
      }
    },
  },
  methods: {
    async get_msg() {
      this.msg = await this.findMessage(this.id)
      // console.log(msg)
    },
    async get_name() {
      const This = this;
      const msg = this.msg

      const result = await fetchDisplayName(
        [msg.group_id, msg.user_id],
        this.is_group ? "group_user" : "private",
        (newName) => {
          This.name = newName
        }
      )
      if (!result.error) {
        this.name = result.name
      }
    },
    isEmptyObject(obj) {
      return typeof obj === 'object' && Object.keys(obj).length === 0;
    },
    async scrollToMidway(msg) {
      this.scrollToMidwayMsg(msg);
    },
    getTotalHeight(element) {
      const style = window.getComputedStyle(element);
      const height = element.offsetHeight;
      const marginTop = parseFloat(style.marginTop);
      const marginBottom = parseFloat(style.marginBottom);
      return height + marginTop + marginBottom;
    }
  },
  async mounted() {
    await this.get_msg()
    if (this.msg) {
      const wrapper = this.$refs.container?.closest('.simplebar-content-wrapper')
      if (wrapper) {
        wrapper.scrollTop += this.getTotalHeight(this.$refs.container)
      }
      await this.get_name()
    }
  }
}
</script>

<template>
  <div
    class="reply-message no-user-select"
    v-if="!isEmptyObject(msg)"
    :style="{ color: '#5a5a5a' }"
    @click="scrollToMidway(msg)"
    ref="container"
  >
    <div class="header">
      <p class="user-name">{{ name }}</p>
      <svg class="top_24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd"
              d="M12.75 21.75L12.75 8.56066L19.4697 15.2803L20.5303 14.2197L12.5303 6.21967C12.2374 5.92678 11.7626 5.92678 11.4697 6.21967L3.46967 14.2197L4.53033 15.2803L11.25 8.56066L11.25 21.75H12.75ZM4 3.5H20V5H4V3.5Z"
              fill="currentColor"></path>
      </svg>
    </div>
    <component :is="content" v-if="!isEmptyObject(msg)"></component>
  </div>
</template>

<style scoped>
.reply-message {
  border-radius: 2px;
  border-left: 2px solid rgba(131, 131, 131, 0.5);
  min-height: 50px;
  margin-bottom: 6px;
  font-size: 12px;
  padding: 2px 8px 0 8px;
  cursor: default;
}

.reply-message:hover {
  background-color: rgb(0 0 0 / 5%);;
}

.top_24 {
  height: 14px;
  width: 14px;
  margin: 0 0 0 4px;
}

.header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.user-name {
  margin: 0;
}

.user-name:deep(.msg-preview-emoji) {
  height: 16px !important;
  width: 16px;
  top: 0 !important;
}
</style>

<style>
.message-reply-image, .message-reply-video {
  max-height: 80px;
  max-width: 100%;
  border-radius: 4px;
}

.message-reply-image {
  margin-bottom: 8px;
}


.message-reply-file-icon {
  width: 16px;
  height: 16px;
  vertical-align: middle;
  margin-right: 5px;
}

.message-reply-file {
  vertical-align: middle;
}
</style>