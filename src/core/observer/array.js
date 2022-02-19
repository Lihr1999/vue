/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 使用数组的原型创建一个新的对象
export const arrayMethods = Object.create(arrayProto)

// 修改数组元素的方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // cache original method
  // 保存数组原方法
  const original = arrayProto[method]
  // 调用 Object.defineProperty() 重新定义修改数组的方法
  def(arrayMethods, method, function mutator (...args) {
    // 执行数组的原始方法
    const result = original.apply(this, args) // original是数组的原始方法，然后调用apply，改变this为目标数组，然后传入args参数数组
    // 获取数组对象的 ob 对象
    const ob = this.__ob__
    let inserted
    switch (method) { // 对新增元素的方法做判断处理
      case 'push':
      case 'unshift':
        inserted = args // args传入的参数就是新增的元素
        break
      case 'splice':
        inserted = args.slice(2) // slice的第三个参数是新增的元素，所以拿到索引为2的那个元素所组成的数组 eg: [100]
        break
    }
    // 对插入的新元素，重新遍历新插入的那个元素 调用observe设置为响应式 如果添加的元素是一个对象或者数组则将它们都转为响应式
    if (inserted) ob.observeArray(inserted) // 有新增的元素则遍历新增的元素 调用observe
    // notify change
    // 调用了修改数组的方法，调用数组的ob对象发送通知
    ob.dep.notify()
    return result
  })
})
