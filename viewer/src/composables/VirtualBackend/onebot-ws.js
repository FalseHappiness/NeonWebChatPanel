import { ref } from 'vue';
import { nanoid } from 'nanoid';

/**
 * OneBot WebSocket 连接管理器
 * 直接连接到 NapCat 的 OneBot WS 服务器，
 * 发送标准 OneBot v11 action 并接收响应/事件
 */
export class OneBotWSConnection {
  /**
   * @param {string} url - NapCat WS 服务器地址 (如 ws://127.0.0.1:3001)
   * @param {string} [token] - 可选 access_token
   */
  constructor(url, token = null) {
    this.url = url;
    this.token = token;

    // 连接状态
    this.socket = ref(null);
    this.isConnected = ref(false);
    this.reconnectAttempts = ref(0);
    this.maxReconnectAttempts = Infinity;
    this.reconnectInterval = 3000;
    this.reconnectTimer = null;
    this.isClosed = false;

    // 等待响应的 action 回调 (echo -> { resolve, reject, timeout })
    this.pendingActions = new Map();
    // 事件处理器列表
    this.eventHandlers = [];

    // 自身的 self_id（连接后从事件中获取）
    this.selfId = null;

    // 连接成功后触发
    this._onConnected = null;
    this._onDisconnected = null;
  }

  set onConnected(handler) { this._onConnected = handler; }
  set onDisconnected(handler) { this._onDisconnected = handler; }

  /**
   * 添加事件处理器
   * @param {Function} handler - 处理函数 (event: object) => void
   * @returns {Function} 取消注册的函数
   */
  addEventHandler(handler) {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /**
   * 发送标准 OneBot action 请求并等待响应
   * @param {string} action - OneBot action 名称
   * @param {object} params - 参数
   * @param {AbortSignal} [signal] - 终止信号
   * @param {number} timeout - 超时(ms)
   * @returns {Promise<any>} 响应 data
   */
  callAction(action, params = {}, signal = undefined, timeout = 60 * 1000) {
    return new Promise((resolve, reject) => {
      if (!this.socket.value || this.socket.value.readyState !== WebSocket.OPEN) {
        reject(new Error('OneBot WS is not connected'));
        return;
      }

      if (signal && signal.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }

      const echo = nanoid();

      const cleanup = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        if (this.pendingActions.has(echo)) {
          this.pendingActions.delete(echo);
          cleanup();
          reject(new DOMException('The operation was aborted', 'AbortError'));
        }
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.pendingActions.set(echo, { resolve, reject, cleanup });

      // 超时处理
      setTimeout(() => {
        if (this.pendingActions.has(echo)) {
          this.pendingActions.delete(echo);
          cleanup();
          reject(new Error(`${action} timed out after ${timeout}ms`));
        }
      }, timeout);

      // 发送标准 OneBot 请求
      const request = {
        action,
        params,
        echo,
      };
      this.socket.value.send(JSON.stringify(request));
    });
  }

  /**
   * 处理接收到的消息
   */
  _onMessage(event) {
    try {
      const data = JSON.parse(event.data);

      // 检查是否是 action 响应（有 echo 字段）
      if (data.echo && this.pendingActions.has(data.echo)) {
        const { resolve, reject, cleanup } = this.pendingActions.get(data.echo);
        this.pendingActions.delete(data.echo);
        cleanup && cleanup();

        if (data.status === 'ok' || data.retcode === 0) {
          resolve(data);
        } else {
          reject(new Error(`OneBot action failed: ${JSON.stringify(data)}`));
        }
        return;
      }

      // 如果是元事件（心跳等），忽略
      if (data.post_type === 'meta_event') {
        // 从元事件中获取 self_id
        if (data.self_id && !this.selfId) {
          this.selfId = data.self_id;
        }
        return;
      }

      // 分发事件给所有处理器
      for (const handler of this.eventHandlers) {
        try {
          handler(data);
        } catch (e) {
          console.error('OneBot event handler error:', e);
        }
      }
    } catch (e) {
      console.error('Failed to parse OneBot message:', e);
    }
  }

  /**
   * 清理所有 pending 请求
   */
  _clearAllPending() {
    for (const [echo, { reject, cleanup }] of this.pendingActions) {
      cleanup && cleanup();
      reject(new Error('OneBot WS disconnected'));
    }
    this.pendingActions.clear();
  }

  /**
   * 连接 WebSocket
   */
  connect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      // 构建 URL，可能携带 token
      let wsUrl = this.url;
      if (this.token) {
        const separator = wsUrl.includes('?') ? '&' : '?';
        wsUrl += `${separator}access_token=${encodeURIComponent(this.token)}`;
      }

      this.socket.value = new WebSocket(wsUrl);

      this.socket.value.onopen = () => {
        if (this.isClosed) return;
        this.isConnected.value = true;
        this.reconnectAttempts.value = 0;
        console.log('[OneBotWS] Connected to', this.url);
        this._onConnected && this._onConnected();
      };

      this.socket.value.onmessage = (event) => this._onMessage(event);

      this.socket.value.onclose = (ev) => {
        this.isConnected.value = false;
        console.log('[OneBotWS] Disconnected');

        if (ev.code === 1000) return; // 主动关闭

        this._clearAllPending();
        this._onDisconnected && this._onDisconnected();

        // 重连
        if (this.reconnectAttempts.value < this.maxReconnectAttempts) {
          this.reconnectAttempts.value++;
          const delay = Math.min(this.reconnectInterval * this.reconnectAttempts.value, 30000);
          console.log(`[OneBotWS] Reconnecting in ${delay / 1000}s...`);
          this.reconnectTimer = setTimeout(() => this.connect(), delay);
        }
      };

      this.socket.value.onerror = (error) => {
        console.error('[OneBotWS] Error:', error);
        this.socket.value?.close();
      };
    } catch (e) {
      console.error('[OneBotWS] Connection failed:', e);
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isClosed = true;
    this.reconnectAttempts.value = this.maxReconnectAttempts;
    this._clearAllPending();

    if (this.socket.value) {
      this.socket.value.close(1000, 'Client disconnect');
      this.socket.value = null;
    }
    this.isConnected.value = false;
  }

  destroy() {
    this.disconnect();
  }
}