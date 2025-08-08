"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { toast, Toaster } from 'react-hot-toast';
import { getApiBaseUrl, authenticatedFetch } from '../config';
import unifiedSettingsService from '../services/unifiedSettingsService';

// 轻量级图标组件
const CalendarIcon = () => (
  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// 简化的事件列表组件（临时替代日历）
const SimpleEventList: React.FC<{ events: unknown[] }> = ({ events }) => {
  const today = new Date();
  const thisMonth = events.filter(event => {
    const eventDate = new Date((event as { start: string }).start);
    return eventDate.getMonth() === today.getMonth() && eventDate.getFullYear() === today.getFullYear();
  });

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold mb-4">本月日程 ({thisMonth.length})</h3>
      {thisMonth.length === 0 ? (
        <p className="text-gray-500">本月没有日程安排</p>
      ) : (
        <div className="space-y-2">
          {thisMonth.slice(0, 10).map((event) => {
            const evt = event as { id: string; title?: string; start: string };
            return (
              <div key={evt.id} className="border-l-4 border-blue-500 pl-3 py-2">
                <div className="font-medium">{evt.title || '无标题'}</div>
                <div className="text-sm text-gray-600">
                  {new Date(evt.start).toLocaleString('zh-CN')}
                </div>
              </div>
            );
          })}
          {thisMonth.length > 10 && (
            <p className="text-sm text-gray-500">还有 {thisMonth.length - 10} 个事件...</p>
          )}
        </div>
      )}
    </div>
  );
};

// 简化的登录对话框组件
const SimpleLoginDialog: React.FC<{
  onClose: () => void;
  onLoginSuccess: () => void;
}> = ({ onClose, onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogging, setIsLogging] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error('请输入邮箱和密码');
      return;
    }

    setIsLogging(true);
    try {
      const result = await unifiedSettingsService.login({ email, password });
      if (result === true) {
        toast.success('登录成功！');
        onLoginSuccess();
      } else {
        toast.error('登录失败，请检查用户名和密码');
      }
    } catch (error) {
      console.error('登录错误:', error);
      toast.error(`登录失败: ${error.message || '网络错误'}`);
    } finally {
      setIsLogging(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">用户登录</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="请输入邮箱"
              disabled={isLogging}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="请输入密码"
              disabled={isLogging}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            disabled={isLogging}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleLogin}
            disabled={isLogging || !email || !password}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLogging ? '登录中...' : '登录'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 简化的主页面组件
function SimpleCalendarPage() {
  const [events, setEvents] = useState<unknown[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<unknown>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  // 快速初始化
  useEffect(() => {
    const initApp = async () => {
      // 检查认证状态
      const hasToken = localStorage.getItem('unified_auth_token');
      const lastUserEmail = localStorage.getItem('tidelog_last_user_email');
      
      if (hasToken && lastUserEmail) {
        setIsLoggedIn(true);
        setCurrentUser({ email: lastUserEmail });
        
        // 尝试从缓存加载
        try {
          const cacheKey = `tidelog_events_${lastUserEmail}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsedData = JSON.parse(cached);
            if (parsedData.timestamp && Date.now() - parsedData.timestamp < 600000) {
              console.log('⚡ 从缓存快速加载', parsedData.events.length, '个事件');
              setEvents(parsedData.events);
              setIsLoading(false);
              return;
            }
          }
        } catch (error) {
          console.error('缓存读取失败:', error);
        }
        
        // 从服务器加载
        try {
          const response = await authenticatedFetch(`${getApiBaseUrl()}/events`);
          if (response.ok) {
            const rawEvents = await response.json();
            const processedEvents = rawEvents.map((event: unknown) => ({
              ...(event as Record<string, unknown>),
              start: (event as { start_datetime: string }).start_datetime,
              end: (event as { end_datetime?: string; start_datetime: string }).end_datetime || (event as { start_datetime: string }).start_datetime,
            }));
            setEvents(processedEvents);
            
            // 更新缓存
            const cacheKey = `tidelog_events_${lastUserEmail}`;
            localStorage.setItem(cacheKey, JSON.stringify({
              events: processedEvents,
              timestamp: Date.now()
            }));
            
            console.log('✅ 从服务器加载', processedEvents.length, '个事件');
          }
        } catch (error) {
          console.error('服务器加载失败:', error);
          toast.error('加载事件失败');
        }
      } else {
        setShowLoginDialog(true);
      }
      
      setIsLoading(false);
    };

    initApp();
  }, []);

  const handleLogout = async () => {
    await unifiedSettingsService.logout();
    setIsLoggedIn(false);
    setCurrentUser(null);
    setEvents([]);
    setShowLoginDialog(true);
    toast.success('已成功注销');
  };

  const handleLoginSuccess = () => {
    const user = unifiedSettingsService.getCurrentUser();
    setIsLoggedIn(true);
    setCurrentUser(user);
    setShowLoginDialog(false);
    toast.success(`欢迎回来，${user?.username || user?.email}！`);
    window.location.reload(); // 简单重新加载页面
  };


  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="bg-white shadow-sm flex-shrink-0">
          <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-12 items-center">
              <div className="flex items-center gap-2">
                <CalendarIcon />
                <span className="text-lg font-semibold text-gray-900">潮汐志</span>
              </div>
            </div>
          </div>
        </div>
        <main className="flex-grow container mx-auto p-4 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">正在快速加载...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Toaster position="top-center" />
      
      {/* 顶部导航栏 */}
      <div className="bg-white shadow-sm flex-shrink-0">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-12 items-center">
            <div className="flex items-center gap-2">
              <CalendarIcon />
              <span className="text-lg font-semibold text-gray-900">潮汐志</span>
            </div>
            <div className="flex items-center space-x-3">
              {isLoggedIn && currentUser && (
                <>
                  <span className="text-sm text-gray-600">
                    {currentUser.username || currentUser.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm transition-colors"
                  >
                    注销
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* 主内容区域 */}
      <main className="flex-grow container mx-auto p-4">
        <SimpleEventList events={events} />
        
        {/* 快速统计 */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900">总事件</h4>
            <p className="text-2xl font-bold text-blue-600">{events.length}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h4 className="font-medium text-green-900">本月事件</h4>
            <p className="text-2xl font-bold text-green-600">
              {events.filter(e => {
                const eventDate = new Date((e as { start: string }).start);
                const today = new Date();
                return eventDate.getMonth() === today.getMonth() && eventDate.getFullYear() === today.getFullYear();
              }).length}
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <h4 className="font-medium text-purple-900">缓存状态</h4>
            <p className="text-sm text-purple-600">
              {localStorage.getItem('tidelog_last_user_email') ? '已缓存' : '未缓存'}
            </p>
          </div>
        </div>
      </main>
      
      {/* 登录对话框 */}
      {showLoginDialog && (
        <SimpleLoginDialog 
          onClose={() => setShowLoginDialog(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}

// 创建客户端专用组件
const ClientOnlySimplePage = dynamic(() => Promise.resolve(SimpleCalendarPage), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  )
});

export default function CalendarPage() {
  return <ClientOnlySimplePage />;
}