import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 保持basePath，但修复HMR WebSocket问题
  basePath: '/calendars',
  trailingSlash: true,

  // 允许的开发源，解决跨域警告
  allowedDevOrigins: [
    'jason.cheman.top:8081',
    'http://jason.cheman.top:8081',
    'https://jason.cheman.top:8081',
    'ws://jason.cheman.top:8081',
    'wss://jason.cheman.top:8081'
  ],

  // 开发模式配置（移除deprecated选项）

  // 生产环境启用检查，但允许warnings通过
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
    dirs: ['src'],
  },

  // 在开发模式下优化配置
  ...(process.env.NODE_ENV === 'development' && {
    // 禁用一些开发模式的功能来减少错误
  }),

  // 在开发模式下禁用source map以减少404错误
  ...(process.env.NODE_ENV === 'development' && {
    productionBrowserSourceMaps: false,
  }),

  // 编译器配置
  compiler: {
    // 生产环境优化
    reactRemoveProperties: process.env.NODE_ENV === 'production',
    // 启用emotion支持（如果需要）
    emotion: true,
  },
  
  /**
   * 异步重写规则，用于代理API请求。
   * 这条规则确保了在局域网内部直接访问前端服务时，
   * API调用（发往 /api/* 的请求）能被正确代理到后端服务。
   * 在通过Nginx访问时，Nginx的规则会优先生效，此重写规则不会被触发。
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // 将请求代理到在同一台机器上运行的后端服务
        destination: 'http://localhost:11001/:path*', 
      },
      // 静默处理开发模式的资源请求，避免404错误
      {
        source: '/__nextjs_source-map/:path*',
        destination: '/api/empty', // 返回空响应
      },
      {
        source: '/_next/static/css/:path*.css.map',
        destination: '/api/empty', // 返回空响应
      },
      {
        source: '/.well-known/:path*',
        destination: '/api/empty', // 返回空响应
      },
      {
        source: '/favicon.ico',
        destination: '/api/empty', // 返回空响应
      },
      {
        source: '/robots.txt',
        destination: '/api/empty', // 返回空响应
      },
      {
        source: '/sitemap.xml',
        destination: '/api/empty', // 返回空响应
      },
    ]
  },
};

export default nextConfig;