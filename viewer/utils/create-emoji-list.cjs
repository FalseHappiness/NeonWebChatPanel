// createEmojiList.cjs
const fs = require('fs');
const path = require('path');

// 配置
const emojiDir = path.join(process.cwd(), 'public', 'QQ', 'EmojiSystermResource');
const targetDir = path.join(process.cwd(), 'src', 'assets', 'EmojiSystermResource');
const outputFile = path.join(targetDir, 'emoji_files.json');
// 查找 QQ 表情配置文件（用户目录）
const qqEmojiPath = path.join(
  process.env.USERPROFILE,
  'Documents\\Tencent Files\\nt_qq\\global\\nt_data\\Emoji\\emoji-resource\\face_config.json'
);

// 递归获取所有文件
function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // 如果是目录，递归处理
      getFiles(filePath, fileList);
    } else {
      // 如果是文件，添加到列表
      const relativePath = path.relative(
        path.join(process.cwd(), 'public'),
        filePath
      ).replace(/\\/g, '/'); // Windows 路径转换为正斜杠

      fileList.push(`/${relativePath}`);
    }
  });

  return fileList;
}

// 复制所有JSON文件到目标目录（非递归）
function copyJsonFiles(sourceDir, targetDir) {
  // 确保目标目录存在
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 读取源目录下的文件（非递归）
  const files = fs.readdirSync(sourceDir);
  let copiedCount = 0;

  files.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const stat = fs.statSync(sourcePath);

    // 只处理文件（不处理目录）且是JSON文件
    if (stat.isFile() && path.extname(file).toLowerCase() === '.json') {
      const targetPath = path.join(targetDir, file);
      fs.copyFileSync(sourcePath, targetPath);
      copiedCount++;
      console.log(`已复制: ${file}`);
    }
  });

  return copiedCount;
}

// 查找 QQNT 默认表情（程序目录）
function findLatestQQNTVersion(basePath) {
  try {
    const versions = fs.readdirSync(basePath)
      .filter(dir => /^\d+\.\d+\.\d+-\d+$/.test(dir))
      .sort((a, b) => {
        const [aVer, aBuild] = a.split('-');
        const [bVer, bBuild] = b.split('-');
        return bVer.localeCompare(aVer) || Number(bBuild) - Number(aBuild);
      });

    return versions.length > 0 ? versions[0] : null;
  } catch (e) {
    return null;
  }
}

function findQQNTEmojiConfig() {
  // 检查所有盘符
  const drives = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  for (const drive of drives) {
    const programPath = `${drive}:\\Program Files\\Tencent\\QQNT\\versions`;
    if (!fs.existsSync(programPath)) continue;

    const latestVersion = findLatestQQNTVersion(programPath);
    if (!latestVersion) continue;

    const configPath = path.join(
      programPath,
      latestVersion,
      'resources\\app\\resource\\default-emojis\\default_config.json'
    );

    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

// 主函数
function main() {
  try {
    // 检查源目录是否存在
    if (!fs.existsSync(emojiDir)) {
      throw new Error(`目录不存在: ${emojiDir}`);
    }

    // 获取所有文件
    const emojiFiles = getFiles(emojiDir);

    // 写入文件列表
    fs.writeFileSync(outputFile, JSON.stringify(emojiFiles, null, 2));
    console.log(`成功生成 emoji 文件列表，共 ${emojiFiles.length} 个文件`);
    console.log(`输出文件: ${outputFile}`);

    // 复制JSON文件到src/assets目录
    const copiedFiles = copyJsonFiles(emojiDir, targetDir);
    console.log(`已复制 ${copiedFiles} 个JSON文件到 ${targetDir}`);

    // 表情描述
    // 先复制用户目录的配置
    if (fs.existsSync(qqEmojiPath)) {
      const targetPath = path.join(targetDir, 'face_config.json');
      fs.copyFileSync(qqEmojiPath, targetPath);
      console.log(`已复制用户表情配置到: ${targetPath}`);
    } else {
      console.log('未找到 face_config.json');
    }

    // 查找程序目录
    const qqntConfigPath = findQQNTEmojiConfig();
    if (qqntConfigPath) {
      const targetPath = path.join(targetDir, 'default_config.json');
      fs.copyFileSync(qqntConfigPath, targetPath);
      console.log(`已复制QQNT默认表情配置到: ${targetPath}`);
    } else {
      console.log('未找到 default_config.json');
    }
  } catch (error) {
    console.error('处理过程中出错:', error);
    process.exit(1);
  }
}

// 执行
main();
