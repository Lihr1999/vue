/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = [] // 回调队列
let pending = false // 异步锁

// 执行队列中的每一个回调
function flushCallbacks () {
  pending = false // 重置异步锁
  // 防止出现nextTick中包含nextTick时出现问题，在执行回调函数队列前，提前复制备份并清空回调函数队列
  const copies = callbacks.slice(0)
  callbacks.length = 0
  // 执行回调函数队列
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
/* 对于宏任务(macro task) */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && ( // PhantomJS, iOS7, Android 4.4
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) { // 检测是否支持原生 setImmediate(高版本 IE 和 Edge 支持)
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 把 cb 加上异常处理存入 callbacks 数组中
  callbacks.push(() => {
    if (cb) {
      try {
        // 调用 cb()
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) { // 没传cb回调函数，即：this.$nextTick(): 不传东西 内部return的是一个new Promise  所以官网才会说可以通过async await获取
      // 没有cb的时候下面的代码会把_resolve赋值为: Promise内部的resolve(下面有注释)，并非static的那个resolve方法
      _resolve(ctx) // 可以理解为: resolve() 然后用变量接收这个promise的时候调用.then(value => ...) value是undefined
      /*
        因为new Promise((resolve, reject) => { resolve || reject })  
        new完之后要么resolve('xx')   要么reject('xx')
        这里其实就是resolve()
      */
    }
  })
  
  // 如果异步锁未锁上，锁上异步锁，调用异步函数，准备等同步函数执行完后，就开始执行回调函数队列
  if (!pending) { // 如果nextTick当前队列目前没被处理
    pending = true // 标记为正在处理
    // 调用
    timerFunc() // 中间函数，内部通过new Promise之后.then 然后循环调用上面的callbacks
  }
  // $flow-disable-line
  // 如果没有提供回调，并且支持Promise，返回一个Promise
  if (!cb && typeof Promise !== 'undefined') {
    // 返回 promise 对象
    return new Promise(resolve => {
      _resolve = resolve // 可以理解为把Promise里面的resolve方法(非static那个)赋值给_resolve，等待调用timeFunc()的时候循环调用，从而实现resolve()空值的promise
      /*
        resolve是promise中new 初始化的时候所传递的
        constructor (executor) {
          try {
            executor(this.resolve, this.reject)
          } catch(e) {
            this.reject(e)
          }
        }
        // 写成箭头函数是为了promise那个对象调用resolve的时候不会被指向window
        resolve = value => { // 调用resolve的时候肯定传了成功的值
          // 如果状态不是等待，则阻止程序向下执行
          if (this.status != PENDING) return
          // 将状态更改为成功
          this.status = FULFILLED
          // 保存成功之后的值
          this.value = value
          // 判断成功回调是否存在 如果存在则调用
          // this.successCallback && this.successCallback(value)
          while(this.successCallback.length) this.successCallback.shift()()
        }
      */
    })
  }
}
