/**
 * 智能日历认证中间件
 * 新架构：使用固定用户ID，简化认证流程
 */

// 固定用户配置（与灵枢笔记保持一致）
const DEFAULT_USER = {
    id: 'cmmc03v95m7xzqxwewhjt',
    username: 'default_user',
    email: 'user@calendar.local'
};

// 认证中间件 - 使用固定用户（简化版本）
const authenticateUser = async (req, res, next) => {
    try {
        // 在新架构中，我们使用固定的用户ID
        // 如果将来需要真正的多用户支持，可以重新启用令牌验证
        req.user = DEFAULT_USER;
        req.userId = DEFAULT_USER.id;
        
        console.log(`[认证] 使用固定用户: ${req.user.username}`);
        next();
    } catch (error) {
        console.error('[认证] 认证过程出错:', error);
        return res.status(500).json({ 
            error: '认证服务错误', 
            message: '服务器内部错误，请稍后重试' 
        });
    }
};

// 可选的认证中间件 - 总是使用固定用户
const optionalAuth = async (req, res, next) => {
    try {
        // 在新架构中，总是使用固定用户
        req.user = DEFAULT_USER;
        req.userId = DEFAULT_USER.id;
        
        console.log(`[可选认证] 使用固定用户: ${req.user.username}`);
        next();
    } catch (error) {
        console.error('[可选认证] 认证过程出错:', error);
        // 可选认证失败不阻塞请求
        next();
    }
};

// 获取当前用户信息的辅助函数
const getCurrentUser = (req) => {
    return req.user || null;
};

// 获取当前用户ID的辅助函数
const getCurrentUserId = (req) => {
    return req.userId || null;
};

// 检查用户是否已认证
const isAuthenticated = (req) => {
    return !!req.user && !!req.userId;
};

module.exports = {
    authenticateUser,
    optionalAuth,
    getCurrentUser,
    getCurrentUserId,
    isAuthenticated
}; 