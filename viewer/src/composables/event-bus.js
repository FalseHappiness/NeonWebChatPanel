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
   * @param {string} type 事件类型
   * @param  {...any} args 参数
   * @returns {Promise<any>}
   */
  emit(type, ...args) {
    // 检查是否注册监听
    if (!this.has(type)) {
      return Promise.reject(new Error(`CalledEmitter: no listener for event "${type}"`))
    }

    const requestId = nanoid()
    const timeoutMs = 30000

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#bus.off(`__reply__${requestId}`)
        reject(new Error(`CalledEmitter request ${type} ${requestId} timeout`))
      }, timeoutMs)

      this.#bus.once(`__reply__${requestId}`, (result, error) => {
        clearTimeout(timer)
        if (error) reject(error)
        else resolve(result)
      })

      this.#bus.emit(type, requestId, ...args)
    })
  }
}

// 导出实例
export const CalledEmitter = new CalledEmitterClass()