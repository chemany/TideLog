// 后端 API 配置
const isLocalhost = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const getApiBaseUrl = () => {
  let apiUrl = '';
  
  // 仅基于hostname判断，移除NODE_ENV检查
  if (isLocalhost) {
    // 本地开发环境：直接访问后端端口
    apiUrl = 'http://localhost:11001';
    console.log('[API Config] 使用本地API地址:', apiUrl);
  } else {
    // 外网环境：通过nginx代理访问
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const host = window.location.host;
      apiUrl = `${protocol}//${host}/calendars/api`;
      console.log('[API Config] 使用外网代理API地址:', apiUrl);
    } else {
      // 服务端渲染时的fallback
      apiUrl = 'http://jason.cheman.top:8081/calendars/api';
      console.log('[API Config] 使用服务端fallback API地址:', apiUrl);
    }
  }
  
  console.log('[API Config] 当前环境 - hostname:', typeof window !== 'undefined' ? window.location.hostname : 'server-side', 'NODE_ENV:', process.env.NODE_ENV, 'isLocalhost:', isLocalhost);
  
  return apiUrl;
};

/**
 * 获取带有认证头的 fetch 选项
 * @param options - 额外的 fetch 选项
 * @returns fetch 选项对象，包含认证头
 */
export const getAuthenticatedFetchOptions = (options: RequestInit = {}): RequestInit => {
  // 获取统一设置服务的 token - 使用正确的键名
  let token = '';
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('calendar_unified_token') || '';
  }

  // 检查是否为FormData，如果是则不设置Content-Type让浏览器自动设置
  const isFormData = options.body instanceof FormData;

  return {
    ...options,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  };
};

/**
 * 带认证的 fetch 封装
 * @param url - 请求URL
 * @param options - fetch 选项
 * @returns fetch 响应
 */
export const authenticatedFetch = (url: string, options: RequestInit = {}) => {
  // 智能日历API不需要真实认证，因为后端使用固定用户
  // 只有调用统一设置服务时才需要Bearer token
  const apiBaseUrl = getApiBaseUrl();
  const isCalendarApi = url.startsWith(apiBaseUrl);
  
  if (isCalendarApi) {
    // 智能日历API：不发送认证头
    const isFormData = options.body instanceof FormData;
    return fetch(url, {
      ...options,
      headers: {
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
    });
  } else {
    // 其他API（如统一设置服务）：使用正常认证
    return fetch(url, getAuthenticatedFetchOptions(options));
  }
}; 