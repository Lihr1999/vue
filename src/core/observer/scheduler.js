/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = []
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {}
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true // 标记正在处理watcher队列
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child) 组件更新的顺序是父组件 -> 子组件，因为先创建父组件再创建子组件
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher) 用户watcher在渲染watcher之前执行(在initState中执行的)，而在mountComponent中才创建的渲染watcher,initState在mountComponent之前执行
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped. 如果一个子组件在父组件执行之前被销毁了，这个watcher应当被跳过
  queue.sort((a, b) => a.id - b.id) // 对queue排序

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 此处不把queue.length放到第一个表达式中缓存，是因为可能这个过程中还有新的watcher被push
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]
    if (watcher.before) {
      watcher.before() // before只有在创建渲染watcher的时候才会有，是用来触发beforeUpdate生命周期函数
    }
    id = watcher.id
    has[id] = null // 此时watcher已经被处理了，所以置为null 为了数据变化后下一次watcher还能被正常运行
    watcher.run() // 核心: run方法
    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice() // 备份activated队列
  const updatedQueue = queue.slice() // 备份updated队列

  // 清空队列 等待、刷新的状态置为false
  resetSchedulerState() // queue.length = activatedChildren.length = 0  waiting = flushing = false

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue) // 触发activated钩子函数
  callUpdatedHooks(updatedQueue)  // 触发updated钩子函数

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id
  if (has[id] == null) { // 防止watcher被重复处理
    has[id] = true // 标记当前这个watcher已经被处理了
    if (!flushing) { // flushing: true正在刷新; false没有在处理
      queue.push(watcher) // 当前队列没有被处理的情况下，直接把watcher放到队列的末尾
    } else { // 代表queue正在被处理，需要找到一个合适位置把watcher插入进去
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      let i = queue.length - 1 // 取得队列的长度-1(即最后一个watcher所在的索引)
      // index: 当前处理到的第几个元素索引
      // i > index: 代表队列还没被处理完
      // queue[i].id > watcher.id: 队列[i].id 大于当前watcher.id
      while (i > index && queue[i].id > watcher.id) { // 如果当前队列还没被处理完 并且 从后往前去和当前watcher.id进行判断，直到找到小于或等于的时候就停止查找
        i--
      }
      queue.splice(i + 1, 0, watcher) // 往i + 1的后面追加
    }
    // queue the flush
    if (!waiting) { // 队列是否被执行
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      nextTick(flushSchedulerQueue) // flushSchedulerQueue方法内部遍历所有的watcher，并且调用watcher的run方法
    }
  }
}
