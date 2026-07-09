<script>
import { defineComponent } from 'vue'
import TroopShareCard from "./TroopShareCard.vue";

export default defineComponent({
  name: "ContactLua",
  components: { TroopShareCard },
  props: { json: Object }
})
</script>

<template>
  <TroopShareCard :json="json" class="message-contact-lua"></TroopShareCard>
</template>

<style scoped>

</style>