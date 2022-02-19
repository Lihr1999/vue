/* @flow */

import { mergeOptions } from '../util/index'

export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) { // 全局Vue构造函数混入
    // this是Vue
     // 其实就是将调用Vue.mxin()的时候传递进来的对象参数，全部赋值到Vue.options，让其变成Vue的全局变量参数
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
