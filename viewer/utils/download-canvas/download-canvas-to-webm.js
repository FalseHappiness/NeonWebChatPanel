/**
 * 将动画 Canvas 转换为 WebM 视频
 * @param {HTMLCanvasElement} canvas - 要录制的 Canvas 元素
 * @param {number} fps - 帧率 (帧/秒)
 * @param {number} duration - 录制时长 (秒)
 */
function canvasToWebM(canvas, fps, duration) {
  // 创建并添加下载按钮
  const downloadBtn = document.createElement('a');
  downloadBtn.className = 'download-webm-btn';
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

  // 设置 Canvas 为频繁读取模式
  canvas.getContext('2d', { willReadFrequently: true });

  downloadBtn.onclick = async () => {
    if (downloadBtn.download) {
      return
    }
    try {
      // 更新按钮状态
      downloadBtn.textContent = '录制中...';
      downloadBtn.style.backgroundColor = '#2196F3';

      // 创建 MediaRecorder
      const stream = canvas.captureStream(fps);
      const chunks = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm; codecs=vp9',
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });

      // 收集数据块
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      // 录制完成
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);

        console.log('WebM URL:', url);

        // 更新下载按钮
        downloadBtn.textContent = '下载 WebM';
        downloadBtn.style.backgroundColor = '#4CAF50';
        downloadBtn.href = url;
        downloadBtn.download = `canvas_animation_${new Date().toISOString().slice(0, 19)}.webm`;
      };

      // 开始录制
      mediaRecorder.start();

      // 设置录制时长
      setTimeout(() => {
        mediaRecorder.stop();
        stream.getTracks().forEach(track => track.stop());
      }, duration * 1000);

    } catch (error) {
      console.error('录制失败:', error);
      downloadBtn.textContent = '录制失败';
      downloadBtn.style.backgroundColor = '#f44336';
    }
  };
}

// 使用示例:
// const canvas = document.getElementById('myCanvas');
// canvasToWebM(canvas, 128, 8); // 128fps, 8秒时长