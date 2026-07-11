<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ContactItem from './ContactItem.vue'
import VueResizable from 'vue-resizable';
import VirtualScroller from "./utils/VirtualScroller.vue";
import { fetchSetLongNick, getUserLogo } from "../utils/backend-api.js";

const props = defineProps({
  contacts: Array,
  activeContact: Object,
  loading: Boolean,
  selfInfo: Object
})

const emit = defineEmits(['select', 'change-self-long-nick'])

// 按最后联系时间排序
const sortedContacts = computed(() => {
  return [...props.contacts].sort((a, b) =>
    (b.last_timestamp || 0 - a.last_timestamp || 0) ||
    (new Date(b.last_time) - new Date(a.last_time))
  );
})

const selectContact = (contact) => {
  emit('select', contact)
}

// 判断是否为当前选中联系人
const isActive = (contact) => {
  return props.activeContact &&
    props.activeContact.contact_id === contact.contact_id &&
    props.activeContact.type === contact.type
}

const selfLongNickModel = ref("")

watch(() => props.selfInfo?.long_nick, newVal => {
  selfLongNickModel.value = newVal
})

const sidebarResize = ({ width }) => {
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
}

const handleChangeLongNick = async () => {
  if (props.selfInfo?.long_nick !== selfLongNickModel.value) {
    emit('change-self-long-nick', selfLongNickModel.value)
  }
}

onMounted(() => {
  selfLongNickModel.value = props.selfInfo?.long_nick || ""
})
</script>

<template>
  <vue-resizable
    class="sidebar"
    :active="['r']"
    :width="250"
    :minWidth="180"
    :maxWidth="335"
    @resize:move="sidebarResize"
  >
    <div class="contacts-top-side">
      <div class="self-info-container" v-if="selfInfo">
        <img alt="" :src="getUserLogo(selfInfo.user_id)" class="self-info-logo">
        <div class="self-info-card">
          <span class="self-info-nickname">{{ selfInfo.nickname }}</span>
          <input placeholder="编辑个性签名"
                 @blur="handleChangeLongNick"
                 v-model="selfLongNickModel"
                 class="text-muted self-info-long-nick overflow-ellipsis">
        </div>
      </div>
    </div>
    <div v-if="loading" style="text-align: center">加载中...</div>
    <VirtualScroller :item-height="60"
                     :items="sortedContacts"
                     v-else
                     class="contacts-list"
                     :thumb-right="1" :thumb-width="7">
      <template #default="{ item: contact }">
        <ContactItem
          :key="contact.contact_id + '-' + contact.type"
          :contact="contact"
          :active="isActive(contact)"
          @select="selectContact"
        />
      </template>
    </VirtualScroller>
  </vue-resizable>
</template>

<style scoped>
.contacts-list {
  /*height: calc(100% - 52px);*/
  flex: 1;
}

.sidebar {
  width: 250px;
  background: #F5F5F5;
  height: 100% !important;
  overflow: hidden;
  border-right: 1px solid #dee2e6;
  flex: none;
  max-width: calc(100% - 390px);
  display: flex;
  flex-direction: column;
}

.contacts-top-side {
  height: 60px;
  background-image: url(/QQ/app/img/minicard.bg.c44eefb168ed8bd4d8e2.png),
  linear-gradient(to top, #F5F5F5, #F0F0F0);
  background-repeat: no-repeat, no-repeat;
  background-size: 100%, 100%;
  background-clip: padding-box, border-box;
}

.self-info-container {
  display: flex;
  padding: 10px;
}

.self-info-logo {
  width: 40px;
  height: 40px;
  border: 2px solid white;
  border-radius: 50%;
  margin-right: 10px;
}

.self-info-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 16px;
}

.self-info-nickname {
  font-size: 16px;
}

.self-info-long-nick {
  color: #808080 !important;
  background: transparent;
  outline: none;
  border: 1px solid transparent;
  padding: 1px;
  border-radius: 3px;
  margin-top: 2px;
}

.self-info-long-nick:focus {
  border: 1px solid #0099ff;
}

@media (max-width: 570px) {
  .sidebar {
    width: 100% !important;
    max-width: 100%;
  }
}
</style>

<style>
:root {
  --sidebar-width: 250px;
}
</style>