/**
 * 捕获Canvas动画并保存为GIF
 * @param {HTMLCanvasElement} canvas - 要捕获的Canvas元素
 * @param {object} options - 配置选项
 * @param {number} options.duration - 录制时长(毫秒，默认10000)
 * @param {number} options.fps - 帧率(默认15)
 * @param {number} options.quality - 质量(1-20，1最好，默认10)
 */
async function captureCanvasAsGif(canvas, options = {}) {
  const { duration = 10000, fps = 15, quality = 10 } = options;

  // 创建下载按钮
  const downloadBtn = document.createElement('a');
  downloadBtn.className = 'download-gif-btn';
  downloadBtn.textContent = '录制GIF动画';
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

  try {
    // 加载GIF.js主脚本
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js');

    // 获取Worker脚本内容并转换为Blob URL
    const workerScriptUrl = await getWorkerScriptBlobUrl(
      'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js'
    );

    // 初始化GIF编码器
    const gif = new GIF({
      workers: 2,
      quality: quality,
      width: canvas.width,
      height: canvas.height,
      workerScript: workerScriptUrl
    });

    // 点击按钮开始录制
    downloadBtn.onclick = async function () {
      if (downloadBtn.textContent === '录制GIF动画') {
        // 开始录制
        downloadBtn.textContent = '录制中...';
        downloadBtn.style.backgroundColor = '#2196F3';

        const startTime = Date.now();
        let isRendering = false;

        // 捕获帧的函数
        function captureFrame() {
          const currentTime = Date.now();
          const elapsed = currentTime - startTime;

          if (elapsed < duration) {
            // 使用requestAnimationFrame优化性能
            requestAnimationFrame(() => {
              gif.addFrame(canvas, {
                delay: 1000 / fps,
                copy: true
              });
            });

            const nextFrameTime = 1000 / fps - (Date.now() - currentTime);
            setTimeout(captureFrame, Math.max(0, nextFrameTime));
          } else if (!isRendering) {
            isRendering = true;
            gif.render();
          }
        }

        // 开始捕获帧
        captureFrame();

        // 处理完成事件
        gif.on('finished', function (blob) {
          const blobUrl = URL.createObjectURL(blob);
          console.log('gif blob url', blobUrl)
          downloadBtn.href = blobUrl;
          downloadBtn.download = 'canvas_animation.gif';
          downloadBtn.textContent = '下载GIF';
          downloadBtn.style.backgroundColor = '#4CAF50';
        });

      } else if (downloadBtn.textContent === '下载GIF') {
        return;
      }
    };

  } catch (error) {
    console.error('GIF录制初始化失败:', error);
    downloadBtn.textContent = '初始化失败，点击重试';
    downloadBtn.style.backgroundColor = '#f44336';
    downloadBtn.onclick = () => captureCanvasAsGif(canvas, options);
  }
}

// 辅助函数：加载脚本
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// 辅助函数：获取Worker脚本Blob URL
async function getWorkerScriptBlobUrl(workerUrl) {
  try {
    const response = await fetch(workerUrl);
    if (!response.ok) throw new Error(`HTTP错误! 状态码: ${response.status}`);
    const scriptText = await response.text();
    const blob = new Blob([scriptText], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn('获取Worker脚本失败，使用简化版:', error);
    const fallbackWorkerScript = `self.onmessage=function(e){e.data.type==="frame"&&setTimeout(()=>{self.postMessage({type:"frameProcessed",data:e.data.data.buffer,delay:e.data.delay},[e.data.data.buffer])},50)};`;
    const blob = new Blob([fallbackWorkerScript], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }
}

// 使用示例
(function () {
  const canvas = document.querySelector("#polar");
  if (canvas) {
    // 调用函数并传入质量参数(1-20，1质量最好但文件最大)
    captureCanvasAsGif(canvas, {
      duration: 1000,
      fps: 24,
      quality: 1
    });
  } else {
    console.error('Canvas元素未找到');
  }
})();