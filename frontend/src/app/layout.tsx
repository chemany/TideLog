import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'react-big-calendar/lib/css/react-big-calendar.css';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "潮汐志 - 智能日历管理",
  description: "智能日历事件管理应用，支持自然语言创建和文档导入",
  icons: {
    icon: [
      {
        url: '/calendars/favicon-16x16.png',
        sizes: '16x16',
        type: 'image/png',
      },
      {
        url: '/calendars/favicon-32x32.png', 
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/calendars/tidelog-icon.svg',
        type: 'image/svg+xml',
      }
    ],
    shortcut: '/calendars/favicon.ico',
    apple: '/calendars/apple-touch-icon.png',
  },
  manifest: '/calendars/manifest.json',
};

export function generateViewport() {
  return {
    themeColor: '#4FC3F7',
    colorScheme: 'light',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        {/* 抑制开发模式下的HMR WebSocket错误 */}
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  // 拦截WebSocket构造函数
                  const OriginalWebSocket = window.WebSocket;
                  
                  window.WebSocket = function(url, protocols) {
                    // 如果是HMR WebSocket连接，创建一个假的WebSocket对象
                    if (url && (url.includes('webpack-hmr') || url.includes('_next/webpack-hmr'))) {
                      return {
                        readyState: 3, // CLOSED
                        close: function() {},
                        send: function() {},
                        addEventListener: function() {},
                        removeEventListener: function() {},
                        dispatchEvent: function() { return true; }
                      };
                    }
                    
                    // 其他WebSocket连接正常创建
                    return new OriginalWebSocket(url, protocols);
                  };
                  
                  // 保持原型链
                  window.WebSocket.prototype = OriginalWebSocket.prototype;
                  
                  // 抑制控制台错误
                  const originalConsoleError = console.error;
                  console.error = function(...args) {
                    const message = args.join(' ');
                    
                    if (
                      message.includes('WebSocket connection to') ||
                      message.includes('webpack-hmr') ||
                      message.includes('_next/webpack-hmr') ||
                      (message.includes('Failed to fetch') && message.includes('_next'))
                    ) {
                      return;
                    }
                    
                    originalConsoleError.apply(console, args);
                  };
                })();
              `
            }}
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
