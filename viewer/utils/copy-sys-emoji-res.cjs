const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const access = promisify(fs.access);
const readdir = promisify(fs.readdir);

async function deleteAndRecreateDir(dirPath) {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
    console.log(`已删除目录: ${dirPath}`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    console.log(`目录不存在，无需删除: ${dirPath}`);
  }
  await fs.promises.mkdir(dirPath, { recursive: true });
  console.log(`已创建目录: ${dirPath}`);
}

async function copyEntireDir(srcDir, destDir) {
  try {
    // 使用 filter 排除 .DS_Store 文件
    await fs.promises.cp(srcDir, destDir, {
      recursive: true,
      force: true,
      filter: (src) => {
        const filename = path.basename(src);
        // 排除 .DS_Store normal_emojiids.json super_emojiids.json 文件
        const excludeFiles = ['.DS_Store', 'normal_emojiids.json', 'super_emojiids.json'];
        return !excludeFiles.includes(filename);
      }
    });
    console.log(`已复制目录: ${srcDir} -> ${destDir}`);
  } catch (err) {
    console.error(`复制目录时出错: ${srcDir}`, err);
    throw err;
  }
}

async function findAndCopyEmojiResources() {
  const baseDir = path.join(process.cwd(), 'public', 'QQ');
  const emojiDir = path.join(baseDir, 'EmojiSystermResource');

  // 1. 清理目标目录
  await deleteAndRecreateDir(emojiDir);

  // 2. 扫描Tencent Files目录
  const tencentFilesDir = path.join(process.env.USERPROFILE, 'Documents', 'Tencent Files');
  console.log(`正在扫描: ${tencentFilesDir}`);

  try {
    const items = await readdir(tencentFilesDir, { withFileTypes: true });
    const uinDirs = items.filter(dirent => dirent.isDirectory() && /^\d+$/.test(dirent.name));

    // 按修改时间排序（最新的在前）
    const sortedUinDirs = await Promise.all(uinDirs.map(async dirent => {
      const dirPath = path.join(tencentFilesDir, dirent.name);
      const stats = await fs.promises.stat(dirPath);
      return {
        path: dirPath,
        mtime: stats.mtimeMs,
        name: dirent.name
      };
    })).then(dirs => dirs.sort((a, b) => b.mtime - a.mtime));

    for (const uinDir of sortedUinDirs) {
      const emojiSourceDir = path.join(
        uinDir.path,
        'nt_qq', 'nt_data', 'Emoji',
        'BaseEmojiSyastems', 'EmojiSystermResource'
      );

      try {
        await access(emojiSourceDir);
        console.log(`找到资源目录: ${emojiSourceDir}`);

        // 3. 直接复制整个目录（已过滤 .DS_Store）
        await copyEntireDir(emojiSourceDir, emojiDir);
        console.log(`✅ 已替换全部Emoji资源, uin: ${uinDir.name}`);
        return; // 找到第一个（最新的）有效目录后退出
      } catch (err) {
        if (err.code !== 'ENOENT') console.error(`访问失败: ${emojiSourceDir}`, err);
      }
    }
    console.log('⚠️ 未找到任何Emoji资源目录');
  } catch (err) {
    console.error('扫描失败:', err);
  }
}

findAndCopyEmojiResources().catch(console.error);