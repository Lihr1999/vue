const path = require('path')
// 返回入口文件所在的文件夹的绝对路径
const resolve = p => path.resolve(__dirname, '../', p) // resolve是返回当前文件的绝对路径，然后../ 就是项目的根目录，然后再拼接上src/platforms/web

module.exports = {
  vue: resolve('src/platforms/web/entry-runtime-with-compiler'),
  compiler: resolve('src/compiler'),
  core: resolve('src/core'),
  shared: resolve('src/shared'),
  web: resolve('src/platforms/web'),
  weex: resolve('src/platforms/weex'),
  server: resolve('src/server'),
  sfc: resolve('src/sfc')
}