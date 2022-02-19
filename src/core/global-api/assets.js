/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  // 遍历 ASSET_TYPES 数组，为Vue 定义相应方法
  // ASSET_TYPES 包括了directive、component、filter
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) { // 只传一个参数，相当于获取某个指令、过滤器、组件
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        // Vue.component('comp', { template: '' })
        if (type === 'component' && isPlainObject(definition)) { // 判断是否为原始的Object Object.prototype.toString.call(xxobj) === '[object Object]'
          definition.name = definition.name || id // 有设置name就用name属性，否则用id(即组件名)
          // 把组件配置转换为组件的构造函数
          definition = this.options._base.extend(definition) // 相当于调用Vue.extend 把参数对象转为VueComponent
          // _base: Vue
        }
        if (type === 'directive' && typeof definition === 'function') { // directive第二个参数如果是函数的话，会在bind和update的时候触发
          definition = { bind: definition, update: definition }
        }
        // 全局注册，存储资源并赋值
        // this.options['components']['comp'] = definition
        this.options[type + 's'][id] = definition // 对组件来说如果第二个参数是Vue.extend，那么就把它存储到options.components中
        return definition
      }
    }
  })
}
