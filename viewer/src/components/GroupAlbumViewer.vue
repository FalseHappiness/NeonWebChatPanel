<script>
import { defineComponent } from 'vue'
import { fetchGroupAlbumList, fetchGroupAlbumMediaList } from "../utils/backend-api.js"
import { formatTimeOptions } from "../utils/others.js"
import CustomScrollBar from "./utils/CustomScrollBar.vue"
import SimplePopUp from "./utils/SimplePopUp.vue"

export default defineComponent({
  name: "GroupAlbumViewer",
  components: { CustomScrollBar, SimplePopUp },
  props: {
    group_id: { type: [Number, String], required: true },
    onClose: { type: Function, default: () => {} }
  },
  data() {
    return {
      // 当前视图: 'albums' | 'media' | 'detail'
      view: 'albums',

      // 相册列表
      albums: [],
      albumsAttachInfo: '',
      albumsHasMore: false,
      loadingAlbums: false,
      loadingMoreAlbums: false,

      // 当前相册 & 媒体列表
      currentAlbum: null,
      mediaList: [],
      mediaAttachInfo: '',
      mediaHasMore: false,
      loadingMedia: false,
      loadingMoreMedia: false,

      // 媒体详情
      currentMediaIndex: 0,

      // 保存滚动位置
      savedAlbumScrollTop: 0,
      savedMediaScrollTop: 0,

      // 滚动监听器
      albumScrollEl: null,
      mediaScrollEl: null,
    }
  },
  computed: {
    /** 按天分组的媒体列表（upload_time大的在前，同一天内也按upload_time大的在前） */
    groupedMedia() {
      const groups = []
      let currentGroup = null
      for (const media of this.mediaList) {
        const date = this.formatDateOnly(media.upload_time)
        if (!currentGroup || currentGroup.date !== date) {
          currentGroup = { date, items: [] }
          groups.push(currentGroup)
        }
        currentGroup.items.push(media)
      }
      return groups
    },
    /** 当前查看的媒体 */
    currentMedia() {
      return this.mediaList[this.currentMediaIndex] || null
    }
  },
  methods: {
    /* ========== 格式化工具 ========== */

    formatDateOnly(timestamp) {
      if (!timestamp) return ''
      const date = new Date(parseInt(timestamp) * 1000)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    },

    formatDateTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(parseInt(timestamp) * 1000)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}`
    },

    formatDateLabel(timestamp) {
      if (!timestamp) return ''
      const date = new Date(parseInt(timestamp) * 1000)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const diffDays = Math.floor((today - target) / (86400000))
      if (diffDays === 0) return '今天'
      if (diffDays === 1) return '昨天'
      if (diffDays < 7) return `${diffDays}天前`
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${date.getFullYear()}年${month}月${day}日`
    },

    formatTime(timestamp) {
      if (!timestamp) return ''
      return formatTimeOptions({
        timestamp: parseInt(timestamp),
        alwaysMD: false,
        showSecond: false,
        relative: true,
        showHm: false
      })
    },

    /* ========== URL 提取 ========== */

    /** 获取相册封面（中等质量） */
    getCoverUrl(album) {
      if (!album.cover || !album.cover.image) return null
      const image = album.cover.image
      if (image.photo_url && image.photo_url.length) {
        for (const spec of [2, 5]) {
          const found = image.photo_url.find(p => p.spec === spec && p.url && p.url.url)
          if (found && found.url && found.url.url) return found.url.url
        }
        for (const p of image.photo_url) {
          if (p.url && p.url.url) return p.url.url
        }
      }
      if (image.default_url && image.default_url.url) return image.default_url.url
      return null
    },

    /** 获取媒体最高质量图（spec 1=800px 或 6=原图） */
    getHighestQualityUrl(media) {
      if (media.type === 0 && media.image) {
        const image = media.image
        if (image.photo_url && image.photo_url.length) {
          for (const spec of [1, 6]) {
            const found = image.photo_url.find(p => p.spec === spec && p.url && p.url.url)
            if (found && found.url && found.url.url) return found.url.url
          }
          for (const p of image.photo_url) {
            if (p.url && p.url.url) return p.url.url
          }
        }
        if (image.default_url && image.default_url.url) return image.default_url.url
      }
      return null
    },

    /** 获取视频封面 */
    getVideoCoverUrl(media) {
      if (media.type === 1 && media.video && media.video.cover) {
        const cover = media.video.cover
        if (cover.photo_url && cover.photo_url.length) {
          for (const spec of [2, 5]) {
            const found = cover.photo_url.find(p => p.spec === spec && p.url && p.url.url)
            if (found && found.url && found.url.url) return found.url.url
          }
          for (const p of cover.photo_url) {
            if (p.url && p.url.url) return p.url.url
          }
        }
        if (cover.default_url && cover.default_url.url) return cover.default_url.url
      }
      return null
    },

    /** 获取视频播放地址 */
    getVideoUrl(media) {
      if (media.type === 1 && media.video) {
        if (media.video.url) return media.video.url
        if (media.video.video_url && media.video.video_url.length) {
          const first = media.video.video_url[0]
          return first.url || (first.url && first.url.url)
        }
        if (media.video.videoUrls && media.video.videoUrls.length) {
          const first = media.video.videoUrls[0]
          return first.url || (first.url && first.url.url)
        }
      }
      return null
    },

    /** 获取媒体列表项缩略图 */
    getMediaThumbUrl(media) {
      if (media.type === 0) {
        return this.getMediumQualityUrl(media.image)
      } else if (media.type === 1) {
        return this.getVideoCoverUrl(media)
      }
      return null
    },

    /** 获取中等质量图 */
    getMediumQualityUrl(image) {
      if (!image) return null
      if (image.photo_url && image.photo_url.length) {
        for (const spec of [2, 5]) {
          const found = image.photo_url.find(p => p.spec === spec && p.url && p.url.url)
          if (found && found.url && found.url.url) return found.url.url
        }
        for (const p of image.photo_url) {
          if (p.url && p.url.url) return p.url.url
        }
      }
      if (image.default_url && image.default_url.url) return image.default_url.url
      return null
    },

    /** 处理图片加载失败 - 显示无封面 */
    handleImgError(event) {
      const el = event.target
      if (el) {
        el.style.display = 'none'
        const parent = el.parentNode
        if (parent) {
          // 尝试找到兄弟节点中的 .gav-no-cover
          const noCover = parent.querySelector('.gav-no-cover')
          if (noCover) {
            noCover.style.display = 'flex'
          }
        }
      }
    },

    /* ========== 数据加载 ========== */

    async loadAlbums(loadMore = false) {
      if (loadMore) {
        if (this.loadingMoreAlbums || !this.albumsHasMore) return
        this.loadingMoreAlbums = true
      } else {
        if (this.loadingAlbums) return
        this.loadingAlbums = true
      }
      try {
        const attachInfo = loadMore && this.albumsAttachInfo ? this.albumsAttachInfo : undefined
        const data = await fetchGroupAlbumList(this.group_id, attachInfo)
        const newAlbums = data.album_list || []
        if (loadMore) {
          // 下一页是更旧的，追加到末尾
          this.albums = this.albums.concat(newAlbums)
        } else {
          this.albums = newAlbums
        }
        this.albumsAttachInfo = data.attach_info || ''
        this.albumsHasMore = !!data.has_more
      } catch (e) {
        console.error('加载相册列表失败:', e)
      } finally {
        this.loadingAlbums = false
        this.loadingMoreAlbums = false
      }
    },

    async loadMedia(album, loadMore = false) {
      if (loadMore) {
        if (this.loadingMoreMedia || !this.mediaHasMore) return
        this.loadingMoreMedia = true
      } else {
        if (this.loadingMedia) return
        this.loadingMedia = true
      }
      try {
        const attachInfo = loadMore && this.mediaAttachInfo ? this.mediaAttachInfo : undefined
        const data = await fetchGroupAlbumMediaList(this.group_id, album.album_id, attachInfo)
        const newMedia = data.media_list || []
        if (loadMore) {
          this.mediaList = this.mediaList.concat(newMedia)
        } else {
          this.mediaList = newMedia
        }
        this.mediaAttachInfo = data.next_attach_info || ''
        this.mediaHasMore = !!data.next_has_more
      } catch (e) {
        console.error('加载相册媒体列表失败:', e)
      } finally {
        this.loadingMedia = false
        this.loadingMoreMedia = false
      }
    },

    /* ========== 视图切换 ========== */

    enterAlbum(album) {
      this.saveAlbumScrollPosition()
      this.currentAlbum = album
      this.mediaList = []
      this.mediaAttachInfo = ''
      this.mediaHasMore = false
      this.currentMediaIndex = 0
      this.view = 'media'
      this.$nextTick(() => {
        this.loadMedia(album)
      })
    },

    goBackToAlbums() {
      this.view = 'albums'
      this.currentAlbum = null
      this.mediaList = []
      this.$nextTick(() => {
        this.restoreAlbumScrollPosition()
      })
    },

    enterDetail(index) {
      this.saveMediaScrollPosition()
      this.currentMediaIndex = index
      this.view = 'detail'
    },

    goBackToMedia() {
      this.view = 'media'
      this.$nextTick(() => {
        this.restoreMediaScrollPosition()
      })
    },

    prevMedia() {
      if (this.currentMediaIndex > 0) {
        this.currentMediaIndex--
      }
    },

    nextMedia() {
      if (this.currentMediaIndex < this.mediaList.length - 1) {
        this.currentMediaIndex++
      }
    },

    /* ========== 滚动位置管理 ========== */

    getScrollElement(ref) {
      if (!ref) return null
      if (ref.getScrollElement) return ref.getScrollElement()
      if (ref.$el) {
        return ref.$el.querySelector('.simplebar-content-wrapper') || ref.$el
      }
      return ref.querySelector ? (ref.querySelector('.simplebar-content-wrapper') || ref) : ref
    },

    saveAlbumScrollPosition() {
      const el = this.getScrollElement(this.$refs.albumScroller)
      if (el) this.savedAlbumScrollTop = el.scrollTop
    },

    saveMediaScrollPosition() {
      const el = this.getScrollElement(this.$refs.mediaScroller)
      if (el) this.savedMediaScrollTop = el.scrollTop
    },

    restoreAlbumScrollPosition() {
      this.$nextTick(() => {
        const el = this.getScrollElement(this.$refs.albumScroller)
        if (el && this.savedAlbumScrollTop) {
          el.scrollTop = this.savedAlbumScrollTop
        }
      })
    },

    restoreMediaScrollPosition() {
      this.$nextTick(() => {
        const el = this.getScrollElement(this.$refs.mediaScroller)
        if (el && this.savedMediaScrollTop) {
          el.scrollTop = this.savedMediaScrollTop
        }
      })
    },

    /* ========== 无限滚动 ========== */

    onAlbumScroll() {
      const el = this.getScrollElement(this.$refs.albumScroller)
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight - scrollTop - clientHeight < 200 && this.albumsHasMore && !this.loadingMoreAlbums) {
        this.loadAlbums(true)
      }
    },

    onMediaScroll() {
      const el = this.getScrollElement(this.$refs.mediaScroller)
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight - scrollTop - clientHeight < 200 && this.mediaHasMore && !this.loadingMoreMedia) {
        this.loadMedia(this.currentAlbum, true)
      }
    },

    /** 设置滚动监听 */
    setupAlbumScrollListener() {
      const el = this.getScrollElement(this.$refs.albumScroller)
      if (el && !this.albumScrollEl) {
        this.albumScrollEl = el
        el.addEventListener('scroll', this.onAlbumScroll, { passive: true })
      }
    },

    setupMediaScrollListener() {
      const el = this.getScrollElement(this.$refs.mediaScroller)
      if (el && !this.mediaScrollEl) {
        this.mediaScrollEl = el
        el.addEventListener('scroll', this.onMediaScroll, { passive: true })
      }
    },

    /* ========== 其他 ========== */

    close() {
      this.$refs.popUp.confirm(false)
    },

    onKeydown(e) {
      if (this.view === 'detail') {
        if (e.key === 'ArrowLeft') {
          this.prevMedia()
          e.preventDefault()
        } else if (e.key === 'ArrowRight') {
          this.nextMedia()
          e.preventDefault()
        } else if (e.key === 'Escape') {
          this.goBackToMedia()
          e.preventDefault()
        }
      }
    }
  },
  mounted() {
    this.loadAlbums()
    document.addEventListener('keydown', this.onKeydown)
  },
  updated() {
    // 每次视图更新后重新挂载滚动监听
    this.$nextTick(() => {
      this.setupAlbumScrollListener()
      this.setupMediaScrollListener()
    })
  },
  unmounted() {
    document.removeEventListener('keydown', this.onKeydown)
    if (this.albumScrollEl) {
      this.albumScrollEl.removeEventListener('scroll', this.onAlbumScroll)
    }
    if (this.mediaScrollEl) {
      this.mediaScrollEl.removeEventListener('scroll', this.onMediaScroll)
    }
  }
})
</script>

<template>
  <div class="group-album-viewer">
    <SimplePopUp ref="popUp"
                 :on-confirm="onClose"
                 :on-cancel="onClose"
                 :container-styles="$style['group-album-viewer-container']">
      <template #default>
        <!-- ===== 相册列表视图 ===== -->
        <template v-if="view === 'albums'">
          <div class="gav-title">
            群相册
            <img alt="" src="/QQ/icons/close_fill_24.svg" class="gav-close-btn cannot-drag"
                 @click="close">
          </div>
          <CustomScrollBar ref="albumScroller" class="gav-scroll">
            <div v-if="loadingAlbums && !albums.length" class="gav-loading">加载中...</div>
            <div v-else-if="!albums.length" class="gav-empty">暂无相册</div>
            <div v-else class="gav-grid">
              <div v-for="album in albums" :key="album.album_id" class="gav-grid-item"
                   @click="enterAlbum(album)">
                <div class="gav-grid-item-cover">
                  <img v-if="getCoverUrl(album)" :src="getCoverUrl(album)" alt=""
                       class="gav-grid-item-img" loading="lazy"
                       @error="handleImgError">
                  <div v-else class="gav-no-cover">无封面</div>
                  <div v-if="album.upload_number && parseInt(album.upload_number) > 0"
                       class="gav-grid-item-count">
                    {{ album.upload_number }}
                  </div>
                </div>
                <div class="gav-grid-item-info">
                  <div class="gav-grid-item-name overflow-ellipsis">{{ album.name || '未命名相册' }}</div>
                  <div class="gav-grid-item-meta">
                    {{ album.upload_number || 0 }} 张
                    <template v-if="album.last_upload_time && parseInt(album.last_upload_time) > 0">
                      · {{ formatTime(album.last_upload_time) }}
                    </template>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="loadingMoreAlbums" class="gav-loading-more">加载更多...</div>
          </CustomScrollBar>
        </template>

        <!-- ===== 媒体列表视图 ===== -->
        <template v-if="view === 'media'">
          <div class="gav-title">
            <img alt="" src="/QQ/icons/arrow_left_24.svg" class="gav-back-btn cannot-drag"
                 @click="goBackToAlbums">
            {{ (currentAlbum && currentAlbum.name) || '相册' }}
            <img alt="" src="/QQ/icons/close_fill_24.svg" class="gav-close-btn cannot-drag"
                 @click="close">
          </div>
          <CustomScrollBar ref="mediaScroller" class="gav-scroll">
            <div v-if="loadingMedia && !mediaList.length" class="gav-loading">加载中...</div>
            <div v-else-if="!mediaList.length" class="gav-empty">暂无内容</div>
            <template v-else>
              <div v-for="group in groupedMedia" :key="group.date" class="gav-media-group">
                <div class="gav-media-date-header">{{ formatDateLabel(group.items[0].upload_time) }}</div>
                <div class="gav-grid">
                  <div v-for="(media, idx) in group.items" :key="media.batch_id + '-' + media.upload_time"
                       class="gav-grid-item" @click="enterDetail(mediaList.indexOf(media))">
                    <div class="gav-grid-item-cover">
                      <img v-if="getMediaThumbUrl(media)" :src="getMediaThumbUrl(media)" alt=""
                           class="gav-grid-item-img" loading="lazy"
                           @error="handleImgError">
                      <div v-else class="gav-no-cover">加载失败</div>
                      <div v-if="media.type === 1" class="gav-video-badge">
                        <img src="/QQ/icons/play_fill_24.svg" alt="" class="gav-play-icon">
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <div v-if="loadingMoreMedia" class="gav-loading-more">加载更多...</div>
          </CustomScrollBar>
        </template>

        <!-- ===== 媒体详情视图 ===== -->
        <div v-if="view === 'detail' && currentMedia" class="gav-detail-overlay"
             @click.self="goBackToMedia">
          <div class="gav-detail-header">
            <img alt="" src="/QQ/icons/arrow_left_24.svg" class="gav-back-btn cannot-drag"
                 @click="goBackToMedia">
            <span class="gav-detail-counter">{{ currentMediaIndex + 1 }} / {{ mediaList.length }}</span>
            <img alt="" src="/QQ/icons/close_fill_24.svg" class="gav-close-btn cannot-drag"
                 @click="close">
          </div>

          <div class="gav-detail-body" @click.self="goBackToMedia">
            <img v-if="currentMedia.type === 0 && getHighestQualityUrl(currentMedia)"
                 :src="getHighestQualityUrl(currentMedia)" alt="" class="gav-detail-media"
                 @click.self="goBackToMedia">
            <video v-else-if="currentMedia.type === 1 && getVideoUrl(currentMedia)"
                   :src="getVideoUrl(currentMedia)" controls class="gav-detail-media"
                   @click.self="goBackToMedia"></video>
            <div v-else class="gav-detail-error">无法加载此媒体</div>
          </div>

          <div class="gav-detail-info">
            <span>上传者: {{ currentMedia.uploader }}</span>
            <span>{{ formatDateTime(currentMedia.upload_time) }}</span>
          </div>

          <button v-if="currentMediaIndex > 0" class="gav-nav-btn gav-nav-prev"
                  @click="prevMedia">
            <img src="/QQ/icons/arrow_left_24.svg" alt="">
          </button>
          <button v-if="currentMediaIndex < mediaList.length - 1" class="gav-nav-btn gav-nav-next"
                  @click="nextMedia">
            <img src="/QQ/icons/arrow_right_24.svg" alt="">
          </button>
        </div>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
/* ===== 通用 ===== */
.gav-title {
  text-align: center;
  font-size: 16px;
  padding: 0 0 2px 0;
  border-bottom: 1px solid #EDEDED;
  user-select: none;
  position: relative;
  line-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gav-close-btn {
  width: 20px;
  height: 20px;
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
}

.gav-back-btn {
  width: 20px;
  height: 20px;
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
}

.gav-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px 16px 16px;
}

.gav-loading,
.gav-empty {
  text-align: center;
  color: #999;
  padding: 40px 0;
  font-size: 14px;
}

.gav-loading-more {
  text-align: center;
  color: #999;
  padding: 12px 0;
  font-size: 13px;
}

/* ===== 网格 ===== */
.gav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.gav-grid-item {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #f0f0f0;
  transition: box-shadow 0.2s, transform 0.15s;
}

.gav-grid-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

/* 固定宽高比例容器 - 1:1 正方形 */
.gav-grid-item-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #f5f5f5;
}

.gav-grid-item-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gav-no-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #bbb;
  font-size: 13px;
  background: #f5f5f5;
}

.gav-grid-item-count {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  line-height: 16px;
}

.gav-video-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gav-play-icon {
  width: 18px;
  height: 18px;
  filter: brightness(0) invert(1);
}

.gav-grid-item-info {
  padding: 6px 8px 8px;
}

.gav-grid-item-name {
  font-size: 13px;
  color: #333;
  line-height: 1.4;
  max-height: 2.8em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

.gav-grid-item-meta {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

/* ===== 媒体按天分组 ===== */
.gav-media-group {
  margin-bottom: 12px;
}

.gav-media-date-header {
  font-size: 13px;
  color: #888;
  padding: 8px 0 6px;
  font-weight: 500;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 8px;
}

/* ===== 详情视图 ===== */
.gav-detail-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  flex-direction: column;
  z-index: 10;
  border-radius: inherit;
}

.gav-detail-header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  position: relative;
  min-height: 40px;
}

.gav-detail-header .gav-back-btn {
  position: absolute;
  left: 12px;
}

.gav-detail-header .gav-close-btn {
  position: absolute;
  right: 12px;
}

.gav-detail-counter {
  color: #fff;
  font-size: 14px;
}

.gav-detail-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 8px;
}

.gav-detail-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  user-select: none;
  -webkit-user-drag: none;
}

.gav-detail-error {
  color: #999;
  font-size: 16px;
}

.gav-detail-info {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 8px 12px;
  color: #aaa;
  font-size: 12px;
}

/* 导航按钮 */
.gav-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  z-index: 11;
}

.gav-nav-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.gav-nav-btn img {
  width: 24px;
  height: 24px;
  filter: brightness(0) invert(1);
}

.gav-nav-prev {
  left: 12px;
}

.gav-nav-next {
  right: 12px;
}

/* ===== 响应式 ===== */
@media (max-width: 480px) {
  .gav-scroll {
    padding: 6px 8px 12px;
  }

  .gav-grid {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 6px;
  }

  .gav-grid-item-name {
    font-size: 12px;
  }

  .gav-grid-item-meta {
    font-size: 10px;
  }

  .gav-nav-btn {
    width: 36px;
    height: 36px;
  }

  .gav-nav-btn img {
    width: 20px;
    height: 20px;
  }
}
</style>

<style module>
.group-album-viewer-container {
  width: 900px;
  height: 700px;
  padding: 4px 2px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 20px);
  background-color: #FAFAFA;
  position: relative;
  overflow: hidden;
}

@media (max-width: 480px) {
  .group-album-viewer-container {
    max-width: 100%;
    max-height: 100%;
    height: 100%;
    width: 100%;
    border-radius: 0;
  }
}
</style>