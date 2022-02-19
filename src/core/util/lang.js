/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

/**
 * Check if a string starts with $ or _
 */
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`) // 匹配任何字符 已点结束的字符串
export function parsePath (path: string): any {
  if (bailRE.test(path)) { // 匹配上 返回 true
    return
  }

  // 匹配不上  path在已点分割
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      // 将对象中的一个key值 赋值给该对象 相当于 obj = obj[segments[segments.length-1]];
      obj = obj[segments[i]]
    }
    return obj
  }
}
/*
  下面是例子：'person.name'
  segments = ['person', 'name']

  这里返回的函数是this.getter = function(obj) {
    obj = obj['person'] // 第一次循环 拿到的值是obj.person
    obj = obj.person['name'] // 第二次循环 拿到的值就是person.name
    // 循环结束
    return obj(person.name这个值)
  }
  核心原因：其实形参是局部变量，当函数调用结束以后，用作形参的局部变量就会
  不存在。即使在函数中修改了传递进来的基本数据类型的参数值，它也
  不会应影响到主程序中作为参数的那个基本数据类型的变量值。
*/
