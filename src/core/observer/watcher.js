/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    if (isRenderWatcher) {
      vm._watcher = this // 如果是渲染watcher 把当前watcher实例记录到Vue实例vm的_watcher 中
    }
    vm._watchers.push(this) // 记录3种watcher类型，追加到_watchers数组中
    // options
    if (options) {
      // !!转为boolean
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy // 是否延迟更新视图 computed的时候lazy就是true
      this.sync = !!options.sync
      this.before = options.before // 触发生命周期的beforeUpdate
    } else {
      this.deep = this.user = this.lazy = this.sync = false // options(调用new Watcher传递的第四个参数)不传递的话默认这些都是false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true // 标识当前watcher是否为活动的watcher 默认为true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // expOrFn 是字符串的时候，例如：watch: { 'person.name': function... }
      // parsePath('person.name') 返回一个函数获取 person.name 在data中的值
      this.getter = parsePath(expOrFn) // 此时getter是一个函数，执行的时候会访问那个变量，会触发那个变量的get方法，进行收集依赖
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 判断是否延迟执行
    this.value = this.lazy // computed的时候lazy就是true
      ? undefined // 因为computed有缓存作用，直接在render渲染模板的时候调用那个计算属性所设置的函数，这里就不需要对那个value求值
      : this.get() // 不是延迟执行，立即调用
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 把当前watcher对象存入到栈中
    // 每个组件都会对应一个watcher,watcher会去渲染视图
    // 如果组件有嵌套，那么会先渲染内部的组件，先把父组件的watcher保存起来
    pushTarget(this) // 将Dep.target进行赋值
    let value
    const vm = this.vm
    try {
      // 一般this.getter是updateComponent更新视图的一个函数
      value = this.getter.call(vm, vm) // 这里调用this.getter，其实就是调用这个对变量有引用的函数，只要内部访问了响应式的变量，则会调用get方法，然后会发现Dep.target已经有值了，那么就会收集依赖
    } catch (e) {
      if (this.user) { // 处理用户watcher的取值报错
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // https://blog.csdn.net/sinat_41627898/article/details/106129741
        // 内部对是数组或者对象的子项进行依赖收集，核心是当前已经让Dep.target赋值了(免去一层new Wacher)，
        // 然后这时候对子元素是数组或者对象的属性访问一下它们，就会触发get方法，实现了对子元素依赖的一个收集
        traverse(value) 
        /*
          循环遍历一下数据，去拿他的getter属性，使得每一个深层数据都变成响应式。
          在_traverse中先判断是不是数组或者对象或者对象被冻结，抑或是一个虚拟节点，这些情况都直接return不往下执行。
          然后判断一下这个对象有没有__ob__这个属性，这个属性是vue里面定义响应式对象时会加上去的，
          如果有这个属性说明这个对象是个响应式对象，然后拿这个依赖的id，判断一下这个依赖之前是否有收集过，
          保证不重复收集依赖，没有收集过则调用sean.add收集依赖。然后接下来的就是循环数组循环object对其子项进行依赖收集了。
        */
      }
      popTarget() // 把Dep.target置为null
      this.cleanupDeps() // 清空依赖
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) { // computed计算属性watcher
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else { // 用户watcher || 渲染watcher
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) { // 是否为存活的状态 默认是true
      const value = this.get() // 如果是渲染watcher 这个value是undefined，则不走下面的代码
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) { // 用户watcher 调用cb回调函数(即watch对象中声明的那个函数) new Watcher的第三个参数
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else { // 非用户watcher
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
