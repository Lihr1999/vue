/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props) // $options中有props 把props转为响应式数据，注入到Vue实例
  if (opts.methods) initMethods(vm, opts.methods) // $options中有methods 判断是否和props的属性重名、是否在vue、不建议使用_ 或者 $开头
  // ====== 重点
  if (opts.data) { // $options中有data 则对data进行初始化
    initData(vm) // 把data中的成员注入到Vue实例vm中，再把data中的成员都转为响应式
  } else { // 没有data属性，则将_data设置为响应式的空对象
    observe(vm._data = {}, true /* asRootData */) // asRootData 会将vmCount++
  }
  // ====== 重点
  // 计算属性watcher    new Watcher中的id是1
  if (opts.computed) initComputed(vm, opts.computed) // $options中有computed 则对computed进行初始化
  // 用户watcher        new Watcher中的id是2
  if (opts.watch && opts.watch !== nativeWatch) { // $options中有watch 则对watch进行初始化
    initWatch(vm, opts.watch)
  }
  // 渲染watcher        new Watcher中的id是3    是mountComponent调用的
}

function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {}
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false)
  }
  for (const key in propsOptions) { // 遍历传进来的props对象
    keys.push(key)
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => { // 注入到vm._props对象中并设置为响应式
        if (!isRoot && !isUpdatingChildComponent) { // 生产环境中对props的属性重新赋值会报警告
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) { // 判断props的属性是否在Vue实例中存在，不存在的话则注入到Vue实例中
      proxy(vm, `_props`, key) // 最终访问是通过：this._props.xx
    }
  }
  toggleObserving(true)
}

function initData (vm: Component) {
  let data = vm.$options.data
  // 初始化 _data，组件中 data 是函数，调用函数返回结果
  // 否则直接返回data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm) // 内部调用call方法获取组件中data函数的值
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }
  // proxy data on instance
  // 获取 data 中的所有属性
  const keys = Object.keys(data)
  // 获取 props / methods
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  // 判断 data 上的成员是否和 props/methods 重名
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 注意：上面已经把$options.data也赋值给_data, proxy方法内部设置响应式的时候，get方法是访问_data
      proxy(vm, `_data`, key) // 把属性重新注入到Vue实例vm身上，设置响应式。
    }
  }
  // observe data
  // 响应式处理
  observe(data, true /* asRootData */) // 把data里面的所有属性都转为响应式
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  for (const key in computed) {
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get // 不是函数就调用它的那个get方法 computed: { 'test': { get() {}, set() {} } }
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions // 让lazy = true 缓存作用
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(`The computed property "${key}" is already defined as a method.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props // 获取props 以免和传入的methods变量重名，props和methods最终都是要注入到Vue实例vm身上
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') { // 如果传进来的methods属性不是function，则提示警告
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) { // 如果props中有同名属性，则提示警告
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) { // 判断是否已经在Vue中存在 和 变量命名是否以_或者$开头
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
     // 注入到vue实例的时候会判断如果不是函数，则让它为空函数。
    //  如果是函数，则调用bind方法，改变this指向，指向Vue实例vm
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  // key是watch定义的那个字符串
  for (const key in watch) {
    const handler = watch[key] // 取到定义的要监听的属性的值
    if (Array.isArray(handler)) { // watch: { 'user': [] } 如果这样的话可以有多个回调函数传入
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]) // 属性值是数组则遍历它们 为这个key创建多个watcher的回调函数
      }
    } else {
      createWatcher(vm, key, handler) // 常规传值法 为key创建watcher
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) { // 判断定义的属性值是否为原生对象 Object.prototype.toString
    options = handler // 保存属性值到options变量
    handler = handler.handler // 取得对象中的handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler] // 如果 watch: { 'user': 'test' }   会去vue实例中查找'test'这个对应在methods中定义的方法
  }
  // 如果是用户watcher expOrFn: 是那个key值 在new Watcher中要访问它 为它收集依赖
  // 如果是用户watcher handler: 是那个回调函数，等待触发更新的时候就会invokeWithErrorHandling内部调用cb
  // 如果是用户watcher options: 是传进来的watch定义对应的属性值
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  // 挂载$data、$props、$set、$delete、$watch
  Object.defineProperty(Vue.prototype, '$data', dataDef) // 防止对$data重新赋值，会触发警告
  Object.defineProperty(Vue.prototype, '$props', propsDef) // 防止对$props重新赋值，会触发警告

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 是一个实例方法，因为内部用到了vue的实例   没有静态方法
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    // 获取 Vue 实例 this
    const vm: Component = this
    // 拿到你定义的key为handler的函数作为callback函数
    if (isPlainObject(cb)) {
      // 判断如果 cb 是对象执行 createWatcher
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // 标记为用户 watcher
    options.user = true
    // 创建用户 watcher 对象
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) { // 判断 immediate 如果为 true
      // 立即执行一次 cb 回调，并且把当前值传入
      const info = `callback for immediate watcher "${watcher.expression}"`
      // 在immediate程序调用期间暂停dep收集 ========
      pushTarget()
      popTarget()
      // 在immediate程序调用期间暂停dep收集 ========
      // watcher.value: 代表如果new Watcher的expOrFn是函数，则是它的调用返回值；如果不是函数，则是parsePath(expOrFn) 即在data中拿它的最新值
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info) // 在immediate的时候内部调用cb回调函数的时候是只传了一个newValue，因为没有oldValue，oldValue是在watcher中的run方法 触发update方法的时候才会传递
    }
    // 返回取消监听的方法
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
