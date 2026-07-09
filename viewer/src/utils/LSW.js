const LSW = {
  storage: {},
  get(key) {
    const This = this;

    // 如果已经缓存过，直接返回缓存的值
    if (this.storage[key] !== undefined) {
      return this.storage[key];
    }

    // 从localStorage获取并解析
    const value = JSON.parse(localStorage.getItem(key));

    // 创建深度代理函数
    const createDeepProxy = (obj, path = []) => {
      if (obj && typeof obj === 'object') {
        // 先对现有属性进行代理
        for (const prop in obj) {
          if (obj.hasOwnProperty(prop) && typeof obj[prop] === 'object') {
            obj[prop] = createDeepProxy(obj[prop], [...path, prop]);
          }
        }

        // 返回代理对象
        return new Proxy(obj, {
          set(target, prop, value) {
            // 如果设置的是对象，先进行代理
            if (value && typeof value === 'object') {
              value = createDeepProxy(value, [...path, prop]);
            }

            target[prop] = value;
            // This.storage[key] = target;
            This.save(key);
            // console.log(key, This.storage[key], prop, value)
            return true;
          },
          deleteProperty(target, prop) {
            delete target[prop];
            // This.storage[key] = target;
            This.save(key);
            return true;
          }
        });
      }
      return obj;
    };

    // 创建代理对象
    const proxiedValue = createDeepProxy(value);

    // console.log(proxiedValue);

    // 缓存起来
    this.storage[key] = proxiedValue;

    return proxiedValue;
  },
  set(key, value) {
    // 对新设置的值也进行深度代理
    const This = this;
    const createDeepProxy = (obj) => {
      if (obj && typeof obj === 'object') {
        for (const prop in obj) {
          if (obj.hasOwnProperty(prop) && typeof obj[prop] === 'object') {
            obj[prop] = createDeepProxy(obj[prop]);
          }
        }
        return new Proxy(obj, {
          set(target, prop, value) {
            if (value && typeof value === 'object') {
              value = createDeepProxy(value);
            }
            target[prop] = value;
            This.storage[key] = target;
            This.save(key);
            return true;
          }
        });
      }
      return obj;
    };

    this.storage[key] = createDeepProxy(value);
    this.save(key);
  },
  save(key) {
    if (key) {
      localStorage.setItem(key, JSON.stringify(this.storage[key]));
    } else {
      for (const k in this.storage) {
        if (k) {
          localStorage.setItem(k, JSON.stringify(this.storage[k]));
        }
      }
    }
  }
};