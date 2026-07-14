<script>
import { defineComponent } from 'vue'
import Tooltip from "./Tooltip.vue";
import { Emitter } from "../../composables/event-bus.js";
import {
  fetchGroupInfo,
  fetchGroupMemberInfo, fetchGroupNotice,
  fetchStrangerInfo,
  getGroupLogo,
  getUserLogo
} from "../../utils/backend-api.js";
import { nanoid } from "nanoid";
import EnterArrow from "./EnterArrow.vue";

export default defineComponent({
  name: "ContactInfoTooltip",
  components: { EnterArrow, Tooltip },
  data() {
    return {
      group_user: null,
      user: null,
      group: null,
      group_id: null,
      user_id: null,
      position: null,
      showId: null,
      showTime: null,
      latestGroupNotice: null
    }
  },
  methods: {
    getGroupLogo,
    getUserLogo,
    disappear() {
      this.group_user = this.user = this.group = this.group_id = this.user_id =
        this.position = this.showId = this.showTime = this.latestGroupNotice = null
    },
    showContactInfo(options) {
      this.disappear()
      let { position, group_user, user, group, group_id, user_id } = options
      if (!position) {
        return
      }
      const showId = this.showId = nanoid()
      this.showTime = Date.now();
      const setter = key => {
        return info => {
          if (this.showId === showId) {
            this[key] = info
          }
        }
      }
      if (group_user) {
        group_id = group_user.group_id
        user_id = group_user.user_id
      }
      if (group) {
        group_id = group.group_id
      }
      if (user) {
        user_id = user.user_id
      }
      if (group_id && user_id) {
        this.group_user = group_user
        fetchGroupMemberInfo(group_id, user_id).then(setter("group_user"))
      }
      if (user_id) {
        this.user = user
        fetchStrangerInfo((user_id)).then(setter("user"))
      }
      if (group_id && !user_id) {
        this.group = group
        fetchGroupInfo(group_id).then(setter("group"))
        fetchGroupNotice(group_id).then(info => {
          if (this.showId === showId) {
            this.latestGroupNotice = info?.[0]?.message
          }
        })
      }
      this.group_id = group_id
      this.user_id = user_id
      this.position = position
    },
    documentClick(e) {
      if (!e?.target?.closest(".contact-info-tooltip") && (Date.now() - this.showTime) > 300) {
        this.disappear()
      }
    },
    showGroupNotices() {
      Emitter.emit("show-group-notices")
      this.disappear()
    }
  },
  mounted() {
    Emitter.on("show-contact-info", this.showContactInfo)
    document.addEventListener("click", this.documentClick)
  },
  unmounted() {
    Emitter.off("show-contact-info")
    document.removeEventListener("click", this.documentClick)
  }
})
</script>

<template>
  <Tooltip
    v-if="position"
    :tip-position="position"
    placement="br"
    :always-exists="true"
    trigger="toggle"
    :width="300"
  >
    <template #content>
      <div class="tooltip-style contact-info-tooltip">
        <div v-if="user_id">
          <div class="contact-info-header">
            <img class="contact-info-logo" :src="getUserLogo(user_id)" alt="">
            <div class="contact-info-header-text overflow-ellipsis">
              <span class="contact-info-name">{{ group_user?.nickname || user?.nickname }}</span>
              <span class="contact-info-id">QQ {{ user_id }}</span>
            </div>
          </div>
          <div class="contact-info-details">
            <div class="row" v-if="user?.qqLevel">
              <div class="label">等级</div>
              <div class="value">{{ user.qqLevel }}</div>
            </div>
            <div class="row" v-if="user?.remark">
              <div class="label">备注</div>
              <div class="value clickable overflow-ellipsis">{{ user.remark }}</div>
            </div>
            <div class="row" v-if="group_user?.card">
              <div class="label">群昵称</div>
              <div class="value clickable overflow-ellipsis">{{ group_user.card }}</div>
            </div>
            <div class="row">
              <div class="label">QQ 空间</div>
              <a class="value clickable" :href="`https://user.qzone.qq.com/${user_id}`" target="_blank">查看 QQ 空间</a>
            </div>
          </div>
        </div>
        <div v-else-if="group_id">
          <div class="contact-info-header">
            <img class="contact-info-logo" :src="getGroupLogo(group_id)" alt="">
            <div class="contact-info-header-text overflow-ellipsis">
              <span class="contact-info-name">{{ group?.group_name }}</span>
              <span class="contact-info-id">
                {{ group_id }}
                <span v-if="group?.member_count">（{{ group.member_count }}人）</span>
              </span>
            </div>
          </div>
          <div class="contact-info-details">
            <div class="row" v-if="group?.group_remark">
              <div class="label">备注</div>
              <div class="value clickable overflow-ellipsis">{{ group.group_remark }}</div>
            </div>
            <div class="row" v-if="latestGroupNotice">
              <div class="label">群公告</div>
              <div class="value clickable overflow-ellipsis with-arrow" @click="showGroupNotices">
                <span class="overflow-ellipsis">
                <span v-if="latestGroupNotice?.image?.length">【图片】</span>
                <span v-html="latestGroupNotice.text"></span>
                </span>
                <EnterArrow :size="18"/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </Tooltip>
</template>

<style scoped>
.tooltip-style.contact-info-tooltip {
  /* 底色：整体白色背景 */
  background-color: #ffffff;
  /* 顶部背景图：仅顶部显示、不重复、铺满宽度 */
  background-image: url("/QQ/app/img/minicard.bg.c44eefb168ed8bd4d8e2.png");
  background-repeat: no-repeat; /* 禁止重复平铺 */
  background-position: top center; /* 对齐顶部 */
  background-size: 100% auto; /* 宽度铺满，高度自适应原图比例 */
  width: 300px;
  padding-top: 10px;
}

.contact-info-header {
  padding: 12px;
  margin: 8px 0;
  display: flex;
  flex-direction: row;
}

.contact-info-logo {
  width: 60px;
  height: 60px;
  border-radius: 50%;
}

.contact-info-header-text {
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-left: 16px;
  gap: 8px;
}

.contact-info-name {
  font-size: 20px;
}

.contact-info-id {
  color: #999;
}

.contact-info-details {
  width: 100%;
  padding: 0 12px;
  font-size: 15px;
}

.contact-info-details .row {
  display: flex;
  margin-bottom: 10px;
  cursor: default;
}

.contact-info-details .label {
  flex: 0 0 80px; /* ✅ 固定宽度 */
  white-space: nowrap; /* ✅ 单行显示 */
  color: #999;
}

.contact-info-details .label, .contact-info-details .value {
  padding: 5px;
}

.contact-info-details .value {
  flex: 1;
  border-radius: 5px;
  color: black;
}

.contact-info-details .value.with-arrow {
  display: flex;
  align-items: center;
}

.contact-info-details .value.clickable:hover {
  background-color: #f2f2f2;
}

.contact-info-details .value.clickable:active {
  background-color: #e0e0e0;
}
</style>