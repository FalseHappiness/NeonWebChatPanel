<template>
  <a class="message-box-less message-file-message" :title="name" target="_blank" :href="url">
    <div class="top-side">
      <div class="outer-container">
        <TruncatedText :content="name"></TruncatedText>
      </div>
      <img alt="" :src="`/QQ/fileIcon/${ getFileIcon(name) }`">
    </div>
    <span class="text-muted">{{ formatFileSize(size) }}</span>
  </a>
</template>

<script>
import TruncatedText from "../utils/TruncatedText.vue";
import { defineComponent } from "vue";


const getFileIcon = (name) => {
  if (!name) return 'unknown.png';

  const extension = name.split('.').pop().toLowerCase();

  // 按返回的图片名分类文件后缀
  const iconGroups = {
    'image.png': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'],
    'ps.png': ['psd'],
    'ai.png': ['ai'],
    'sketch.png': ['sketch'],
    'pdf.png': ['pdf'],
    'doc.png': ['doc', 'docx', 'rtf'],
    'txt.png': ['txt'],
    'note.png': ['md', 'markdown'],
    'xls.png': ['xls', 'xlsx', 'csv'],
    'numbers.png': ['numbers'],
    'ppt.png': ['ppt', 'pptx'],
    'keynote.png': ['key', 'keynote'],
    'pages.png': ['pages'],
    'zip.png': ['zip'],
    'rar.png': ['rar', '7z', 'tar', 'gz'],
    'exe.png': ['exe', 'msi'],
    'dmg.png': ['dmg'],
    'pkg.png': ['pkg', 'deb', 'rpm'],
    'apk.png': ['apk'],
    'ipa.png': ['ipa'],
    'code.png': ['js', 'jsx', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'html', 'css', 'php', 'sh', 'go', 'rb', 'json', 'xml', 'sql'],
    'audio.png': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'],
    'video.png': ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'mpeg'],
    'font.png': ['ttf', 'otf', 'woff', 'woff2', 'eot'],
    'mindmap.png': ['mm', 'xmind', 'mindnode'],
    'link.png': ['url', 'lnk', 'webloc']
  };

  // 查找匹配的后缀
  for (const [icon, exts] of Object.entries(iconGroups)) {
    if (exts.includes(extension)) {
      return icon;
    }
  }

  return 'unknown.png';
}

const formatFileSize = (bytesStr) => {
  // 处理非字符串输入
  if (typeof bytesStr !== 'string') {
    bytesStr = String(bytesStr);
  }

  // 移除可能的逗号或空格
  const cleanStr = bytesStr.replace(/[,\s]/g, '');

  // 转为数字
  const bytes = parseInt(cleanStr, 10);

  // 处理无效输入
  if (isNaN(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const k = 1024;
  let unitIndex = 0;
  let size = bytes;

  // 计算合适的单位
  while (size >= k && unitIndex < units.length - 1) {
    size /= k;
    unitIndex++;
  }

  // 格式化为1位小数
  let formattedSize;
  if (Number.isInteger(size)) {
    formattedSize = size.toFixed(1); // 例如 1.0
  } else {
    formattedSize = size.toFixed(1);
    // 移除末尾的.0（可选）
    // formattedSize = formattedSize.replace(/\.0$/, '');
  }

  // 确保单位和数字之间有1个空格
  return `${formattedSize} ${units[unitIndex]}`;
}

export default defineComponent({
  components: { TruncatedText },
  props: {
    name: {
      type: String,
      default: ''
    },
    url: {
      type: String,
      default: ''
    },
    size: {
      type: [Number, String],
      default: 0
    }
  },
  methods: {
    formatFileSize: formatFileSize,
    getFileIcon: getFileIcon
  }
})

export {
  getFileIcon,
  formatFileSize
}
</script>

<style scoped>
.message-file-message {
  width: 270px;
  max-width: 100%;
  height: 90px;
  display: block;
  background-color: white;
  color: black;
  text-decoration: none !important;
  border-radius: 8px;
}


.message-file-message hr {
  height: 1px;
  border: 0;
  margin: 10px 0 0 0;
  width: 100%;
  background-color: #f2f2f2;
}

.message-file-message .top-side {
  padding-top: 10px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  height: 60px;
}

.message-file-message .top-side img {
  height: 50px;
  width: 50px;
  margin-right: 10px;
}

.text-muted {
  margin-left: 10px;
  white-space: nowrap;
}

.outer-container {
  margin-left: 10px;
  margin-top: 3px;
  width: 70%;
  overflow: hidden;
}
</style>