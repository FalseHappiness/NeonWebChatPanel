<script>
import { defineComponent } from 'vue'
import SimplePopUp from "./SimplePopUp.vue";

export default defineComponent({
  name: "DownloadProgressPopup",
  components: { SimplePopUp },
  props: {
    downloadInfo: {
      type: Object,
      default: null
    }
  },
  emits: ['close', 'confirm'],
  data() {
    return {
      status: 'pending',     // 'pending' | 'downloading' | 'completed' | 'error' | 'cancelled'
      progress: 0,           // 0-100, -1 = indeterminate
      receivedBytes: 0,
      totalBytes: 0,
      errorMessage: '',
      resolvedUrl: '',       // 从 X-Proxy-Url 响应头获取的真实源地址
      fileName: '',
      abortController: null,
      // 缓存当前blobUrl，页面关闭统一释放
      tempBlobUrl: null
    }
  },
  watch: {
    downloadInfo: {
      immediate: true,
      handler(info) {
        if (info) {
          this.resetDownloadState();
          this.resolvedUrl = info.resolvedUrl || '';
          this.fileName = info.fileName || 'file';
          this.abortController = new AbortController();
          this.$nextTick(() => this.startDownload());
        }
      }
    }
  },
  methods: {
    // 统一重置所有下载状态（重试/新建下载复用）
    resetDownloadState() {
      this.status = 'pending';
      this.progress = 0;
      this.receivedBytes = 0;
      this.totalBytes = 0;
      this.errorMessage = '';
      this.tempBlobUrl = null;
    },

    async startDownload() {
      const info = this.downloadInfo;
      if (!info) return;

      this.status = 'downloading';
      // 每次下载新建控制器，避免复用旧abort信号
      this.abortController = new AbortController();

      try {
        // 通过虚拟协议 fetch（会被 VirtualProtocol 拦截，进而触发 handler）
        const response = await fetch(info.href, {
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          // 尝试读取错误响应体中的详细信息
          let errorDetail = `HTTP ${response.status}`;
          try {
            const errorBody = await response.text();
            if (errorBody) {
              // 尝试解析 JSON
              try {
                const parsed = JSON.parse(errorBody);
                errorDetail = parsed.message || parsed.error || errorBody;
              } catch {
                // 不是 JSON 就用原始文本
                errorDetail = errorBody;
              }
            }
          } catch {
            // 读取失败 fallback
          }
          throw new Error(errorDetail);
        }

        // 从响应头中提取元信息
        this.resolvedUrl = response.headers.get('X-Proxy-Url') || this.resolvedUrl;
        const encodedFileName = response.headers.get('X-File-Name');
        if (encodedFileName) {
          this.fileName = decodeURIComponent(encodedFileName);
        }

        const contentLength = response.headers.get('content-length');
        this.totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          this.receivedBytes += value.length;

          if (this.totalBytes > 0) {
            this.progress = Math.round((this.receivedBytes / this.totalBytes) * 100);
          } else {
            this.progress = -1; // indeterminate
          }
        }

        // 合并 Blob 并触发下载
        const blob = new Blob(chunks, {
          type: response.headers.get('content-type') || 'application/octet-stream'
        });
        this.tempBlobUrl = URL.createObjectURL(blob);

        this.status = 'completed';
        this.progress = 100;

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = this.tempBlobUrl;
        a.download = this.fileName;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
          URL.revokeObjectURL(this.tempBlobUrl);
          document.body.removeChild(a);
          this.tempBlobUrl = null;
        }, 3000);

      } catch (err) {
        if (err.name === 'AbortError') {
          this.status = 'cancelled';
        } else {
          this.status = 'error';
          this.errorMessage = err.message;
        }
      }
    },

    // 取消下载：中断请求 + 更新状态
    cancelDownload() {
      if (this.abortController) {
        this.abortController.abort();
      }
      this.status = 'cancelled';
      // 不自动关闭弹窗，用户可手动关闭或重试
    },

    // 重试按钮统一处理
    retryDownload() {
      this.resetDownloadState();
      this.abortController = new AbortController();
      this.startDownload();
    },

    close() {
      // 关闭前中断请求、释放blob资源
      if (this.abortController) this.abortController.abort();
      if (this.tempBlobUrl) {
        URL.revokeObjectURL(this.tempBlobUrl);
      }
      this.$refs.popUp.confirm();
    },

    // 由 SimplePopUp 的 onConfirm 在动画结束后调用
    onClosed() {
      this.$emit('close');
    }
  }
})
</script>

<template>
  <div class="download-progress-popup">
    <SimplePopUp ref="popUp"
                 :on-confirm="onClosed"
                 :on-cancel="onClosed"
                 :container-styles="'download-progress-container'">
      <template #default>
        <div class="download-content">
          <!-- 标题 -->
          <div class="download-title">
            {{
              status === 'completed' ? '✅ 下载完成' :
                status === 'error' ? '❌ 下载失败' :
                  status === 'cancelled' ? '⏹ 已取消' :
                    '⏳ 下载文件中...'
            }}
          </div>

          <!-- 文件名 -->
          <div class="download-file-name" :title="fileName">
            {{ fileName }}
          </div>

          <!-- 真实源地址（仅代理类处理器有） -->
          <div class="download-url" v-if="resolvedUrl && status !== 'completed'">
            <span class="url-label">源地址:</span>
            <span class="url-value" :title="resolvedUrl">{{ resolvedUrl }}</span>
          </div>

          <!-- 进度条 -->
          <div class="download-progress-bar-container" v-if="status === 'downloading'">
            <div class="download-progress-bar"
                 :class="{ indeterminate: progress === -1 }"
                 :style="progress > 0 ? { width: progress + '%' } : {}">
            </div>
          </div>

          <!-- 进度信息 -->
          <div class="download-info" v-if="status === 'downloading'">
            <span v-if="progress > 0">{{ progress }}%</span>
            <span v-else>准备中...</span>
            <span class="bytes-info" v-if="totalBytes > 0">
              {{ (receivedBytes / 1024 / 1024).toFixed(1) }} MB / {{ (totalBytes / 1024 / 1024).toFixed(1) }} MB
            </span>
          </div>

          <!-- 错误信息 -->
          <div class="download-error" v-if="status === 'error'">
            {{ errorMessage }}
          </div>

          <!-- 按钮区域 -->
          <div class="download-actions">
            <!-- 下载中：仅取消按钮 -->
            <template v-if="status === 'downloading'">
              <button class="download-btn cancel-btn" @click="cancelDownload">
                取消
              </button>
            </template>

            <!-- 失败 / 已取消：重试 + 关闭两个按钮 -->
            <template v-else-if="status === 'error' || status === 'cancelled'">
              <button class="download-btn retry-btn" @click="retryDownload">
                重试
              </button>
              <button class="download-btn close-btn" @click="close">
                关闭
              </button>
            </template>

            <!-- 下载完成：仅关闭 -->
            <button v-else class="download-btn close-btn" @click="close">
              关闭
            </button>
          </div>
        </div>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.download-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px 0;
}

.download-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  text-align: center;
}

.download-file-name {
  font-size: 13px;
  color: #666;
  margin-bottom: 10px;
  text-align: center;
  overflow: hidden;
  word-break: break-all;
  padding: 0 5px;
}

.download-url {
  font-size: 11px;
  color: #999;
  margin-bottom: 12px;
  padding: 6px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.url-label {
  color: #888;
  margin-right: 4px;
}

.url-value {
  color: #06c;
}

.download-progress-bar-container {
  height: 8px;
  background: #e8e8e8;
  border-radius: 4px;
  margin: 15px 0 8px;
  overflow: hidden;
}

.download-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4facfe, #00f2fe);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.download-progress-bar.indeterminate {
  width: 30% !important;
  animation: indeterminate 1.5s ease-in-out infinite;
}

@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

.download-info {
  font-size: 12px;
  color: #888;
  text-align: center;
  margin-bottom: 6px;
}

.bytes-info {
  margin-left: 8px;
  color: #aaa;
}

.download-error {
  font-size: 13px;
  color: #e74c3c;
  text-align: center;
  margin: 10px 0;
  padding: 8px;
  background: #fef0f0;
  border-radius: 4px;
  word-break: break-all;
}

.download-actions {
  margin-top: auto;
  display: flex;
  justify-content: center;
  gap: 10px;
  padding-top: 15px;
}

.download-btn {
  padding: 8px 28px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.cancel-btn {
  background: #e8e8e8;
  color: #666;
}

.cancel-btn:hover {
  background: #d5d5d5;
}

.close-btn {
  background: #4facfe;
  color: #fff;
}

.close-btn:hover {
  background: #3d9ae6;
}

.retry-btn {
  background: #f0ad4e;
  color: #fff;
}

.retry-btn:hover {
  background: #e09d3e;
}
</style>