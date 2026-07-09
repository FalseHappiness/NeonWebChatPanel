<script>
import { defineComponent, h } from 'vue'
import { parseMessagePreview } from "../utils/parse-message.js";
import { fetchDisplayName } from "../utils/backend-api.js";
import ColorSvg from "./utils/ColorSvg.vue";

export default defineComponent({
  name: "InputQuote",
  components: { ColorSvg },
  props: {
    msg: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      name: undefined,
    }
  },
  computed: {
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
  emits: ['cancel-quote-message'],
  methods: {
    async get_name() {
      const This = this;
      const msg = this.msg

      const result = await fetchDisplayName(
        [msg.group_id, msg.user_id],
        (this.msg.message_type === 'group') ? "group_user" : "private",
        (newName) => {
          This.name = newName
        }
      )
      if (!result.error) {
        this.name = result.name
      }
    },
  },
  mounted() {
    this.name = JSON.parse(this.msg.event).sender.nickname
    this.get_name()
  }
})
</script>

<template>
  <div class="message-input-quote-container">
    <div class="quoted-message">
      <div class="quote-name">{{ name }}:</div>
      <div class="quoted-msg-content-container">
        <component :is="content" v-if="msg"></component>
        <color-svg src="/static/assets/gg--close-o.svg"
                   class="remove-quote-btn"
                   @click="$emit('cancel-quote-message')"></color-svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quoted-message {
  background-color: rgb(0 0 0 / 5%);
  min-height: 20px;
  cursor: default;
  display: inline-block;
  padding: 5px 10px;
  border-radius: 8px;
  max-width: 100%;
}

.quote-name {
  font-size: 14px;
}

.remove-quote-btn {
  background-color: gray;
  width: 15px;
  height: 15px;
  margin: 0 0 2px 10px;
}

.quoted-msg-content-container {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
}

.quoted-message:deep(.msg-preview-emoji) {
  height: 16px;
  width: 16px;
}

.content {
  flex: 1;
}
</style>