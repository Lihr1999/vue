/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value // 观察对象
    this.dep = new Dep() // 依赖对象
    this.vmCount = 0 // 实例计数器 初始化实例的 vmCount 为0
    def(value, '__ob__', this) // 将实例挂载到观察对象data的 __ob__属性 里面的value中 值是这个data本身
    if (Array.isArray(value)) { // 数组的响应式处理 修补数组方法添加到value数组身上
      /*
        arrayMethods: {}的prototype指向Array.prototype
        并且arrayMethods身上定义了很多push、unshift等属性，值是对应原始数组方法的函数
      */
      if (hasProto) { // 浏览器支持对象的__proto__
        protoAugment(value, arrayMethods) // 其实就是把value这个数组的__proto__指向于arrayMethods
      } else { // 浏览器不支持对象的__proto__
        copyAugment(value, arrayMethods, arrayKeys) // arrayKeys就是各种数组方法的名字数组
        /*
          let ary = [1]
          ary['push'] = function() {}
        */
      }
      this.observeArray(value) // 遍历数组，为数组中的每一个对象创建一个 observer 实例 转为响应式对象
    } else { // 对象的响应式处理
      this.walk(value) // 遍历对象中的每一个属性，调用defineReactive转换成 getter / setter
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj) // 获取观察对象的每一个属性
    for (let i = 0; i < keys.length; i++) { // 遍历每一个属性，设置为响应式数据
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 判断 value 是否是对象
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 如果 value 有 __ob__(observer对象) 属性，则直接返回那个__ob__ 结束
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) && // 重点：判断是否为数组或者是一个纯粹的javascript对象
    Object.isExtensible(value) &&
    !value._isVue // 重点：如果是Vue实例则不需要响应式处理，不是Vue实例则需要响应式处理
    // 创建Vue实例的时候有把_isVue 设置为true
  ) {
    // 核心：创建了一个 Observer 对象，设置响应式   ===============================
    ob = new Observer(value) // value是当前options的data对象
  }
  if (asRootData && ob) {
    ob.vmCount++ // 如果是 根data 则vmCount是1，否则都是0
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive ( // 为一个对象定义一个响应式的属性 this.$set其实就是调用了这个方法
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // 创建依赖对象实例

  const property = Object.getOwnPropertyDescriptor(obj, key) // 获取 obj 自有属性对应的属性描述符 （自有属性指的是直接赋予该对象的属性，不需要从原型链上进行查找的属性）
  if (property && property.configurable === false) { // 判断configurable的值，false代表不可delete删除、不可defineProperty重新定义
    return
  }

  // cater for pre-defined getter/setters
  // 提供预定义的存取器函数
  // 如果传入的对象有get set方法，那么下面会重写它们，增加派发更新的方法
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key] // 例如data: { obj: {} }  val就是obj
  }

  // 判断是否递归观察子对象，并将子对象属性都转换成 getter / setter，返回子观察对象
  // !shallow 是 深度监听
  // 是一个包含自己的值本身、dep、vmCount这3个属性的对象
  // 子对象如果是对象或者数组的时候也会为它们进行收集依赖，将来子对象发生变化的时候也会发送通知
  let childOb = !shallow && observe(val) // 对那个data对象中的某个属性val值进行响应式处理后的对象，其实就是调用了new Observer
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 如果预定义的 getter 存在则 value 等于 getter 调用的返回值
      // 否则直接赋予属性值
      const value = getter ? getter.call(obj) : val
    // 依赖收集 ==========
      // 如果存在当前依赖目标，则 watcher对象，则建立依赖
      if (Dep.target) { // 在Watcher的get方法中给target赋值
        // 为当前data对象的keys循环后每一项的依赖
        dep.depend() // dep是每个data对象遍历的时候，每个key值的那个dep，如果对this.xx重新赋值就会触发这个dep更新watcher
        if (childOb) { // 如果子观察目标存在，建立子对象的依赖关系
          // 这里的dep是例如当数组元素发生变化的时候才会触发更新watcher
          // 是对象的keys循环后每一项的值自己的依赖 
          // 例如数组：因为我们定义的arrayMethods是很多重写过的方法，内部是调用这个数组.__ob__.dep.notify()
          childOb.dep.depend() // 这里是为了当子对象添加、删除成员的时候，也需要发送通知并且更新视图 例如 push等方法 
          if (Array.isArray(value)) { // 如果属性是数组
            dependArray(value) // 则特殊处理收集数组对象依赖，判断每个数组元素是否为对象，是的话都会有__ob__，调用它dep.depend收集一下依赖
          }
        }
      }
    // 依赖收集 ==========
      // 返回属性值
      return value
    },
    set: function reactiveSetter (newVal) {
      // 如果预定义的 getter 存在则 value 等于 getter调用的返回值
      // 否则直接赋予属性值
      const value = getter ? getter.call(obj) : val
      // 如果新值等于旧值或者新值旧值都为NaN则不执行
      /* eslint-disable no-self-compare */
      /*
        (newVal !== newVal && value !== value)
        用来判断新值或者就值是否相等，但是在JS中有一种情况是NaN != NaN
        所以通过这个方式来判断新值和旧值是否为NaN
      */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      // 如果没有 setter 直接返回
      if (getter && !setter) return // 代表只读
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 如果新值是对象，观察子对象并返回 子的 observer 对象
      childOb = !shallow && observe(newVal) // observe返回的是一个observer对象
      // 派发更新(发布更改通知)
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    /*
      isPrimitive:
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'symbol' ||
        typeof value === 'boolean'
    */
    (isUndef(target) || isPrimitive(target)) // 不能给undefined、null、原始值(即单单一个值，不是从this.xx中取的) 去设置
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  
  // 判断 target 是否为数组，key 是否是合法的数组索引
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 索引过大时，让数组也扩张length
    target.length = Math.max(target.length, key) // 如果传进来要设置的索引大于数组的长度，那么将数组的length改成传进来的那个索引值
    // 通过 splice 对key位置的元素进行替换
    // splice 在 array.js进行了响应式的处理(非原始数组方法)
    target.splice(key, 1, val) // 重写了这些方法 内部会调用ob.dep.notify()  ob就是这个val初始化的时候所添加的__ob__的属性
    return val
  }
  
  // 如果 key 在目标对象中已经存在 并且 key不是对象原型上的属性 则直接赋值
  if (key in target && !(key in Object.prototype)) {
    target[key] = val // 触发原本属性的set方法
    return val
  }
  // 获取 target 中的 observer 对象
  const ob = (target: any).__ob__ // __ob__所存储的就是observer对象 每个响应式对象身上都会有
  // 如果 target 是 Vue实例 或者 $data(vmCount会为1)     直接返回并且非生成环境提示警告
  if (target._isVue || (ob && ob.vmCount)) { // 在observe的时候如果传递了asRootData，那么代表是根data，会把vmCount++
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }

  // 如果 ob 不存在，target(目标对象) 代表目标对象不是响应式对象要直接赋值 并且没必要设置为响应式了 直接设置值然后return
  if (!ob) {
    target[key] = val
    return val
  }
  
  // ob.value其实就是target本身
  defineReactive(ob.value, key, val) //通过defineReactive把 key 设置为响应式
  // 此处可以这么调用是因为收集依赖的时候为每个子对象都创建的__ob__
  // 调用ob.dep其实就是target.__ob__.dep.notify() 相当于是这个target发生了变化
  ob.dep.notify() // 需要更新一下视图，因为这里是添加   和childOb有关系
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // 判断是否为数组，以及 key 是否合法
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 如果是数组通过 splice 删除
    // splice 做过响应式处理
    target.splice(key, 1)
    return
  }
  
  // 获取 target 的 ob 对象
  const ob = (target: any).__ob__
  // target 如果是 Vue实例 或者 $data对象，直接返回
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }

  // 如果 target 对象没有 key 属性直接返回
  // 判断自身是否有key属性并且不能是原型中继承过来的
  if (!hasOwn(target, key)) { // Object.prototype.hasOwnProperty() 判断自身属性中是否具有指定的属性
    return
  }

  // 删除属性
  delete target[key]
  if (!ob) { // 说明目标对象不是一个响应式，则比要更新视图
    return
  }

  // 通过 ob 发送通知
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend() // 如果数组中的元素是对象，那么也要对它进行收集依赖。即：如果数组中的元素是对象并且发生了变化也会通知更新watcher
    if (Array.isArray(e)) { // 如果数组中的元素还是数组的话，递归调用这个dependArray方法
      dependArray(e)
    }
  }
}
