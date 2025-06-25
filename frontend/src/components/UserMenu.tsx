import React, { useState } from 'react';
import { 
  ExpandMore as ExpandMoreIcon,
  Logout,
  Person
} from '@mui/icons-material';

interface UserMenuProps {
  user: {
    username?: string;
    email?: string;
    name?: string;
  };
  onLogout: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ user, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);

  // 获取用户显示名称
  const getUserDisplayName = () => {
    return user.username || user.name || user.email || '用户';
  };

  // 获取用户头像内容
  const getUserInitials = () => {
    const name = user.username || user.name || user.email || '';
    if (name.length > 0) {
      return name.charAt(0).toUpperCase();
    }
    return '用';
  };

  const handleLogout = () => {
    setIsOpen(false);
    onLogout();
  };

  return (
    <div className="relative">
      {/* 用户按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-md shadow-sm text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
      >
        {/* 用户头像 */}
        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-semibold">
          {getUserInitials()}
        </div>
        
        {/* 用户名 */}
        <span className="max-w-20 truncate">
          {getUserDisplayName()}
        </span>
        
        {/* 下拉箭头 */}
        <ExpandMoreIcon 
          sx={{ 
            fontSize: '1rem',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }} 
        />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <div 
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 菜单内容 */}
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20">
            {/* 用户信息区域 */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  {getUserInitials()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {getUserDisplayName()}
                  </p>
                  {user.email && (
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 菜单项 */}
            <div className="py-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  // 这里可以添加个人资料页面导航
                }}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Person sx={{ fontSize: '1rem', mr: 2 }} />
                个人资料
              </button>
              
              <button
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Logout sx={{ fontSize: '1rem', mr: 2 }} />
                退出登录
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default UserMenu; 