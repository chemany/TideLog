// 后端 API 配置
export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    // 服务端环境，使用默认地址
    return 'http://localhost:11001';
  }
  
  const hostname = window.location.hostname;
  
  // 检查是否是本地环境（localhost或127.0.0.1）
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // 检查是否是局域网IP地址（192.168.x.x, 10.x.x.x, 172.16-31.x.x）
  const isPrivateIP = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                     /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
                     /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  
  let apiUrl = '';
  
  if (isLocalhost) {
    // 本地开发环境（localhost/127.0.0.1）：使用localhost连接
    apiUrl = 'http://localhost:11001';
    console.log(`[API Config] 检测到本地环境(${hostname})，使用localhost连接:`, apiUrl);
  } else if (isPrivateIP) {
    // 局域网IP访问：使用当前IP访问后端端口
    apiUrl = `http://${hostname}:11001`;
    console.log(`[API Config] 检测到局域网环境(${hostname})，使用IP连接:`, apiUrl);
  } else {
    // 外网环境：通过nginx代理访问
    const protocol = window.location.protocol;
    const host = window.location.host;
    apiUrl = `${protocol}//${host}/calendars/api`;
    console.log(`[API Config] 检测到外网环境(${hostname})，使用nginx代理:`, apiUrl);
  }
  
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