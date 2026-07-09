<script setup>
import { computed } from 'vue'
import ContactItem from './ContactItem.vue'
import VueResizable from 'vue-resizable';
import VirtualScroller from "./utils/VirtualScroller.vue";

const props = defineProps({
  contacts: Array,
  activeContact: Object,
  loading: Boolean,
})

const emit = defineEmits(['select'])

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

const sidebarResize = ({ width }) => {
  document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
}
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
    <div class="p-3 border-bottom" style="height: 52px">
      <h4>联系人</h4>
    </div>
    <div v-if="loading" style="text-align: center">加载中...</div>
    <VirtualScroller :item-height="68"
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
  background: white;
  height: 100% !important;
  overflow: hidden;
  border-right: 1px solid #dee2e6;
  flex: none;
  max-width: calc(100% - 390px);
  display: flex;
  flex-direction: column;
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