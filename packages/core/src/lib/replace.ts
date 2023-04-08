import type { Options, VoidFun } from '../types'
import { debug } from '../utils/debug'
import { _global } from '../utils/global'
import { on, replaceAop, throttle, getLocationHref } from '../utils'
import { isExistProperty } from '../utils/is'
import { EVENTTYPES } from '../common'
import { eventBus } from './eventBus'

/**
 * 根据入参初始化 重写、监听
 * @param options sdk入参
 */
export function initReplace(options: Options): void {
  const baseReplace: EVENTTYPES[] = []
  const allReplace: EVENTTYPES[] = [...baseReplace]

  // 定义一个产出模块
  // 其注册所有模块所需要的 - 监听，改写
  // 当那些模块要用的时候，去产出模块那数据
  // 这个模块的数据不应该有业务数据
  // 只负责去采集数据，具体怎么拿是业务模块需要去分辨的
  // 采集哪些数据是注册的时候决定的
  // 只会管兼容性问题，不兼容的api就不做动作

  // 这样就不需要所有的模块都要init了
  // 之后需要init的模块，可以专门去做模块内的事

  // 注意这里面耦合性不能太高，不要抽了还不如不抽
  // 做到模块内改了代码不需要去另外个文件再改
  // 现在要解决的是，setupReplace初始化的时候，怎么知道要加载哪些监听

  // 这个后面改成键值对的方式会好些把，但要考虑有些或的逻辑

  if (options.error.core) {
    allReplace.push(EVENTTYPES.ERROR) // 监听捕获错误
    allReplace.push(EVENTTYPES.UNHANDLEDREJECTION) // 监听handleUnhandleRejection事件
    allReplace.push(EVENTTYPES.CONSOLEERROR) // 重写console.error
  }

  if (options.event.core) {
    allReplace.push(EVENTTYPES.CLICK) // 监听click事件
  }

  allReplace.push(EVENTTYPES.LOAD) // 监听load事件
  allReplace.push(EVENTTYPES.BEFOREUNLOAD) // 监听beforeunload事件

  if (options.performance.server) {
    allReplace.push(EVENTTYPES.XHROPEN) // 重写XMLHttpRequest-open
    allReplace.push(EVENTTYPES.XHRSEND) // 重写XMLHttpRequest-send
    allReplace.push(EVENTTYPES.FETCH) // 重写fetch
  }

  // -------------

  if (options.pv.core || options.pv.hashtag) {
    allReplace.push(EVENTTYPES.HASHCHANGE) // 监听hashchange
    allReplace.push(EVENTTYPES.HISTORY) // 监听history模式路由的变化
  }

  if (options.performance.core || options.performance.firstResource) {
    allReplace.push(EVENTTYPES.PERFORMANCE) // 监听性能指标
  }

  allReplace.forEach(replace)
}

function replace(type: EVENTTYPES): void {
  debug('replace - 初始化挂载事件:', type)
  switch (type) {
    case EVENTTYPES.ERROR:
      listenError(EVENTTYPES.ERROR)
      break
    case EVENTTYPES.UNHANDLEDREJECTION:
      listenUnhandledrejection(EVENTTYPES.UNHANDLEDREJECTION)
      break
    case EVENTTYPES.CONSOLEERROR:
      replaceConsoleError(EVENTTYPES.CONSOLEERROR)
      break
    case EVENTTYPES.CLICK:
      listenClick(EVENTTYPES.CLICK)
      break
    case EVENTTYPES.LOAD:
      listenLoad(EVENTTYPES.LOAD)
      break
    case EVENTTYPES.BEFOREUNLOAD:
      listenBeforeunload(EVENTTYPES.BEFOREUNLOAD)
      break
    case EVENTTYPES.XHROPEN:
      replaceXHROpen(EVENTTYPES.XHROPEN)
      break
    case EVENTTYPES.XHRSEND:
      replaceXHRSend(EVENTTYPES.XHRSEND)
      break
    case EVENTTYPES.FETCH:
      replaceFetch(EVENTTYPES.FETCH)
      break

    // --------

    case EVENTTYPES.HISTORY:
      historyReplace()
      break
    case EVENTTYPES.HASHCHANGE:
      listenHashchange()
      break
    case EVENTTYPES.PERFORMANCE:
      listenPerformance()
      break
    case EVENTTYPES.RECORDSCREEN:
      recordScreen()
      break
    default:
      break
  }
}

/**
 * 监听 - error
 */
function listenError(type: EVENTTYPES): void {
  on(
    _global,
    'error',
    function (e: ErrorEvent) {
      eventBus.runEvent(type, e)
    },
    true
  )
}
/**
 * 监听 - unhandledrejection（promise异常）
 */
function listenUnhandledrejection(type: EVENTTYPES): void {
  on(_global, type, function (ev: PromiseRejectionEvent) {
    // ev.preventDefault() 阻止默认行为后，控制台就不会再报红色错误
    eventBus.runEvent(type, ev)
  })
}
/**
 * 重写 - console.error
 */
function replaceConsoleError(type: EVENTTYPES): void {
  replaceAop(console, 'error', (originalError: VoidFun) => {
    return function (this: any, ...args: any[]): void {
      eventBus.runEvent(type, args)
      originalError.apply(this, args)
    }
  })
}
/**
 * 监听 - click
 */
function listenClick(type: EVENTTYPES): void {
  if (!('document' in _global)) return
  const clickThrottle = throttle(eventBus.runEvent, 100)
  on(
    _global.document,
    'click',
    function (this: any, e: MouseEvent) {
      clickThrottle.call(eventBus, type, e)
    },
    true
  )
}
/**
 * 监听 - load
 */
function listenLoad(type: EVENTTYPES): void {
  on(
    _global,
    'load',
    function (e: Event) {
      eventBus.runEvent(type, e)
    },
    true
  )
}
/**
 * 监听 - beforeunload
 */
function listenBeforeunload(type: EVENTTYPES): void {
  on(
    _global,
    'beforeunload',
    function (e: BeforeUnloadEvent) {
      eventBus.runEvent(type, e)
    },
    false
  )
}
/**
 * 重写 - XHR-open
 */
function replaceXHROpen(type: EVENTTYPES): void {
  if (!('XMLHttpRequest' in _global)) return
  const originalXhrProto = XMLHttpRequest.prototype
  replaceAop(originalXhrProto, 'open', (originalOpen: VoidFun) => {
    return function (this: any, ...args: any[]): void {
      eventBus.runEvent(type, ...args)
      originalOpen.apply(this, args)
    }
  })
}
/**
 * 重写 - XHR-send
 */
function replaceXHRSend(type: EVENTTYPES): void {
  if (!('XMLHttpRequest' in _global)) return
  const originalXhrProto = XMLHttpRequest.prototype
  replaceAop(originalXhrProto, 'send', (originalSend: VoidFun) => {
    return function (this: any, ...args: any[]): void {
      eventBus.runEvent(type, this, args)
      originalSend.apply(this, args)
    }
  })
}
/**
 * 重写 - fetch
 */
function replaceFetch(type: EVENTTYPES): void {
  if (!('fetch' in _global)) return
  replaceAop(_global, 'fetch', (originalFetch: any) => {
    return function (this: any, ...args: any[]): void {
      return originalFetch.apply(_global, args).then(
        (res: any) => {
          eventBus.runEvent(type, ...args, res)
        }
        // 这里先不注册错误回调，fetch好像都会“成功”，看res.status 才能分辨真正是否成功
        // err => {
        //   console.log('err', err)
        // }
      )
    }
  })
}

// ---------------------------------

/**
 * 监听 - hashchange
 */
function listenHashchange(): void {
  // 通过onpopstate事件，来监听hash模式下路由的变化
  if (!isExistProperty(_global, 'onhashchange')) return
  on(_global, EVENTTYPES.HASHCHANGE, function (e: HashChangeEvent) {
    eventBus.runEvent(EVENTTYPES.HASHCHANGE, e)
  })
}

/**
 * 监听 - popstate
 * 重写 - pushState
 * 重写 - replaceState
 */
let lastHref: string = getLocationHref()
function historyReplace(): void {
  const oldOnpopstate = _global.onpopstate
  // 添加 onpopstate事件
  _global.onpopstate = function (...args: any[]): void {
    const to = getLocationHref()
    const from = lastHref
    lastHref = to
    eventBus.runEvent(EVENTTYPES.HISTORY, {
      from,
      to
    })
    oldOnpopstate && oldOnpopstate.apply(this, args)
  }
  function historyReplaceFn(originalHistoryFn: VoidFun): VoidFun {
    return function (this: any, ...args: any[]): void {
      const url = args.length > 2 ? args[2] : undefined
      if (url) {
        const from = lastHref
        const to = String(url)
        lastHref = to
        eventBus.runEvent(EVENTTYPES.HISTORY, {
          from,
          to
        })
      }
      return originalHistoryFn.apply(this, args)
    }
  }
  // 重写pushState、replaceState事件
  replaceAop(_global.history, 'pushState', historyReplaceFn)
  replaceAop(_global.history, 'replaceState', historyReplaceFn)
}

/**
 * 直接获取 - 性能(performance)
 */
function listenPerformance(): void {
  eventBus.runEvent(EVENTTYPES.PERFORMANCE)
}

/**
 * 直接获取 - recordScreen
 */
function recordScreen(): void {
  eventBus.runEvent(EVENTTYPES.RECORDSCREEN)
}
