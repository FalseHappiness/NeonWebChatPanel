<script setup>
import { computed } from "vue";
import { getCacheGroupLevelTitle } from "../utils/backend-api.js";

const props = defineProps({
  group_id: {
    type: Number,
    required: true,
  },
  user_id: {
    type: Number,
    required: true,
  },
})

const info = computed(() => {
  return getCacheGroupLevelTitle(props.group_id, props.user_id);
})

const title = computed(() => {
  const data = info.value;
  const role = data.role;
  const title = data.title;
  // console.log(role, title, data)
  if (title) {
    return ` ${title}`
  } else if (role === 'owner') {
    return ` 群主`
  } else if (role === 'admin') {
    return ` 管理员`
  }
  return "";
})

const colorClass = computed(() => {
  const data = info.value;
  const role = data.role;
  const title = data.title;
  if (role === 'owner') {
    return "owner"
  } else if (role === 'admin') {
    return "admin"
  } else if (title) {
    return "has-title"
  } else {
    return ""
  }
})
</script>

<template>
  <div class="message-group-level-title-container">
    &nbsp;<span v-if="!info.is_robot" class="message-group-level-title" :class="colorClass">LV{{
      info.level || 0
    }}{{ title }}</span>
    <img v-else-if="info.is_robot" src="/QQ/icons/robot_label_16.svg" class="robot-icon" alt="">
  </div>
</template>

<style scoped>
.message-group-level-title-container {
  display: inline-block
}

.message-group-level-title {
  display: inline-block;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  vertical-align: middle;
  color: white;
  background: linear-gradient(111deg, #a7abbf, #b1b5c3);
}

.admin {
  background: linear-gradient(111deg, #36d6c6, #55ead7);
}

.has-title {
  background: linear-gradient(111deg, #c28cfb, #dd9ef3);
}

.owner {
  background: linear-gradient(111deg, #ff9d00, #ffd400);
}

.robot-icon {
  border-radius: 4px;
  width: 17px;
  height: 17px;
  display: inline-block;
  margin-top: -2px;
}
</style>