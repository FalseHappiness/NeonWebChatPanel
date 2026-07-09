<script>
import { defineComponent } from 'vue'
import SimplePopUp from "./SimplePopUp.vue";
import { fetchCategoricalFriends, fetchContacts, fetchGroupList } from "../../utils/backend-api.js";
import { Collapse, CollapsePanel, Checkbox, CheckboxGroup, ConfigProvider } from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css';
import CustomScrollBar from "./CustomScrollBar.vue";
import ColorSvg from "./ColorSvg.vue";
import { pinyin } from "pinyin-pro";

export default defineComponent({
  name: "ContactsPicker",
  components: {
    ColorSvg,
    CustomScrollBar,
    SimplePopUp,
    ACollapse: Collapse,
    ACollapsePanel: CollapsePanel,
    ACheckbox: Checkbox,
    ACheckboxGroup: CheckboxGroup,
    AConfigProvider: ConfigProvider
  },
  data() {
    return {
      categoricalFriends: [],
      groups: [],
      recentContacts: [],
      collapseActiveKeys: [-100],
      selectedContactsKeys: [],
      filterContactsValue: ""
    }
  },
  props: {
    onConfirm: {
      type: Function,
      default: new Function()
    },
    onCancel: {
      type: Function,
      default: new Function()
    },
  },
  computed: {
    categorizedContacts() {
      const categories = []
      if (this.recentContacts?.length) {
        const contacts = []
        for (const contact of this.recentContacts) {
          contacts.push({
            type: contact.type,
            id: contact.contact_id,
            name: contact.name,
            real_name: contact.real_name || contact.name,
            remark: contact.remark || ""
          })
        }
        categories.push({
          name: '最近聊天',
          contacts,
          id: -100
        })
      }
      if (this.categoricalFriends?.length) {
        for (const category of this.categoricalFriends) {
          const contacts = []
          for (const contact of category.buddyList) {
            contacts.push({
              id: contact.user_id,
              name: contact.remark || contact.nickname,
              type: 'private',
              real_name: contact.nickname,
              remark: contact.remark
            })
          }
          categories.push({
            name: category.categoryName,
            id: category.categoryId,
            contacts
          })
        }
      }
      if (this.groups?.length) {
        const contacts = []
        for (const contact of this.groups) {
          contacts.push({
            name: contact.group_remark || contact.group_name,
            id: contact.group_id,
            type: 'group',
            real_name: contact.group_name,
            remark: contact.group_remark
          })
        }
        categories.push({
          name: '群聊',
          id: -200,
          contacts
        })
      }
      return categories
    },
    selectedContacts() {
      return this.selectedContactsKeys.map(key => this.getContact(key)).filter(contact => contact)
    },
    flattenContacts() {
      // 使用 Map 来存储唯一联系人，键为 type + id 的组合
      const uniqueContactsMap = new Map();

      // 扁平化并去重
      (this.categorizedContacts || []).forEach(category => {
        (category.contacts || []).forEach(contact => {
          if (contact && contact.type && contact.id) {
            const key = `${contact.type}.${contact.id}`;
            if (!uniqueContactsMap.has(key)) {
              uniqueContactsMap.set(key, contact);
            }
          }
        });
      });

      // 返回去重后的联系人数组
      return Array.from(uniqueContactsMap.values());
    },
    filteredContacts() {
      const searchText = this.filterContactsValue.toLowerCase();
      if (!searchText) {
        return undefined
      }

      // 分类匹配结果
      const directMatches = [];
      const pinyinMatches = [];
      const idMatches = [];

      this.flattenContacts.forEach(contact => {
        // 直接匹配 name
        if (contact.real_name.toLowerCase().includes(searchText) || contact.remark.toLowerCase().includes(searchText)) {
          directMatches.push(contact);
          return;
        }

        // 拼音匹配
        const namePinyin = pinyin(contact.name, { toneType: "none", type: "array" }).join('').toLowerCase();
        const remarkPinyin = pinyin(contact.name, { toneType: "none", type: "array" }).join('').toLowerCase();
        if (namePinyin.includes(searchText) || remarkPinyin.includes(searchText)) {
          pinyinMatches.push(contact);
          return;
        }

        // QQ号匹配
        if (String(contact.id).includes(searchText)) {
          idMatches.push(contact);
        }
      });

      // 合并结果，按优先级排序
      return [...directMatches, ...pinyinMatches, ...idMatches];
    }
  },
  methods: {
    getLogo(id, type) {
      return type === 'group'
        ? `https://p.qlogo.cn/gh/${id}/${id}/40`
        : `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=40`
    },
    getContact(id, type) {
      if (!type) {
        [type, id] = id.split('.')
      }
      return this.flattenContacts.find(contact => contact && String(contact.id) === id && contact.type === type)
    },
    confirm(confirm) {
      this.$refs.popUp.confirm(confirm, this.selectedContacts.map(contact => {
        return { ...contact, contact_id: contact.id }
      }))
    }
  },
  async mounted() {
    await Promise.all([
      fetchCategoricalFriends().then(r => this.categoricalFriends = r),
      fetchGroupList().then(r => this.groups = r),
      fetchContacts().then(r => this.recentContacts = r)
    ]);
    // console.log(this.categorizedContacts)
  },
})
</script>

<template>
  <div class="contacts-picker">
    <SimplePopUp :on-confirm="onConfirm"
                 :on-cancel="onCancel"
                 :container-styles="$style['contacts-picker-container']"
                 ref="popUp">
      <template #default>
        <div class="contacts-picker-contacts-area">
          <div class="contacts-picker-contacts-area-search">
            <ColorSvg src="/QQ/icons/search_24.svg" class="contacts-picker-contacts-area-search-icon"/>
            <input @input="filterContactsValue = $event.target.value" placeholder="搜索"
                   class="contacts-picker-contacts-area-search-input">
          </div>
          <div class="contacts-picker-contacts-area-contacts">
            <CustomScrollBar>
              <a-config-provider
                :theme="{ token: { colorPrimary: '#0099ff' } }"
              >
                <a-checkbox-group v-model:value="selectedContactsKeys" style="width: 100%;">
                  <a-collapse v-if="filteredContacts === undefined"
                              ghost
                              v-model:activeKey="collapseActiveKeys"
                              style="width: 100%">
                    <template #expandIcon="{ isActive }">
                      <img
                        src="/QQ/icons/arrow_right_small_16.svg"
                        alt=""
                        class="contacts-picker-expand-icon"
                        :class="{ active: isActive }"
                      >
                    </template>
                    <a-collapse-panel
                      v-if="categorizedContacts?.length"
                      v-for="category in categorizedContacts"
                      :key="category.id"
                      :header="category.name">
                      <a-checkbox
                        v-for="contact in category.contacts"
                        :value="`${contact.type}.${contact.id}`"
                        class="contacts-picker-contacts-area-contact">
                        <img class="contacts-picker-contacts-area-contact-logo" alt=""
                             :src="getLogo(contact.id, contact.type)"
                             loading="lazy">
                        {{ contact.name }}
                      </a-checkbox>
                    </a-collapse-panel>
                  </a-collapse>
                  <div v-else style="width: 100%;">
                    <a-checkbox
                      v-if="filteredContacts.length"
                      v-for="contact in filteredContacts"
                      :value="`${contact.type}.${contact.id}`"
                      class="contacts-picker-contacts-area-contact">
                      <img class="contacts-picker-contacts-area-contact-logo" alt=""
                           :src="getLogo(contact.id, contact.type)"
                           loading="lazy">
                      {{ contact.name }}
                    </a-checkbox>
                    <p v-else style="color: gray;text-align: center">无搜索结果</p>
                  </div>
                </a-checkbox-group>
              </a-config-provider>
            </CustomScrollBar>
          </div>
        </div>
        <div class="contacts-picker-preview-area">
          <div class="contacts-picker-selected-info">
            <span>{{ selectedContactsKeys?.length > 1 ? '分别' : '' }}发送给：</span>
            <span style="color: gray;" v-if="selectedContactsKeys?.length">
              已选 {{ selectedContactsKeys.length }} 个联系人
            </span>
          </div>
          <div class="contacts-picker-selected-contacts-area">
            <CustomScrollBar style="padding-right: 9px;">
              <div
                v-for="contact in selectedContacts"
                class="contacts-picker-contacts-area-contact"
                @click="selectedContactsKeys = selectedContactsKeys.filter(key => key !== `${contact.type}.${contact.id}`)">
                <div class="contacts-picker-contacts-area-contact-left">
                  <img class="contacts-picker-contacts-area-contact-logo" alt=""
                       :src="getLogo(contact.id, contact.type)"
                       loading="lazy">
                  {{ contact.name }}
                </div>
                <div class="contacts-picker-contacts-area-contact-close-btn-background">
                  <ColorSvg src="/QQ/icons/close_16.svg" class="contacts-picker-contacts-area-contact-close-btn"/>
                </div>
              </div>
            </CustomScrollBar>
          </div>
          <div class="contacts-picker-control-area">
            <div class="contacts-picker-buttons-container">
              <div class="contacts-picker-button contacts-picker-button-confirm" @click="confirm(true)">确定</div>
              <div class="contacts-picker-button contacts-picker-button-cancel" @click="confirm(false)">取消</div>
            </div>
          </div>
        </div>
      </template>
    </SimplePopUp>
  </div>
</template>

<style scoped>
.contacts-picker-contacts-area {
  width: 50%;
  border-right: 1px solid #e6e6e6;
  display: flex;
  flex-direction: column;
}

.contacts-picker-contacts-area-contacts {
  flex: 1;
  overflow: hidden auto;
}

.contacts-picker-contacts-area-contacts:deep(.ant-collapse-content-box) {
  padding: 0 12px 0 0;
  padding-block: 0 !important;
}

.contacts-picker-contacts-area-contacts:deep(.ant-collapse-header) {
  padding: 8px 8px 8px 4px;
}

.contacts-picker-expand-icon {
  width: 16px;
  height: 16px;
  margin-right: -5px;
  transition: transform 0.3s ease-in-out;
  transform: rotate(0deg);
}

.contacts-picker-expand-icon.active {
  transform: rotate(90deg);
}

.contacts-picker-contacts-area-contact {
  width: 100%;
  padding: 8px;
  border-radius: 4px;
  display: flex;
  cursor: pointer;
  align-items: center;
  font-size: 14px;
}

.contacts-picker-contacts-area-contact-logo {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  margin-right: 8px;
}

.contacts-picker-contacts-area-contact:hover {
  background-color: rgba(230, 230, 230, 0.5);
}

.contacts-picker-contacts-area-contact:active {
  background-color: rgba(200, 200, 200, 0.5);
}

.contacts-picker-contacts-area-contact:deep(.ant-checkbox-inner) {
  border-radius: 50%;
}

.contacts-picker-contacts-area-contact:deep(.ant-checkbox-inner):hover, .contacts-picker-contacts-area-contact:hover:deep(.ant-checkbox-inner) {
  border-color: #d9d9d9;
}

.contacts-picker-contacts-area-contact:deep(.ant-checkbox-checked)::after {
  border: none;
}

.contacts-picker-contacts-area-contact:deep(.ant-checkbox) {
  flex-shrink: 0;
}

.contacts-picker-contacts-area-contact:deep(.ant-checkbox+span), .contacts-picker-contacts-area-contact-left {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.contacts-picker-preview-area {
  display: flex;
  flex-direction: column;
  padding: 2px 0 2px 12px;
  flex: 1;
  overflow: hidden;
}

.contacts-picker-selected-contacts-area {
  flex: 1;
  overflow: hidden;
}

.contacts-picker-selected-info {
  display: flex;
  font-size: 12px;
  justify-content: space-between;
  padding: 6px 0;
}

.contacts-picker-contacts-area-contact-close-btn {
  width: 14px;
  height: 14px;
  background: #ffffff;
}

.contacts-picker-contacts-area-contact-close-btn-background {
  background-color: #b8b8b8;
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

.contacts-picker-contacts-area-contact-left {
  flex: 1;
}

.contacts-picker-buttons-container {
  display: flex;
  justify-content: flex-end;
}

.contacts-picker-button {
  margin: 5px;
  width: 76px;
  height: 32px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: white;
  border-radius: 10px;
  cursor: pointer;
}

.contacts-picker-button-confirm {
  background-color: #0099ff;
  color: white;
}

.contacts-picker-button-confirm:hover {
  background-color: #008be6;
}

.contacts-picker-button-confirm:active {
  background-color: #0076c5;
  color: rgba(255, 255, 255, 0.4);
}

.contacts-picker-button-cancel {
  border: 1px solid #c4c4c4;
  color: black;
}

.contacts-picker-button-cancel:hover {
  background-color: #efefef;
}

.contacts-picker-button-cancel:active {
  background-color: #d8d8d8;
  color: gray;
}

.contacts-picker-contacts-area-search {
  margin: 5px 12px 5px 5px;
  background-color: #f1f1f1;
  border-radius: 6px;
  display: flex;
  height: 28px;
  align-items: center;
  border: 1px solid #f1f1f1;
  overflow: hidden;
}

.contacts-picker-contacts-area-search-icon {
  height: 18px;
  width: 18px;
  margin: 0 4px 0 6px;
  background-color: gray;
  flex-shrink: 0;
}

.contacts-picker-contacts-area-search:focus-within {
  border-color: #0077ed;
}

.contacts-picker-contacts-area-search-input {
  outline: none;
  background: none;
  border: none;
  font-size: 14px;
  padding: 0 4px 0 0;
  flex: 1 1 auto;
  min-width: 0;
}
</style>

<style module>
.contacts-picker-container {
  width: 520px;
  height: 540px;
  flex-direction: row;
  padding: 10px 12px 15px 15px;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 20px);
}
</style>