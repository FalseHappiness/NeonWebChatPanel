import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue'
import vitePluginClean from 'vite-plugin-clean';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vitePluginClean({
      targetFiles: ['dist'] // 要删除的目录/文件
    }),
    {
      name: 'ignore-json-safety',
      resolveId(id) {
        // 匹配目标目录所有json
        if (/src\/components\/MessageTypes\/MessageJSON\/.*\.json$/.test(id)) {
          return false
        }
      }
    }
  ],
  external: ['vue'],
  resolve: {
    dedupe: ['vue']
  },
  build: {
    emptyOutDir: true, // 构建前自动清空 dist 目录（没用？）
  },
  server: {
    // allowedHosts: true
  }
});