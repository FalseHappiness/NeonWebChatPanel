import { EventEmitter } from 'eventemitter3'
import { nanoid } from 'nanoid'

// 原有全局 emitter（保持原样不变）
export const Emitter = new EventEmitter();

// 新增可调用版 Emitter
class CalledEmitterClass {
  #bus = new EventEmitter()

  // 判断是否存在对应事件监听
  has(type) {
    const events = this.#bus._events || {}
    return !!events[type]
  }

  /**
   * 注册监听
   * @param {string} type 事件类型
   * @param {Function} handler 处理函数 (requestId, ...args) => any | Promise<any>
   */
  on(type, handler) {
    this.#bus.on(type, async (requestId, ...args) => {
      try {
        const result = await handler(...args)
        this.#bus.emit(`__reply__${requestId}`, result)
      } catch (err) {
        this.#bus.emit(`__reply__${requestId}`, null, err)
      }
    })
  }

  off(type, handler) {
    this.#bus.off(type, handler)
  }

  /**
   * 发起调用，await 获取返回值
   * @param {string | {type: string, timeout?: number} | [type: string, timeout?: number]} info
   * 事件配置信息，支持三种格式：
   * 1. 字符串：仅代表事件 type
   * 2. 对象：{ type: 事件名, timeout?: 超时毫秒数 }
   * 3. 数组：[type, timeout?]
   * @param  {...any} args 额外透传的事件参数
   * @returns {Promise<any>}
   */
  emit(info, ...args) {
    let type, timeout;
    if (typeof info === 'object') {
      ({ type, timeout } = info)
    }
    if (Array.isArray(info)) {
      ([type, timeout] = info)
    }
    if (typeof info === 'string') {
      type = info
    }
    // 检查是否注册监听
    if (!this.has(type)) {
      return Promise.reject(new Error(`CalledEmitter: no listener for event "${type}"`))
    }

    const requestId = nanoid()
    const timeoutMs = timeout === null ? undefined : timeout || 60 * 1000

    return new Promise((resolve, reject) => {
      const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
        this.#bus.off(`__reply__${requestId}`)
        reject(new Error(`CalledEmitter request ${type} ${requestId} timeout`))
      }, timeoutMs)

      this.#bus.once(`__reply__${requestId}`, (result, error) => {
        timer ? clearTimeout(timer) : 0;
        if (error) reject(error)
        else resolve(result)
      })

      this.#bus.emit(type, requestId, ...args)
    })
  }
}

// 导出实例
export const CalledEmitter = new CalledEmitterClass()