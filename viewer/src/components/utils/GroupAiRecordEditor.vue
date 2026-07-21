<script>
import { defineComponent } from 'vue'
import SimplePopUp from "./SimplePopUp.vue";
import CustomScrollBar from "./CustomScrollBar.vue";
import { fetchAiRecordCharacters, fetchSendGroupAiRecord } from "../../utils/backend-api.js";
import { showToast } from "../../utils/toast.js";

export default defineComponent({
  name: "GroupAiRecordEditor",
  components: { SimplePopUp, CustomScrollBar },
  props: {
    group_id: {
      type: [Number, String],
      default: null
    },
    onClose: {
      type: Function,
      default: () => {
      }
    }
  },
  data() {
    return {
      categories: [],
      selectedCharacter: null,
      text: '',
      loading: false,
      sending: false,
      playingAudio: null,
      currentPlayingId: null,
    }
  },
  mounted() {
    this.loadCharacters()
  },
  methods: {
    async loadCharacters() {
      if (!this.group_id) return
      this.loading = true
      try {
        this.categories = await fetchAiRecordCharacters(this.group_id)
      } catch (e) {
        console.error('获取AI角色列表失败', e)
        showToast('error', '获取AI角色列表失败')
      } finally {
        this.loading = false
      }
    },
    getAvatarColor(character_id) {
      // 根据 character_id 生成一致的背景色
      let hash = 0
      for (let i = 0; i < character_id.length; i++) {
        hash = character_id.charCodeAt(i) + ((hash << 5) - hash)
      }
      const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
        '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
        '#F1948A', '#85929E', '#73C6B6', '#E59866'
      ]
      return colors[Math.abs(hash) % colors.length]
    },
    selectCharacter(character) {
      this.selectedCharacter = character
    },
    async previewAudio(character) {
      // 如果正在播放同一个，停止
      if (this.currentPlayingId === character.character_id && this.playingAudio) {
        this.playingAudio.pause()
        this.playingAudio = null
        this.currentPlayingId = null
        return
      }
      // 停止之前的播放
      if (this.playingAudio) {
        this.playingAudio.pause()
        this.playingAudio = null
      }
      if (!character.preview_url) {
        showToast('info', '暂无预览音频')
        return
      }
      this.currentPlayingId = character.character_id
      const audio = new Audio(character.preview_url)
      audio.onended = () => {
        this.playingAudio = null
        this.currentPlayingId = null
      }
      audio.onerror = () => {
        this.playingAudio = null
        this.currentPlayingId = null
        showToast('error', '预览音频播放失败')
      }
      this.playingAudio = audio
      audio.play().catch(() => {
        this.playingAudio = null
        this.currentPlayingId = null
      })
    },
    isPlaying(characterId) {
      return this.currentPlayingId === characterId && this.playingAudio && !this.playingAudio.paused
    },
    async send() {
      if (!this.text.trim()) {
        showToast('warning', '请输入文本内容')
        return
      }
      if (!this.selectedCharacter) {
        showToast('warning', '请选择一个角色')
        return
      }
      this.sending = true
      try {
        const result = await fetchSendGroupAiRecord(this.group_id, this.selectedCharacter.character_id, this.text.trim())
        if (result.status === 'ok') {
          showToast('success', 'AI语音已发送')
          this.$refs.popUp.confirm(false)
        } else {
          showToast('error', '发送失败: ' + (result.message || '未知错误'))
        }
      } catch (e) {
        showToast('error', '发送AI语音失败')
        console.error('发送AI语音失败', e)
      } finally {
        this.sending = false
      }
    },
    close() {
      this.$refs.popUp.confirm(false)
    }
  }
})
</script>

<template>
  <div class="group-ai-record-editor">
    <SimplePopUp ref="popUp"
                 :on-confirm="onClose"
                 :on-cancel="onClose"
                 :container-styles="$style['group-ai-record-editor-container']">
      <template #default>
        <div class="group-ai-record-editor-title">
          AI 语音
          <img alt="" src="/QQ/icons/close_fill_24.svg" class="group-ai-record-editor-close-btn cannot-drag"
               @click="close">
        </div>

        <div class="group-ai-record-editor-body">
          <!-- 角色选择区域 -->
          <div class="group-ai-record-editor-characters-section">
            <div class="group-ai-record-editor-section-label">选择角色</div>
            <CustomScrollBar class="group-ai-record-editor-characters-list">
              <template v-if="loading">
                <div class="group-ai-record-editor-loading">加载中...</div>
              </template>
              <template v-else-if="!categories?.length">
                <div class="group-ai-record-editor-empty">暂无可用角色</div>
              </template>
              <template v-else>
                <div v-for="(category, catIndex) in categories" :key="catIndex" class="group-ai-record-editor-category">
                  <div class="group-ai-record-editor-category-title">{{ category.type }}</div>
                  <div class="group-ai-record-editor-category-characters">
                    <div v-for="character in category.characters"
                         :key="character.character_id"
                         class="group-ai-record-editor-character-card"
                         :class="{ 'selected': selectedCharacter?.character_id === character.character_id }"
                         @click="selectCharacter(character)">
                      <div class="group-ai-record-editor-character-avatar"
                           :style="{ backgroundColor: getAvatarColor(character.character_id) }">
                        {{ character.character_name.charAt(0) }}
                      </div>
                      <div class="group-ai-record-editor-character-name overflow-ellipsis">
                        {{ character.character_name }}
                      </div>
                      <div class="group-ai-record-editor-character-preview"
                           @click.stop="previewAudio(character)"
                           :title="isPlaying(character.character_id) ? '停止播放' : '预览声音'">
                        <img v-if="isPlaying(character.character_id)"
                             src="/QQ/icons/pause_24.svg"
                             alt="暂停"
                             class="group-ai-record-editor-preview-icon"/>
                        <img v-else
                             src="/QQ/icons/play_fill_24.svg"
                             alt="播放"
                             class="group-ai-record-editor-preview-icon"
                             style="margin-left: 2px;"/>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </CustomScrollBar>
          </div>

          <!-- 文本输入区域 -->
          <div class="group-ai-record-editor-input-section">
            <div class="group-ai-record-editor-section-label">输入文本</div>
            <textarea
              v-model="text"
              class="group-ai-record-editor-textarea"
              placeholder="请输入要转换为语音的文本..."
              :disabled="sending"
            ></textarea>
          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="group-ai-record-editor-footer">
          <div class="group-ai-record-editor-selected-info" v-if="selectedCharacter">
            <span class="group-ai-record-editor-selected-label">已选角色：</span>
            <span class="group-ai-record-editor-selected-name">{{ selectedCharacter.character_name }}</span>
          </div>
          <div class="group-ai-record-editor-selected-info" v-else>
            <span class="group-ai-record-editor-selected-label">请选择一个角色</span>
          </div>
          <button class="group-ai-record-editor-send-btn"
                  :disabled="sending || !text.trim() || !selectedCharacter"
                  @click="send">
            {{ sending ? '发送中...' : '发送 AI 语音' }}
          </button>
        </div>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.group-ai-record-editor-title {
  text-align: center;
  font-weight: bold;
  font-size: 16px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  user-select: none;
  position: relative;
}

.group-ai-record-editor-close-btn {
  float: right;
  width: 25px;
  height: 25px;
  position: absolute;
  right: 8px;
  top: 8px;
  cursor: pointer;
}

.group-ai-record-editor-body {
  display: flex;
  flex-direction: column;
  height: calc(100% - 95px);
  padding: 0 10px;
}

.group-ai-record-editor-characters-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.group-ai-record-editor-section-label {
  font-size: 13px;
  color: #666;
  padding: 8px 0 4px 0;
  font-weight: 500;
  flex-shrink: 0;
}

.group-ai-record-editor-characters-list {
  flex: 1;
  overflow: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 4px 6px;
  background-color: #FAFAFA;
}

.group-ai-record-editor-loading,
.group-ai-record-editor-empty {
  text-align: center;
  color: #999;
  padding: 30px 0;
  font-size: 13px;
}

.group-ai-record-editor-category {
  margin-bottom: 8px;
}

.group-ai-record-editor-category-title {
  font-size: 12px;
  color: #999;
  padding: 4px 2px;
  font-weight: 500;
}

.group-ai-record-editor-category-characters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.group-ai-record-editor-character-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background-color: white;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  width: calc(50% - 3px);
  box-sizing: border-box;
}

.group-ai-record-editor-character-card:hover {
  border-color: #0099ff;
  background-color: #f0f8ff;
}

.group-ai-record-editor-character-card.selected {
  border-color: #0099ff;
  background-color: #e6f4ff;
  box-shadow: 0 0 0 1px #0099ff;
}

.group-ai-record-editor-character-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: bold;
  flex-shrink: 0;
}

.group-ai-record-editor-character-name {
  font-size: 13px;
  color: #333;
  flex: 1;
  min-width: 0;
}

.group-ai-record-editor-character-preview {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.group-ai-record-editor-character-preview:hover {
  background-color: rgba(0, 153, 255, 0.1);
}

.group-ai-record-editor-preview-icon {
  width: 18px;
  height: 18px;
}

.group-ai-record-editor-input-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.group-ai-record-editor-textarea {
  width: 100%;
  height: 70px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  font-size: 13px;
  resize: none;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}

.group-ai-record-editor-textarea:focus {
  border-color: #0099ff;
}

.group-ai-record-editor-textarea:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.group-ai-record-editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid #eee;
  flex-shrink: 0;
}

.group-ai-record-editor-selected-info {
  font-size: 13px;
  color: #666;
}

.group-ai-record-editor-selected-label {
  color: #999;
}

.group-ai-record-editor-selected-name {
  color: #0099ff;
  font-weight: 500;
}

.group-ai-record-editor-send-btn {
  background-color: #0099ff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 6px 18px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.group-ai-record-editor-send-btn:hover:not(:disabled) {
  background-color: #007acc;
}

.group-ai-record-editor-send-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
</style>

<style module>
.group-ai-record-editor-container {
  width: 480px;
  height: 520px;
  padding: 4px 2px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 20px);
  background-color: #F5F5F5;
}
</style>