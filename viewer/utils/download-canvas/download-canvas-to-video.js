/**
 * 将Canvas动画转换为MP4视频
 * @param {HTMLCanvasElement} canvas - 要录制的Canvas元素
 * @param {number} fps - 帧率（每秒帧数）
 * @param {number} duration - 视频时长（秒）
 * @returns {Promise<string>} - 返回MP4的Blob URL
 */
async function canvasToMP4(canvas, fps, duration) {
  // 创建并添加下载按钮
  const downloadBtn = document.createElement('a');
  downloadBtn.className = 'download-mp4-btn';
  downloadBtn.textContent = '录制 Canvas 动画';
  downloadBtn.style.cssText = `
        position: fixed;
        top: 100px;
        left: 100px;
        z-index: 9999;
        display: block;
        margin: 10px;
        padding: 8px 16px;
        background-color: #4CAF50;
        color: white;
        border-radius: 4px;
        text-decoration: none;
        cursor: pointer;
        font-family: Arial, sans-serif;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
  document.body.appendChild(downloadBtn);

  // 设置Canvas以便频繁读取
  canvas.getContext('2d', { willReadFrequently: true });

  return new Promise((resolve) => {
    downloadBtn.onclick = async () => {
      if (downloadBtn.textContent !== '录制 Canvas 动画') return
      try {
        // 更新按钮状态
        downloadBtn.textContent = '录制中...';
        downloadBtn.style.backgroundColor = '#2196F3';
        downloadBtn.removeAttribute('download');
        downloadBtn.removeAttribute('href');

        // 创建MediaRecorder
        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });

        // 收集视频数据
        const chunks = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);

        // 开始录制
        recorder.start();

        // 设置停止时间
        setTimeout(() => {
          recorder.stop();
          stream.getTracks().forEach(track => track.stop());
        }, duration * 1000);

        // 录制完成
        recorder.onstop = async () => {
          // 合并视频数据
          const blob = new Blob(chunks, { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);

          // 打印URL
          console.log('MP4 URL:', url);

          // 更新下载按钮
          downloadBtn.textContent = '下载 MP4';
          downloadBtn.style.backgroundColor = '#4CAF50';
          downloadBtn.href = url;
          downloadBtn.download = `canvas-animation-${Date.now()}.mp4`;

          resolve(url);
        };
      } catch (error) {
        console.error('录制失败:', error);
        downloadBtn.textContent = '录制失败';
        downloadBtn.style.backgroundColor = '#f44336';
      }
    };
  });
}

// 使用示例
// const canvas = document.getElementById('myCanvas');
// canvasToMP4(canvas, 30, 5); // 30fps，5秒视频