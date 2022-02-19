/* @flow */

import { toArray } from '../util/index'

export function initUse (Vue: GlobalAPI) {
  Vue.use = function (plugin: Function | Object) {
    // 此处的this指向的是Vue构造函数
    const installedPlugins = (this._installedPlugins || (this._installedPlugins = [])) // 记录安装的插件
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    // 把数组中的第一个元素(plugin)去除，此处是如果有多个参数则仅保留除plugin之外的参数
    const args = toArray(arguments, 1)
    // 把this(Vue)插入到第一个元素的位置，因为install方法默认第一个参数是Vue构造函数，所以要把索引为0的元素记录为Vue
    args.unshift(this)
    if (typeof plugin.install === 'function') { // 对象的话就调用它的install方法
      plugin.install.apply(plugin, args)
    } else if (typeof plugin === 'function') { // 函数的话就调用它自己
      plugin.apply(null, args)
    }
    installedPlugins.push(plugin) // 保存到已安装的插件数组中
    return this
  }
}
