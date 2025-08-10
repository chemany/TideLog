// 在React加载之前禁用DevTools检查和警告，提升启动速度
(function() {
  'use strict';
  
  // 设置React DevTools钩子，让React认为DevTools已安装
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject: function() { return -1; },
    onCommitFiberRoot: function() {},
    onCommitFiberUnmount: function() {},
    onScheduleFiberRoot: function() {},
    onCommitFiberUnmount: function() {},
    isDisabled: false,
    checkDCE: function() { return true; }
  };

  // 拦截控制台输出
  const originalMethods = {
    log: console.log,
    warn: console.warn,
    info: console.info
  };

  ['log', 'warn', 'info'].forEach(function(method) {
    console[method] = function() {
      const args = Array.prototype.slice.call(arguments);
      const message = args.join(' ');
      
      // 过滤React DevTools相关消息
      if (message.indexOf('React DevTools') !== -1 ||
          message.indexOf('react-devtools') !== -1 ||
          message.indexOf('outdated JSX transform') !== -1) {
        return;
      }
      
      originalMethods[method].apply(console, args);
    };
  });
})();