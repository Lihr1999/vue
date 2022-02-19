// 设置Vue构造函数、为Vue构造函数设置了一些成员
import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
// 此处不用 class 的原因是因为方便后续给 Vue 实例混入实例成员
// 因为下面的方法是给Vue的实例添加静态方法，如果用类的形式就不太妥当
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  // 调用 _init()方法
  this._init(options)
}
// 下面是给Vue的实例原型上增加了相应的方法
// 注册 vm 的 _init()方法，初始化vm
initMixin(Vue)
// 注册 vm 的 $data/$props/$set/$delete/$watch
stateMixin(Vue)
// 初始化事件相关方法
// $on/$once/$off/$emit
eventsMixin(Vue)
// 初始化生命周期相关的混入方法
// _update/$forceUpdate/$destroy
lifecycleMixin(Vue)
// 混入 render
// $nextTick/_render
renderMixin(Vue) // 多了很多以_开头的函数(当把template转为render函数的时候，在render函数中调用)

export default Vue
