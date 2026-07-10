<!-- ContactItem.vue -->
<script setup>
import { computed, ref, onMounted, h, watch } from "vue";
import { parseMessagePreview, parseNoticePreview } from "../utils/parse-message.js";
import { fetchDisplayName, getCacheName } from "../utils/backend-api.js";
import { basicContextItem, vCustomMenu } from "../utils/context-menu.js";
import { copy } from "../utils/clipboard.js";
import { formatRelativeTime } from "../utils/others.js";

const props = defineProps({
  contact: {
    type: Object,
    required: true
  },
  active: {
    type: Boolean,
    default: false
  },
})

const emit = defineEmits(['select'])

const displayName = ref('') // 使用ref来管理名称状态
const isLoading = ref(false) // 加载状态
const isError = ref(false) // 错误状态


const handleClick = () => {
  emit('select', props.contact)
}

// 获取显示名称的函数
const getName = async () => {
  try {
    if ([
      2747277822 // QQ 游戏中心
    ].includes(props.contact.contact_id)) {
      return
    }
    isLoading.value = true;
    let event = props.contact.latest_msg;
    if (typeof event === 'string') event = JSON.parse(event);
    let id = props.contact.contact_id;
    let type = props.contact.type;
    if (type === 'private' && event?.group_id) {
      id = [event.group_id, id]
      type = 'group_user'
    }
    const result = await fetchDisplayName(
      id,
      type,
      (newName) => {
        if (displayName.value !== newName) {
          displayName.value = newName;
        }
      }
    );

    if (result.name !== displayName.value) {
      displayName.value = result.name;
    }
    isError.value = result.error;
  } catch (error) {
    console.error('Error in getName:', error);
    isError.value = true;
  } finally {
    isLoading.value = false;
  }
};

// 点击名称重新获取
const handleNameClick = (e) => {
  // e.stopPropagation()
  // getName()
}

const previewSenderName = ref("");
const previewMessage = ref([])

const getPreviewText = async () => {
  try {
    const isGroup = props.contact.type === 'group';
    let event = props.contact.latest_msg;
    if (typeof event === 'string') event = JSON.parse(event);
    // console.log(props.contact);
    const isMessage = ['message_sent', 'message'].includes(event?.post_type)
    const isNotice = event?.post_type === 'notice'

    let display_name = props.contact.name;
    /*
    if (!isGroup) {
      display_name = event.self_id === event.user_id ? '呼' : '应';
    }
     */
    if (isMessage && isGroup) {
      const id = [event.group_id, event.user_id];
      const type = "group_user";
      const fetchResult = await fetchDisplayName(id, type);
      display_name = fetchResult.error ? display_name : fetchResult.name;
    }

    let parsedMessage = []
    if (isMessage) {
      parsedMessage = await parseMessagePreview(event, true);
    } else if (isNotice) {
      // console.log('notice', props.contact, event)
      parsedMessage = await parseNoticePreview(event, true)
    }

    previewSenderName.value = display_name
    previewMessage.value = parsedMessage
  } catch (error) {
    console.error('Error in getPreviewText:', error);

    previewSenderName.value = ""
    previewMessage.value = []
  }
}

watch(() => props.contact.latest_msg, async () => {
  try {
    await getPreviewText();
  } catch (error) {
    console.error('Error in ContactItem get preview text:', error);
  }
})

const computedPreviewText = computed(() => {
  let children = []
  if (previewMessage.value) {
    const isGroup = props.contact.type === 'group';
    let event = props.contact.latest_msg;
    if (typeof event === 'string') event = JSON.parse(event);
    const isMessage = ['message_sent', 'message'].includes(event?.post_type)

    if ((isMessage && isGroup && previewSenderName.value) || !isMessage || !isGroup) {
      children = [
        ...(
          (isMessage && isGroup) ? [previewSenderName.value, ': '] : []
        ),
        ...previewMessage.value
      ]
    }
  }
  return () => h(
    "small",
    { class: "text-muted overflow-ellipsis" },
    children
  );
});


// 计算显示Logo
const logoUrl = computed(() => {
  return props.contact.type === 'group'
    ? `https://p.qlogo.cn/gh/${props.contact.contact_id}/${props.contact.contact_id}/100`
    : `https://q1.qlogo.cn/g?b=qq&nk=${props.contact.contact_id}&s=100`
})

const customContextMenu = () => {
  return [
    basicContextItem(
      props.contact.type === 'group' ? "复制群号" : "复制 QQ 号",
      () => {
        copy(props.contact.contact_id)
      },
      "/QQ/icons/copy_24.svg"
    )
  ]
}

watch(() => props.contact?.name, newName => {
  displayName.value = newName
})

// 组件挂载时获取名称
onMounted(async () => {
  try {
    displayName.value = props.contact.name
    await getPreviewText()
    await getName();
  } catch (error) {
    console.error('Error in ContactItem mounted:', error);
  }
});
</script>

<template>
  <div
    class="contact-item"
    :class="{ active }"
    v-custom-menu="customContextMenu"
    @click="handleClick"
  >
    <img alt="" :src="logoUrl" class="contact-logo">
    <div class="contact-info">
      <div class="d-flex justify-content-between">
        <span
          @click="handleNameClick"
          class="contact-name overflow-ellipsis"
          :class="{
            'text-muted': isLoading,
            'text-error': isError,
            'cursor-pointer': true
          }"
        >
          {{ displayName }}
        </span>
        <small class="text-muted">{{ formatRelativeTime(contact.last_time) }}</small>
      </div>
      <computed-preview-text/>
    </div>
  </div>
</template>

<style scoped>
.contact-item {
  padding: 10px;
  cursor: pointer;
  /*border-bottom: 1px solid #eee;*/
  display: flex;
  align-items: center;
  height: 60px;
  margin: 5px 4px;
  border-radius: 6px;
}

.contact-item:hover {
  background-color: #EBEBEB;
}

.contact-item:active {
  background-color: #e0e0e0;
}

.contact-item.active {
  background-color: #E2E2E2 !important;
}

.contact-item.active:active {
  background-color: #D7D7D7 !important;
}

.contact-logo {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  float: left;
  margin-right: 10px;
}

.contact-info {
  flex: 1;
  line-height: 18px;
  /*max-width: calc(100% - 60px);*/
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-muted {
  font-size: 12px;
  white-space: nowrap;
}

.contact-name {
  font-size: 16px !important;
}

.text-error {
  color: #dc3545 !important;
}

.contact-item.active .text-error {
  color: #ff8894 !important;
}

.contact-item.active .contact-name.text-muted {
  opacity: 0.5;
}

.cursor-pointer {
  cursor: pointer;
}

.contact-item:deep(.msg-preview-emoji) {
  height: 15px;
  margin: -2px 1px 0 1px;
}
</style>