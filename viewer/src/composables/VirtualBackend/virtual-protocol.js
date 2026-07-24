/**
 * VirtualProtocol - 虚拟协议拦截器
 *
 * 拦截前端对 virtual: 协议的 fetch/window.open/a 标签点击请求，
 * 通过注册的路由处理器模拟后端接口。
 *
 * 主要用于直连 OneBot 模式（isDirectOnebot=true），
 * 替代 Python 后端的 HTTP API，如 /api/get_file_data。
 */
class VirtualProtocol {
  /**
   * @param {string} protocolPrefix - 协议前缀，默认 'virtual:'
   */
  constructor(protocolPrefix = 'virtual:') {
    this.protocol = protocolPrefix;
    // 保存原始 API 用于还原
    this.originFetch = null;
    this.originOpen = null;
    this.rawFetch = null; // 永久绑定window的原生fetch，内部代理远程资源专用，不受劫持影响
    this.clickHandler = null;
    // 路由处理器: Map<pathPrefix, handler(path, fullUrl) => Response>
    this.routes = new Map();
    // 流式回调（兼容旧版，若路由未匹配则回退至此）
    this.streamFactory = null;
    // OneBot action 调用器，由外部（如 ConnectionBridgeOnebot）注入
    this.onebotActionCaller = null;
    // 下载进度回调：fn(info: { href: string, fileName: string, resolvedUrl: string }) => void
    // 设置后，a标签点击将不再直接触发下载，而是调用此回调弹窗处理
    this.downloadHandler = null;
  }

  /**
   * 设置下载回调（由 App.vue 接入下载进度弹窗）
   * @param {(info: { href: string, fileName: string, resolvedUrl: string }) => void} handler
   */
  setDownloadHandler(handler) {
    this.downloadHandler = handler;
  }

  /**
   * 设置 OneBot action 调用器
   * @param {(action: string, params: object) => Promise<any>} caller
   */
  setOneBotActionCaller(caller) {
    this.onebotActionCaller = caller;
  }

  /**
   * 设置流式生成回调（兼容旧版）
   * @param {(path: string) => Promise<ReadableStream>} fn
   */
  setStreamFactory(fn) {
    this.streamFactory = fn;
  }

  /**
   * 注册路由处理器
   * @param {string} pathPrefix - 路径前缀，如 '/api/get_file_data'
   * @param {(path: string, fullUrl: string) => Promise<Response>} handler - 处理器函数
   */
  registerRoute(pathPrefix, handler) {
    this.routes.set(pathPrefix, handler);
  }

  /**
   * 内部请求处理：根据虚拟协议 URL 返回 Response
   */
  async _handleRequest(urlStr, init) {
    // 提取协议后的路径部分，如 "virtual:/api/get_file_data?type=image&file_id=xxx" → "/api/get_file_data?type=image&file_id=xxx"
    const path = urlStr.slice(this.protocol.length);

    // 优先匹配注册的路由
    for (const [prefix, handler] of this.routes) {
      if (path.startsWith(prefix)) {
        return handler.call(this, path, urlStr, init);
      }
    }

    // 回退到 streamFactory
    if (this.streamFactory) {
      try {
        const stream = await this.streamFactory(path);
        return new Response(stream, {
          headers: {
            'Content-Type':
              path.endsWith('.txt') ? 'text/plain' :
                path.endsWith('.json') ? 'application/json' :
                  'application/octet-stream',
          },
        });
      } catch (e) {
        console.error('[VirtualProtocol] streamFactory error:', e);
        return new Response('Stream error', { status: 500 });
      }
    }

    console.error(`[VirtualProtocol] No handler for path: ${path}`);
    return new Response('Not found', { status: 404 });
  }

  /**
   * 初始化拦截，劫持全局 fetch、window.open、document 点击
   */
  mount() {
    // 保存原始 fetch
    this.originFetch = window.fetch;
    // 缓存原生fetch并永久绑定window上下文，供内部路由代理远程资源使用
    this.rawFetch = this.originFetch.bind(window);
    // 修复fetch劫持：使用普通函数+bind绑定实例，调用原生fetch强制call(window)修复Illegal invocation
    window.fetch = function (input, init) {
      const urlStr = typeof input === 'string' ? input : input.url;
      if (!urlStr.startsWith(this.protocol)) {
        return this.originFetch.call(window, input, init);
      }
      return this._handleRequest(urlStr, init);
    }.bind(this);

    // 保存原始 window.open
    this.originOpen = window.open;
    // 修复window.open劫持，绑定实例上下文，调用原生open强制绑定window
    window.open = function (url, target, features) {
      if (typeof url === 'string' && url.startsWith(this.protocol)) {
        (async () => {
          const response = await this._handleRequest(url);
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          this.originOpen.call(window, blobUrl, target, features);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
        })();
        return null;
      }
      return this.originOpen.call(window, url, target, features);
    }.bind(this);

    // 绑定 a 标签点击拦截
    this.clickHandler = async (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.href;
      if (!href.startsWith(this.protocol)) return;
      e.preventDefault();

      // 解析文件名
      const urlObj = new URL(href);
      const fileName = urlObj.searchParams.get('name') || link.download || 'file';

      // 如果设置了下载回调，委托给弹窗管理
      if (this.downloadHandler) {
        // 先尝试获取响应头中的元信息（X-Proxy-Url, X-File-Name）
        // 使用 HEAD 请求或直接 fetch 小部分数据来获取头信息
        // 但最简单的方式是直接解析 URL 参数 + 让 handler 在响应头中返回元信息
        // 异步发起请求获取响应头
        this.downloadHandler({
          href,
          fileName,
          // resolvedUrl 由弹窗在收到响应后从 X-Proxy-Url 头解析
        });
        return;
      }

      // 无下载回调时，保持原有直接下载逻辑
      const a = document.createElement('a');
      a.style.display = 'none';
      document.body.appendChild(a);

      let blobUrl;
      try {
        const response = await this._handleRequest(href);
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);

        a.href = blobUrl;
        a.download = fileName;
        a.click();
      } catch (err) {
        console.error(err);
      } finally {
        setTimeout(() => {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
          }
          document.body.removeChild(a);
        }, 3000);
      }
    };
    document.addEventListener('click', this.clickHandler);
  }

  /**
   * 还原所有原生 API，移除拦截
   */
  unmount() {
    if (this.originFetch) {
      window.fetch = this.originFetch;
      this.originFetch = null;
      this.rawFetch = null;
    }
    if (this.originOpen) {
      window.open = this.originOpen;
      this.originOpen = null;
    }
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler);
      this.clickHandler = null;
    }
  }
}

// ===================== 内置路由处理器 =====================

/**
 * 创建 /api/get_file_data 的处理器
 *
 * 模拟 Python 后端 app.py 的 get_file 接口：
 * - type=image → 调用 get_image action，获取文件路径或 URL
 * - type=record → 调用 get_record action，获取 base64 音频数据
 * - type=file  → 调用 get_file action，获取文件路径或 URL
 *
 * @param {object} options
 * @param {Function} options.callAction - (action, params) => Promise<any>，OneBot action 调用器
 * @returns {(path: string, fullUrl: string) => Promise<Response>}
 */
function createGetFileDataHandler({ callAction }) {
  return async function (path, fullUrl) {
    // 解析 URL 参数
    const queryIndex = fullUrl.indexOf('?');
    const params = new URLSearchParams(queryIndex >= 0 ? fullUrl.slice(queryIndex) : '');

    const type = params.get('type') || 'file';
    const fileId = params.get('file_id');
    const outFormat = params.get('out_format') || 'mp3';

    if (!fileId) {
      return new Response('Missing file_id parameter', { status: 400 });
    }

    const allowedTypes = ['image', 'record', 'file'];
    if (!allowedTypes.includes(type)) {
      return new Response(`Invalid type: ${type}`, { status: 400 });
    }

    try {
      let action, actionParams;

      if (type === 'record') {
        action = 'get_record';
        actionParams = { file_id: fileId, out_format: outFormat };
      } else if (type === 'image') {
        action = 'get_image';
        actionParams = { file_id: fileId };
      } else {
        action = 'get_file';
        actionParams = { file_id: fileId };
      }

      const result = await callAction(action, actionParams);
      const data = result?.data || result;

      if (type === 'record') {
        // 音频：优先 base64
        const base64 = data.base64 || '';
        if (base64) {
          const binaryStr = atob(base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const mime = outFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
          return new Response(bytes, {
            headers: {
              'Content-Type': mime,
              'Content-Disposition': `inline; filename=audio.${outFormat}`,
            },
          });
        }

        // 无 base64 则返回 404
        return new Response('Audio data not available', { status: 404 });
      }

      // 图片/文件：优先尝试 url 字段
      const url = data.url || '';
      if (url) {
        // 通过原生rawFetch代理该URL，避开劫持后的fetch防止递归&上下文报错
        const proxyResponse = await this.rawFetch(url);
        const contentType = proxyResponse.headers.get('content-type') || 'application/octet-stream';
        return new Response(proxyResponse.body, {
          status: proxyResponse.status,
          headers: { 'Content-Type': contentType },
        });
      }

      // 如果有 file 路径但没有 url，直接返回 404（浏览器无法访问本地文件系统）
      const filePath = data.file || '';
      if (filePath) {
        console.warn(`[VirtualProtocol] File path returned but cannot access locally: ${filePath}`);
        return new Response('Local file access not supported in browser', { status: 501 });
      }

      return new Response('File not found', { status: 404 });
    } catch (e) {
      console.error(`[VirtualProtocol] get_file_data error (type=${type}, file_id=${fileId}):`, e);
      return new Response(`Error: ${e.message}`, { status: 500 });
    }
  };
}

/**
 * 创建 /api/get_stream_file_data 的处理器
 *
 * 模拟 Python 后端 app.py 的 get_stream_file 接口。
 * 在直连 OneBot 模式下，Python 后端使用自定义的 download_file_stream action，
 * 该 action 返回流式 base64 分块数据。但浏览器端无法直接使用该自定义流式 action，
 * 因此这里采用等效方案：
 *   1. 调用 get_file action 获取文件真实 URL
 *   2. 通过 rawFetch 代理下载该 URL 并返回流式 Response
 *
 * @param {object} options
 * @param {Function} options.callAction - (action, params) => Promise<any>，OneBot action 调用器
 * @returns {(path: string, fullUrl: string) => Promise<Response>}
 */
function createGetStreamFileDataHandler({ callAction }) {
  return async function (path, fullUrl, init) {
    // 解析 URL 参数
    const queryIndex = fullUrl.indexOf('?');
    const params = new URLSearchParams(queryIndex >= 0 ? fullUrl.slice(queryIndex) : '');

    const fileId = params.get('file_id') || params.get('file');
    if (!fileId) {
      return new Response('Missing file_id parameter', { status: 400 });
    }

    try {
      // 步骤1：调用 get_file 获取文件的真实 URL
      const result = await callAction('get_file', { file_id: fileId });
      const data = result?.data || result;
      const fileUrl = data?.url || data?.file;

      if (!fileUrl) {
        console.error('[VirtualProtocol] get_stream_file_data: No URL returned from get_file', data);
        return new Response('File URL not available', { status: 404 });
      }

      // 步骤2：通过原生rawFetch代理下载文件，以流式方式返回
      const proxyResponse = await this.rawFetch(fileUrl, {
        signal: init?.signal,
      });
      const contentType = proxyResponse.headers.get('content-type') || 'application/octet-stream';

      // 尝试从 Content-Disposition 或 URL 中提取文件名
      const contentDisposition = proxyResponse.headers.get('content-disposition');
      let fileName = 'unknown_file';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i) ||
                      contentDisposition.match(/filename="([^"]+)"/i);
        if (match) {
          fileName = decodeURIComponent(match[1]);
        }
      } else {
        // 从 URL 路径中提取文件名
        const urlPath = fileUrl.split('?')[0];
        const pathSegments = urlPath.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment && lastSegment !== '/') {
          fileName = decodeURIComponent(lastSegment);
        }
      }

      // 构建 Content-Disposition 头（与后端 app.py get_stream_file 保持一致）
      // 后端: filename="{ascii_only_name}"; filename*=UTF-8''{quote(name)}
      const asciiName = encodeURIComponent(fileName);
      const encodedFilename = encodeURIComponent(fileName);
      const disposition = `inline; filename="${asciiName}"; filename*=UTF-8''${encodedFilename}`;

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': disposition,
          'Content-Length': proxyResponse.headers.get('content-length') || '',
          'X-Proxy-Url': fileUrl,
          'X-File-Name': encodeURIComponent(fileName),
        },
      });
    } catch (e) {
      const errorDetail = e.message || String(e);
      const errorBody = JSON.stringify({
        error: true,
        message: errorDetail,
        action: 'get_file',
        params: { file_id: fileId },
      });
      console.error(`[VirtualProtocol] get_stream_file_data error (file_id=${fileId}):`, e);
      return new Response(errorBody, {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

/**
 * 允许代理的域名白名单（与 app.py 的 is_allowed_proxy_domain 保持一致）
 */
const ALLOWED_PROXY_DOMAINS = [
  'multimedia.nt.qq.com.cn',
  'gxh.vip.qq.com',
  'gzc-download.ftn.qq.com',
];

const ALLOWED_PROXY_SUFFIXES = [
  '.gtimg.cn',
  '.qpic.cn',
  '.ugcimg.cn',
  '.ftn.qq.com',
];

/**
 * 检查 URL 是否在允许代理的域名白名单内
 * @param {string} targetUrl
 * @returns {boolean}
 */
function isAllowedProxyDomain(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname;

    // 完整匹配
    if (ALLOWED_PROXY_DOMAINS.includes(hostname)) {
      return true;
    }

    // 后缀匹配
    for (const suffix of ALLOWED_PROXY_SUFFIXES) {
      if (hostname.endsWith(suffix)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * 创建 /api/proxy_group_file 的处理器
 *
 * 模拟 Python 后端 app.py 的 proxy_group_file 接口：
 *   1. 支持直接传入 url 参数进行代理（需要域名白名单校验）
 *   2. 支持传入 group_id + file_id，通过 get_group_file_url action 获取真实下载链接
 *   3. 流式代理远程文件，透传 Range 请求头（用于音视频拖动播放）
 *
 * @param {object} options
 * @param {Function} options.callAction - (action, params) => Promise<any>，OneBot action 调用器
 * @returns {(path: string, fullUrl: string) => Promise<Response>}
 */
function createProxyGroupFileHandler({ callAction }) {
  return async function (path, fullUrl, init) {
    // 解析 URL 参数
    const queryIndex = fullUrl.indexOf('?');
    const params = new URLSearchParams(queryIndex >= 0 ? fullUrl.slice(queryIndex) : '');

    const targetUrl = params.get('url');
    const targetName = params.get('name');
    const fileId = params.get('file_id');
    const groupId = params.get('group_id');

    let resolvedUrl = null;
    let fileName = targetName || 'file';

    try {
      // 分支1：直接传入 URL 且在白名单内
      if (targetUrl && isAllowedProxyDomain(targetUrl)) {
        resolvedUrl = targetUrl;
      }
      // 分支2：通过 group_id + file_id 获取真实文件链接
      else if (fileId && groupId) {
        const result = await callAction('get_group_file_url', {
          group_id: groupId,
          file_id: fileId,
        });
        const data = result?.data || result;
        resolvedUrl = data?.url;

        if (!resolvedUrl) {
          console.error('[VirtualProtocol] proxy_group_file: get_group_file_url returned no URL', data);
          return new Response(
            JSON.stringify({ status: 'error', message: '没有有效文件', code: 400 }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ status: 'error', message: '缺少参数: 需要 url 或 (group_id + file_id)', code: 400 }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 确定文件名（如果未提供，从 URL 中提取）
      if (!fileName || fileName === 'file') {
        const urlPath = resolvedUrl.split('?')[0];
        const pathSegments = urlPath.split('/');
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment && lastSegment !== '/') {
          fileName = decodeURIComponent(lastSegment);
        }
      }

      // 判断 MIME 类型
      let mediaType = 'application/octet-stream';
      if (fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const mimeMap = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp',
          'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
          'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg',
          'pdf': 'application/pdf', 'zip': 'application/zip',
          'rar': 'application/vnd.rar', '7z': 'application/x-7z-compressed',
          'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'txt': 'text/plain', 'json': 'application/json',
        };
        if (mimeMap[ext]) {
          mediaType = mimeMap[ext];
        }
      }

      // 发起代理请求
      const proxyHeaders = {};
      const rangeHeader = params.get('Range') || params.get('range');
      if (rangeHeader) {
        proxyHeaders['Range'] = rangeHeader;
      }

      // 使用原生rawFetch，避免劫持递归与上下文报错
      const proxyResponse = await this.rawFetch(resolvedUrl, {
        headers: Object.keys(proxyHeaders).length > 0 ? proxyHeaders : undefined,
        signal: init?.signal,
      });

      // 构建响应头（与后端 app.py get_content_disposition 保持一致）
      const asciiName = encodeURIComponent(fileName);
      const encodedFilename = encodeURIComponent(fileName);
      const responseHeaders = {
        'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodedFilename}`,
        'Accept-Ranges': 'bytes',
        'Content-Type': mediaType,
        'X-Proxy-Url': resolvedUrl,
        'X-File-Name': encodeURIComponent(fileName),
      };

      // 透传 Range 相关响应头
      const passThroughKeys = ['content-range', 'content-length', 'accept-ranges', 'etag'];
      for (const key of passThroughKeys) {
        const val = proxyResponse.headers.get(key);
        if (val) {
          responseHeaders[key] = val;
        }
      }

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        headers: responseHeaders,
      });
    } catch (e) {
      const errorDetail = e.message || String(e);
      const errorBody = JSON.stringify({
        error: true,
        message: errorDetail,
        action: 'get_group_file_url',
        params: { group_id: groupId, file_id: fileId },
      });
      console.error(`[VirtualProtocol] proxy_group_file error:`, e);
      return new Response(errorBody, {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

export {
  VirtualProtocol as default,
  createGetFileDataHandler,
  createGetStreamFileDataHandler,
  createProxyGroupFileHandler,
};