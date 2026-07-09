<template>
  <div class="markdown-message" v-html="renderedContent"></div>
</template>

<script>
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default {
  name: 'MarkdownMessage',
  props: {
    content: {
      type: String,
      required: true,
      default: ''
    },
    // 可选：是否使用 GitHub 风格的 Markdown
    gfm: {
      type: Boolean,
      default: true
    },
    // 可选：是否在表格和代码块中使用更严格的解析
    breaks: {
      type: Boolean,
      // 单回车换行
      default: true
    },
    // 可选：是否启用代码高亮
    highlight: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    renderedContent() {
      // 配置 marked
      marked.setOptions({
        gfm: this.gfm,
        breaks: this.breaks,
        highlight: this.highlight ? this.highlightCode : null
      });

      // 渲染 Markdown 并净化 HTML
      const rawMarkdown = marked(this.content || '');
      return DOMPurify.sanitize(rawMarkdown);
    }
  },
  methods: {
    // 可选的代码高亮方法
    highlightCode(code, language) {
      // 这里可以集成 highlight.js 或其他高亮库
      // 例如：
      // const hljs = require('highlight.js');
      // try {
      //   return hljs.highlight(language, code).value;
      // } catch (e) {
      //   return hljs.highlightAuto(code).value;
      // }
      return code;
    }
  }
};
</script>

<style scoped>
.markdown-message {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  display: block;
}

.markdown-message :deep(img) {
  max-width: 100%
}

.markdown-message :deep(hr) {
  border-top: 1px solid #f5f5f5;
}

.markdown-message :deep(h1) {
  font-size: 2em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-message :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 0.3em;
}

.markdown-message :deep(p) {
  /*margin: 16px 0;*/
  margin: 0;
}

.markdown-message :deep(a) {
  color: #0f9fff;
  text-decoration: none;
  cursor: pointer;
}

.markdown-message :deep(a:hover) {
  color: #0f9fff;
  text-decoration: none;
}

.markdown-message :deep(code) {
  background-color: rgba(27, 31, 35, 0.05);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}

.markdown-message :deep(pre) {
  background-color: #f6f8fa;
  border-radius: 3px;
  padding: 16px;
  overflow: auto;
}

.markdown-message :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.markdown-message :deep(blockquote) {
  border-left: 2px solid #f2f2f2;
  color: #999999;
  padding: 0 1em;
  margin: 0 0 8px 0;
}

.markdown-message :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
}

.markdown-message :deep(table th),
.markdown-message :deep(table td) {
  border: 1px solid #dfe2e5;
  padding: 6px 13px;
}

.markdown-message :deep(table tr) {
  background-color: #fff;
  border-top: 1px solid #c6cbd1;
}

.markdown-message :deep(table tr:nth-child(2n)) {
  background-color: #f6f8fa;
}
</style>