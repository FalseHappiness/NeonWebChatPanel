<script>
import { defineComponent } from 'vue'
import { getFileIcon, formatFileSize } from "../MessageTypes/FileMessage.vue";
import TruncatedText from "./TruncatedText.vue";
import SimpleBar from "simplebar-vue";
import 'simplebar-vue/dist/simplebar.min.css';
import SimplePopUp from "./SimplePopUp.vue";

export default defineComponent({
  name: "FilesConfirm",
  components: { SimplePopUp, SimpleBar, TruncatedText },
  props: {
    contactName: {
      type: String,
      default: '未知联系人'
    },
    files: {
      type: Array,
      required: true
    },
    onConfirm: {
      type: Function,
      default: new Function()
    },
    onCancel: {
      type: Function,
      default: new Function()
    }
  },
  methods: {
    getFileIcon: getFileIcon,
    formatFileSize: formatFileSize,
    confirm(confirm = true) {
      this.$refs.popUp.confirm(confirm, this.files)
    }
  }
})
</script>

<template>
  <div class="files-confirm">
    <SimplePopUp ref="popUp" :on-confirm="onConfirm" :on-cancel="onCancel">
      <template #default>
        <div class="files-confirm-title">
          发送给 {{ contactName }}
          <img alt="" src="/QQ/icons/close_fill_24.svg" class="files-confirm-close-btn cannot-drag"
               @click="confirm(false)">
        </div>
        <div class="files-confirm-files">
          <SimpleBar class="files-confirm-files-scroller" data-simplebar data-simplebar-auto-hide="false">
            <div class="files-confirm-file" v-for="(value) in files">
              <img alt="" :src="'/QQ/fileIcon/' + getFileIcon(value.name)" class="files-confirm-file-icon">
              <div class="files-confirm-file-info">
                <TruncatedText one-line :content="value.name"/>
                <span class="files-confirm-file-size">{{ formatFileSize(value.size) }}</span>
              </div>
            </div>
          </SimpleBar>
        </div>
        <div class="files-confirm-confirm-button no-user-select" @click="confirm()">发送({{ files.length }})</div>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.files-confirm-title {
  text-align: center;
}

.files-confirm-close-btn {
  float: right;
  width: 25px;
  height: 25px;
  position: absolute;
  right: 5px;
  top: 5px;
  cursor: pointer;
}

.files-confirm-files {
  flex: 1;
  overflow: hidden;
  margin: 5px 0;
}

.files-confirm-confirm-button {
  height: 45px;
  border-radius: 12px;
  background-color: #0099ff;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: default;
}

.files-confirm-confirm-button:hover {
  background-color: #0089df;
}

.files-confirm-confirm-button:active {
  background-color: #0077c3;
  color: rgba(255, 255, 255, 0.6);
}

.files-confirm-file {
  display: flex;
  align-items: center;
  flex-direction: row;
}

.files-confirm-file-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  flex-wrap: nowrap;
  justify-content: center;
}

.files-confirm-file-icon {
  width: 40px;
  height: 40px;
  margin: 5px;
}

.files-confirm-file-size {
  font-size: 12px;
  color: gray;
  margin-top: -5px;
}

.files-confirm-files-scroller {
  height: 100%;
}
</style>

<style>
.files-confirm-files .resizable-r {
  width: 8px !important;
}

.files-confirm-files .simplebar-scrollbar {
  visibility: hidden;
  opacity: 0.3;
}

.files-confirm-files .simplebar-scrollbar:before {
  width: 7px;
  left: 3.5px;
}

.files-confirm-files:hover .simplebar-scrollbar, .files-confirm-files.simplebar-dragging .simplebar-scrollbar {
  visibility: visible;
}
</style>