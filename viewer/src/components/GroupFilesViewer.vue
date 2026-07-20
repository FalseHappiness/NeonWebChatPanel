<script>
import { defineComponent } from 'vue'
import {
  fetchGroupRootFiles,
  fetchGroupFolderFiles,
  fetchGroupFileSysInfo,
  getFileDataUrl, getGroupFileProxyUrl
} from "../utils/backend-api.js";
import { formatTimeOptions } from "../utils/others.js";
import { getFileIcon, formatFileSize } from "./MessageTypes/FileMessage.vue";
import CustomScrollBar from "./utils/CustomScrollBar.vue";
import SimplePopUp from "./utils/SimplePopUp.vue";
import TruncatedText from "./utils/TruncatedText.vue";

export default defineComponent({
  name: "GroupFilesViewer",
  components: { TruncatedText, SimplePopUp, CustomScrollBar },
  props: {
    group_id: {
      type: [Number, String],
      required: true
    },
    onClose: {
      type: Function,
      default: () => {
      }
    }
  },
  data() {
    return {
      // 当前文件夹路径栈，每个元素 { folder_id, folder_name }
      pathStack: [],
      // 当前文件夹下的文件列表
      files: [],
      // 当前文件夹下的文件夹列表
      folders: [],
      // 加载中
      loading: false,
      // 文件系统信息
      fileSysInfo: null,
      // 排序方式: 'new_first' | 'old_first' | 'large_first' | 'small_first'
      sortBy: 'new_first',
      // 文件夹排列方式: 'before' 文件夹在前 | 'mixed' 混合排序
      folderOrder: 'before',
      // 错误信息
      error: null
    }
  },
  computed: {
    // 当前文件夹名称
    currentFolderName() {
      if (this.pathStack.length === 0) return '根目录'
      return this.pathStack[this.pathStack.length - 1].folder_name
    },
    // 存储空间使用百分比
    storagePercent() {
      if (!this.fileSysInfo || !this.fileSysInfo.total_space) return 0
      return Math.min(100, (this.fileSysInfo.used_space / this.fileSysInfo.total_space) * 100)
    },
    // 排序后的完整列表（文件夹 + 文件）
    sortedItems() {
      // 构建文件夹项
      const folderItems = this.folders.map(f => ({
        type: 'folder',
        id: f.folder_id,
        name: f.folder_name,
        file_size: 0,
        create_time: f.create_time || 0,
        creator: f.creator,
        creator_name: f.creator_name,
        last_upload_time: f.last_upload_time,
        last_uploader: f.last_uploader,
        last_uploader_name: f.last_uploader_name,
        total_file_count: f.total_file_count,
        modify_time: f.last_upload_time || 0,
        raw: f
      }))

      // 构建文件项
      const fileItems = this.files.map(f => ({
        type: 'file',
        id: f.file_id,
        name: f.file_name,
        file_size: f.file_size || f.size || 0,
        modify_time: f.modify_time || 0,
        uploader: f.uploader,
        uploader_name: f.uploader_name,
        download_times: f.download_times || 0,
        raw: f
      }))

      // 排序函数
      const sortCompare = (a, b) => {
        const isFolderA = a.type === 'folder'
        const isFolderB = b.type === 'folder'
        const isAllFolder = isFolderA && isFolderB
        switch (this.sortBy) {
          case 'new_first':
            return b.modify_time - a.modify_time
          case 'old_first':
            return a.modify_time - b.modify_time
          case 'large_first':
            return isAllFolder ? b.total_file_count - a.total_file_count : b.file_size - a.file_size
          case 'small_first':
            return isAllFolder ? a.total_file_count - b.total_file_count : a.file_size - b.file_size
          default:
            return 0
        }
      }

      if (this.folderOrder === 'before') {
        // 文件夹在前，文件在后，各自内部排序
        folderItems.sort(sortCompare)
        fileItems.sort(sortCompare)
        return [...folderItems, ...fileItems]
      } else {
        // 混合排序
        const allItems = [...fileItems]
        if (!this.isSizeBasedSortBy) {
          allItems.unshift(...folderItems)
        }
        allItems.sort(sortCompare)
        return allItems
      }
    },
    isSizeBasedSortBy() {
      return ['large_first', 'small_first'].includes(this.sortBy)
    }
  },
  methods: {
    formatFileSize,
    getFileIcon,
    formatTime(timestamp) {
      if (!timestamp) return ''
      return formatTimeOptions({
        timestamp,
        alwaysMD: false,
        showSecond: false,
        relative: true,
        showHm: false
      })
    },
    async loadFolder(folder_id) {
      this.loading = true
      this.error = null
      try {
        const data = await fetchGroupFolderFiles(this.group_id, folder_id)
        this.files = data.files || []
        this.folders = data.folders || []
      } catch (e) {
        console.error('加载群文件失败:', e)
        this.error = '加载文件列表失败'
        this.files = []
        this.folders = []
      } finally {
        this.loading = false
      }
    },
    async loadFileSysInfo() {
      try {
        this.fileSysInfo = await fetchGroupFileSysInfo(this.group_id)
      } catch (e) {
        console.error('获取文件系统信息失败:', e)
      }
    },
    async enterFolder(folder) {
      this.pathStack.push({
        folder_id: folder.folder_id,
        folder_name: folder.folder_name
      })
      await this.loadFolder(folder.folder_id)
    },
    goBack() {
      if (this.pathStack.length > 0) {
        this.pathStack.pop()
        const prevFolderId = this.pathStack.length > 0
          ? this.pathStack[this.pathStack.length - 1].folder_id
          : 'root'
        this.loadFolder(prevFolderId)
      }
    },
    goToRoot() {
      this.pathStack = []
      this.loadFolder('root')
    },
    getFileDownloadUrl(fileItem) {
      return getGroupFileProxyUrl(fileItem.raw.group_id, fileItem.id, fileItem.name)
    },
    close() {
      this.$refs.popUp.confirm(false)
    }
  },
  mounted() {
    this.loadFolder('root')
    this.loadFileSysInfo()
  }
})
</script>

<template>
  <div class="group-files-viewer">
    <SimplePopUp ref="popUp"
                 :on-confirm="onClose"
                 :on-cancel="onClose"
                 :container-styles="$style['group-files-viewer-container']">
      <template #default>
        <div class="gv-title">
          群文件
          <img alt="" src="/QQ/icons/close_fill_24.svg" class="gv-close-btn cannot-drag"
               @click="close">
        </div>

        <!-- 工具栏 -->
        <div class="gv-toolbar">
          <!-- 面包屑导航 -->
          <div class="gv-breadcrumb no-scrollbar">
            <span class="gv-breadcrumb-item" @click="goToRoot">全部文件</span>
            <template v-for="(p, idx) in pathStack" :key="idx">
              <span class="gv-breadcrumb-sep">/</span>
              <span class="gv-breadcrumb-item" @click="goBack">{{ p.folder_name }}</span>
            </template>
          </div>

          <!-- 排序和选项 -->
          <div class="gv-controls">
            <select v-model="sortBy" class="gv-select" title="排序方式">
              <option value="new_first">从新到旧</option>
              <option value="old_first">从旧到新</option>
              <option value="large_first">从大到小</option>
              <option value="small_first">从小到大</option>
            </select>
            <select v-model="folderOrder" class="gv-select" title="文件夹排列" v-if="pathStack.length == 0">
              <option value="before">文件夹在前</option>
              <option value="mixed">{{ isSizeBasedSortBy ? "隐藏文件夹" : "混合排序" }}</option>
            </select>
          </div>
        </div>

        <!-- 文件系统信息 -->
        <div v-if="fileSysInfo" class="gv-sys-info">
          <div class="gv-sys-info-text">
            共 {{ fileSysInfo.file_count || 0 }} 个文件
            <template v-if="fileSysInfo.limit_count">
              ，上限 {{ fileSysInfo.limit_count }} 个
            </template>
          </div>
          <div class="gv-storage-bar-wrapper">
            <div class="gv-storage-bar">
              <div class="gv-storage-bar-used" :style="{ width: storagePercent + '%' }"></div>
            </div>
            <span class="gv-storage-text">
              {{ formatFileSize(fileSysInfo.used_space) }} / {{ formatFileSize(fileSysInfo.total_space) }}
            </span>
          </div>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="gv-loading">
          加载中...
        </div>

        <!-- 错误提示 -->
        <div v-else-if="error" class="gv-error">
          {{ error }}
        </div>

        <!-- 文件列表 -->
        <CustomScrollBar v-else class="gv-list">
          <div v-if="sortedItems.length === 0" class="gv-empty">
            暂无文件
          </div>
          <a
            v-for="(item, idx) in sortedItems"
            :key="item.type + '-' + item.id + '-' + idx"
            class="gv-item"
            :class="{ 'gv-item--folder': item.type === 'folder', 'gv-item--file': item.type === 'file' }"
            @click="item.type === 'folder' ? enterFolder(item.raw) : undefined"
            :href="item.type === 'file' ? getFileDownloadUrl(item) : undefined"
            target="_blank"
          >
            <!-- 图标 -->
            <img
              v-if="item.type === 'folder'"
              src="/QQ/fileIcon/folder.png"
              alt=""
              class="gv-item-icon"
            >
            <img
              v-else
              :src="`/QQ/fileIcon/${ getFileIcon(item.name) }`"
              alt=""
              class="gv-item-icon"
            >

            <!-- 信息 -->
            <div class="gv-item-info">
              <TruncatedText :content="item.name" one-line class="gv-item-name"/>
              <div class="gv-item-meta two-lines" v-if="item.type === 'folder'">
                <span class="gv-item-meta-text">{{ item.total_file_count }} 个文件</span>
                <span class="gv-item-meta-text">{{ item.creator_name }} 创建于 {{ formatTime(item.create_time) }}</span>
              </div>
              <div class="gv-item-meta" v-else>
                <span class="gv-item-meta-text">{{ formatFileSize(item.file_size) }}</span>
              </div>
            </div>

            <div class="gv-item-meta-upload-info">
              <template v-if="item.type === 'file'">
                <span class="gv-item-meta-text">{{ formatTime(item.modify_time) }}</span>
                <span class="gv-item-meta-text">来自: {{ item.uploader_name || item.uploader }}</span>
              </template>
              <template v-else>
                <span class="gv-item-meta-text">{{ formatTime(item.last_upload_time) }}</span>
                <span class="gv-item-meta-text">更新: {{ item.last_uploader_name || item.last_uploader }}</span>
              </template>
            </div>
          </a>
        </CustomScrollBar>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.gv-title {
  text-align: center;
  font-size: 16px;
  padding: 0 0 2px 0;
  border-bottom: 1px solid #EDEDED;
  user-select: none;
  position: relative;
}

.gv-close-btn {
  float: right;
  width: 20px;
  height: 20px;
  position: absolute;
  right: 6px;
  top: 1px;
  cursor: pointer;
}

/* 工具栏 */
.gv-toolbar {
  padding: 8px 20px 0 20px;
  display: flex;
  justify-content: space-between;
}

.gv-breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 13px;
  overflow-x: scroll;
  margin-right: 6px;
  flex: 1;
}

.gv-breadcrumb-item {
  color: #4A90D9;
  cursor: pointer;
  white-space: nowrap;
}

.gv-breadcrumb-item:hover {
  color: #2A6CB0;
  text-decoration: underline;
}

.gv-breadcrumb-item:last-child {
  color: #333;
  cursor: default;
  max-width: 180px;
}

.gv-breadcrumb-item:last-child:hover {
  text-decoration: none;
}

.gv-breadcrumb-sep {
  color: #999;
  padding: 0 2px;
}

.gv-controls {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
}

.gv-select {
  font-size: 12px;
  padding: 3px 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  color: #555;
  cursor: pointer;
  outline: none;
}

.gv-select:focus {
  border-color: #4A90D9;
}

/* 系统信息 */
.gv-sys-info {
  padding: 6px 20px;
  font-size: 12px;
  color: #999;
}

.gv-storage-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gv-storage-bar {
  flex: 1;
  height: 6px;
  background: #E0E0E0;
  border-radius: 3px;
  overflow: hidden;
  min-width: 100px;
}

.gv-storage-bar-used {
  height: 100%;
  background: #0099ff;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.gv-storage-text {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

/* 加载中 */
.gv-loading {
  text-align: center;
  color: #999;
  padding: 40px 0;
  font-size: 14px;
}

/* 错误提示 */
.gv-error {
  text-align: center;
  color: #FF6B6B;
  padding: 40px 0;
  font-size: 14px;
}

/* 列表 */
.gv-list {
  flex: 1;
  padding: 4px 0;
  overflow: auto;
  background: white;
  margin: 0 20px 20px 20px;
  border-radius: 8px;
}

.gv-empty {
  text-align: center;
  color: #999;
  padding: 40px 0;
  font-size: 14px;
}

/* 列表项 */
.gv-item {
  display: flex;
  align-items: center;
  padding: 0 12px;
  transition: background-color 0.15s;
  gap: 10px;
  border-bottom: 1px solid #f9f9f9;
  cursor: pointer;
  height: 65px;
}

.gv-item:hover {
  background-color: #F5F5F5;
}

.gv-item-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  object-fit: contain;
}

.gv-item-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.gv-item-name {
  font-size: 14px;
  color: #333;
  height: 20px !important;
}

.gv-item-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 12px;
  color: #7A7A7A;
  flex-wrap: wrap;
}

.gv-item-meta.two-lines {
  gap: 0;
  flex-direction: column;
  display: flex;
  align-items: flex-start;
  line-height: 120%;
  margin: 0;
}

.gv-item-meta-text {
  white-space: nowrap;
}

.gv-item-meta-upload-info {
  display: flex;
  color: #7A7A7A;
  gap: 4px;
  font-size: 12px;
  align-items: flex-end;
  flex-direction: column;
}

@media (max-width: 480px) {
  .gv-list {
    margin: 0;
  }

  .gv-item-meta-text {
    font-size: 10px;
  }
}
</style>

<style module>
.group-files-viewer-container {
  width: 1000px;
  height: 700px;
  padding: 4px 2px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 20px);
  background-color: #FAFAFA;
}

@media (max-width: 480px) {
  .group-files-viewer-container {
    max-width: 100%;
    max-height: 100%;
    height: 100%;
    border-radius: 0;
  }
}
</style>