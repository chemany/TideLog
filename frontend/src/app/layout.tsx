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
  title: "潮汐志",
  description: "潮汐志智能日历管理系统",
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  manifest: '/manifest.json',
};

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
