<script>
import { defineComponent } from 'vue'
import { getFileIcon, formatFileSize } from "../MessageTypes/FileMessage.vue";
import TruncatedText from "./TruncatedText.vue";
import SimpleBar from "simplebar-vue";
import 'simplebar-vue/dist/simplebar.min.css';
import SimplePopUp from "./SimplePopUp.vue";
import CustomScrollBar from "./CustomScrollBar.vue";

export default defineComponent({
  name: "FilesUploadTasksViewer",
  components: { CustomScrollBar, SimplePopUp, SimpleBar, TruncatedText },
  props: {
    tasks: {
      type: Array,
      required: true
    },
    onClose: {
      type: Function,
      default: () => {
      }
    }
  },
  methods: {
    getFileIcon: getFileIcon,
    formatFileSize: formatFileSize,
    close() {
      this.$refs.popUp.confirm(false)
    },
    cancelTask(task) {
      if (task.controller && !task.controller.signal.aborted) {
        task.controller.abort()
      }
    },
    /**
     * 计算单个任务已上传的字节数
     * 对于分片上传：chunk_index * chunk_size
     * 对于普通上传：如果已完成则为 file.size，否则为 0（无法追踪进度）
     */
    getTaskUploadedBytes(task) {
      if (task.chunked && task.chunk_index !== undefined && task.chunk_size !== undefined) {
        return task.chunk_index * task.chunk_size
      }
      // 非分片上传，如果已取消或已完成则显示全部
      if (task.controller?.signal?.aborted) {
        return 0
      }
      return 0
    },
    /**
     * 判断任务是否已完成（所有分片已发送）
     */
    isTaskCompleted(task) {
      return task.completed
    },
    /**
     * 判断任务是否已取消
     */
    isTaskCancelled(task) {
      return task.controller?.signal?.aborted || task?.cancelled
    },
    /**
     * 判断任务是否出错
     */
    isTaskError(task) {
      return task?.error
    },
    /**
     * 计算任务的上传速度 (bytes/ms)
     */
    getTaskSpeed(task) {
      const uploadedBytes = this.getTaskUploadedBytes(task)
      if (uploadedBytes <= 0 || !task.start_timestamp) return 0
      const elapsed = Date.now() - task.start_timestamp
      if (elapsed <= 0) return 0
      return uploadedBytes / elapsed // bytes per ms
    },
    /**
     * 计算任务预计剩余时间 (ms)
     */
    getTaskRemainingTime(task) {
      const speed = this.getTaskSpeed(task)
      if (speed <= 0) return Infinity
      const uploadedBytes = this.getTaskUploadedBytes(task)
      const remaining = task.file.size - uploadedBytes
      if (remaining <= 0) return 0
      return remaining / speed
    },
    /**
     * 获取单个任务进度百分比
     */
    getTaskProgress(task) {
      if (this.isTaskCompleted(task)) return 100
      if (this.isTaskCancelled(task)) return 0
      const uploaded = this.getTaskUploadedBytes(task)
      const total = task.file.size
      if (total <= 0) return 0
      return Math.min(100, (uploaded / total) * 100)
    },
    /**
     * 格式化时间显示
     */
    formatTime(ms) {
      if (!isFinite(ms) || ms <= 0) return ''
      if (ms < 1000) return '1秒'
      const seconds = Math.ceil(ms / 1000)
      if (seconds < 60) return `${seconds}秒`
      const minutes = Math.floor(seconds / 60)
      const secs = seconds % 60
      if (minutes < 60) return `${minutes}分${secs}秒`
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return `${hours}时${mins}分`
    },
    /**
     * 格式化速度显示
     */
    formatSpeed(speedBps) {
      // speedBps 是 bytes/ms，转换为 bytes/s
      const bytesPerSec = speedBps * 1000
      if (bytesPerSec <= 0) return ''
      if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(1)} B/s`
      if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
      return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
    }
  }
})
</script>

<template>
  <div class="files-upload-tasks-viewer">
    <SimplePopUp ref="popUp" :on-confirm="onClose" :on-cancel="onClose">
      <template #default>
        <div class="files-upload-tasks-title">
          文件上传任务
          <img alt="" src="/QQ/icons/close_fill_24.svg" class="files-upload-tasks-close-btn cannot-drag"
               @click="close()">
        </div>

        <!-- 任务列表 -->
        <CustomScrollBar class="files-upload-tasks-list">
          <div class="files-upload-tasks-item" v-for="(task, index) in tasks" :key="`${index}-${task?.chunk_index}`">
            <img alt="" :src="'/QQ/fileIcon/' + getFileIcon(task.file.name)" class="files-upload-tasks-item-icon">
            <div class="files-upload-tasks-item-info">
              <TruncatedText one-line :content="task.file.name"/>
              <div class="files-upload-tasks-item-status">
                <!-- 出错 -->
                <template v-if="isTaskError(task)">
                  <span class="status-error">出错: {{ task.error }}</span>
                </template>
                <!-- 已取消 -->
                <template v-if="isTaskCancelled(task)">
                  <span class="status-cancelled">已取消</span>
                </template>
                <!-- 已完成 -->
                <template v-else-if="isTaskCompleted(task)">
                  <span class="status-completed">已完成</span>
                </template>
                <!-- 计算 Hash 中 -->
                <template v-else-if="task.is_calc_hash">
                  <span class="status-hashing">计算 SHA256 中...</span>
                </template>
                <!-- 分片上传中 -->
                <template v-else-if="task.chunked">
                    <span class="status-uploading">
                      {{ formatFileSize(getTaskUploadedBytes(task)) }} / {{ formatFileSize(task.file.size) }}
                    </span>
                  <span class="status-speed" v-if="getTaskSpeed(task) > 0">
                      {{ formatSpeed(getTaskSpeed(task)) }}
                    </span>
                  <span class="status-remaining"
                        v-if="getTaskRemainingTime(task) > 0 && isFinite(getTaskRemainingTime(task))">
                      剩约 {{ formatTime(getTaskRemainingTime(task)) }}
                    </span>
                  <!-- 单个文件进度条 -->
                  <div class="files-upload-tasks-item-progress-bar-container">
                    <div class="files-upload-tasks-item-progress-bar"
                         :style="{ width: getTaskProgress(task) + '%' }"></div>
                  </div>
                </template>
                <!-- 普通上传中 -->
                <template v-else>
                  <span class="status-uploading">上传中...</span>
                </template>
              </div>
            </div>
            <div class="files-upload-tasks-item-action">
              <div v-if="!isTaskCompleted(task) && !isTaskCancelled(task)"
                   class="files-upload-tasks-cancel-btn"
                   @click="cancelTask(task)">
                取消
              </div>
            </div>
          </div>
        </CustomScrollBar>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.files-upload-tasks-title {
  text-align: center;
  font-weight: bold;
  font-size: 14px;
  padding: 5px 0;
}

.files-upload-tasks-close-btn {
  float: right;
  width: 25px;
  height: 25px;
  position: absolute;
  right: 5px;
  top: 5px;
  cursor: pointer;
}

.files-upload-tasks-list {
  flex: 1;
  overflow: hidden;
  margin: 5px 0;
}

.files-upload-tasks-item {
  display: flex;
  align-items: center;
  flex-direction: row;
  padding: 6px 4px;
  border-bottom: 1px solid #f0f0f0;
}

.files-upload-tasks-item:last-child {
  border-bottom: none;
}

.files-upload-tasks-item-icon {
  width: 36px;
  height: 36px;
  margin: 4px 8px 4px 0;
  flex-shrink: 0;
}

.files-upload-tasks-item-info {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.files-upload-tasks-item-status {
  font-size: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  color: #888;
}

.status-uploading {
  color: #0099ff;
  margin-right: 6px;
}

.status-completed {
  color: #52c41a;
}

.status-cancelled {
  color: #999;
}

.status-hashing {
  color: #999;
}

.status-speed {
  color: #666;
  margin-right: 6px;
}

.status-remaining {
  color: #999;
}

.status-error {
  color: #FF4D4F;
}

.files-upload-tasks-item-progress-bar-container {
  width: 100%;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  margin-top: 3px;
  overflow: hidden;
}

.files-upload-tasks-item-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #0099ff, #00ccff);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.files-upload-tasks-item-action {
  flex-shrink: 0;
  margin-left: 8px;
}

.files-upload-tasks-cancel-btn {
  font-size: 12px;
  color: #ff4d4f;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #ff4d4f;
}

.files-upload-tasks-cancel-btn:hover {
  background: #fff1f0;
}

.files-upload-tasks-cancel-btn:active {
  background: #ffccc7;
}
</style>