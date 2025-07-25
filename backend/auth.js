/**
 * 智能日历认证中间件
 * 恢复真实用户认证，确保数据隔离
 */

const axios = require('axios');

// 统一设置服务配置
const UNIFIED_SETTINGS_SERVICE_URL = process.env.UNIFIED_SETTINGS_SERVICE_URL || 'http://localhost:3002';

// 导入新的用户数据服务
const userDataService = require('./userDataService');

// 检查统一设置服务中是否存在用户
const checkUnifiedSettingsUser = async (email) => {
    try {
        const UNIFIED_SETTINGS_URL = process.env.UNIFIED_SETTINGS_URL || 'http://localhost:3002';
        const response = await fetch(`${UNIFIED_SETTINGS_URL}/api/auth/find-by-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        if (response.ok) {
            const result = await response.json();
            return result.user || null;
        }
        return null;
    } catch (error) {
        console.error('[checkUnifiedSettingsUser] 检查统一设置服务用户失败:', error);
        return null;
    }
};

// 认证中间件 - 使用真实token验证
const authenticateUser = async (req, res, next) => {
    try {
        // 从请求头中提取token
        const token = extractTokenFromHeader(req);

        if (!token) {
            console.log('[认证] 未提供认证token');
            return res.status(401).json({
                error: '用户未认证',
                message: '请先登录'
            });
        }

        // 向统一设置服务验证token
        console.log('[认证] 验证token...');
        const verification = await verifyToken(token);

        if (!verification.valid || !verification.user) {
            console.log('[认证] token验证失败');
            return res.status(401).json({
                error: '用户未认证',
                message: 'Token无效或已过期'
            });
        }

        // 将用户信息附加到请求对象
        req.user = verification.user;
        req.userId = verification.user.id;

        console.log(`[认证] 认证成功，用户: ${req.user.email}`);
        next();
    } catch (error) {
        console.error('[认证] 认证过程出错:', error);
        return res.status(500).json({
            error: '认证服务错误',
            message: '服务器内部错误，请稍后重试'
        });
    }
};

// 从请求头中提取Bearer token
const extractTokenFromHeader = (req) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return undefined;
    }

    const [type, token] = authorization.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
};

// 向统一设置服务验证token
const verifyToken = async (token) => {
    try {
        const response = await axios.get(`${UNIFIED_SETTINGS_SERVICE_URL}/api/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            timeout: 5000
        });

        return response.data;
    } catch (error) {
        console.error('[认证] Token验证请求失败:', error.message);
        return { valid: false, user: null };
    }
};

// 可选的认证中间件 - 尝试验证但不强制要求
const optionalAuth = async (req, res, next) => {
    try {
        const token = extractTokenFromHeader(req);

        if (token) {
            const verification = await verifyToken(token);
            if (verification.valid && verification.user) {
                req.user = verification.user;
                req.userId = verification.user.id;
                console.log(`[可选认证] 认证成功，用户: ${req.user.email}`);
            }
        }

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

// 获取当前用户ID的辅助函数（同步版本，用于向后兼容）
const getCurrentUserId = (req) => {
    const originalUserId = req.userId || null;

    // 用户ID映射：确保与灵枢笔记使用相同的用户数据目录
    // 这解决了同一用户在不同应用中有不同ID的问题
    const userIdMapping = {
        'cmmc03v95m7xzqxwewhjt': 'user_001'  // link918@qq.com -> 新的用户ID格式
    };

    return userIdMapping[originalUserId] || originalUserId;
};

// 获取当前用户ID的异步版本（新版本：使用用户数据服务）
const getCurrentUserIdAsync = async (req) => {
    const user = req.user;
    if (!user || !user.email) {
        return null;
    }

    try {
        // 首先尝试从新的用户数据服务中查找用户
        let userData = await userDataService.getUserByEmail(user.email);

        if (!userData) {
            // 如果本地不存在，先检查统一设置服务是否有此用户
            console.log(`[getCurrentUserIdAsync] 本地未找到用户，检查统一设置服务: ${user.email}`);

            try {
                const unifiedUser = await checkUnifiedSettingsUser(user.email);
                if (unifiedUser) {
                    // 如果统一设置服务中存在用户，同步到本地
                    console.log(`[getCurrentUserIdAsync] 从统一设置服务同步用户: ${unifiedUser.id}`);
                    userData = await userDataService.createUserFromUnified(unifiedUser);
                } else {
                    // 如果统一设置服务中也不存在，从旧系统迁移
                    console.log(`[getCurrentUserIdAsync] 迁移用户从旧系统: ${user.email}`);
                    userData = await userDataService.migrateFromOldSystem(
                        req.userId, // 旧的用户ID
                        user.username || user.email.split('@')[0], // 用户名
                        user.email
                    );
                }
            } catch (unifiedError) {
                console.warn(`[getCurrentUserIdAsync] 统一设置服务检查失败，回退到旧系统迁移:`, unifiedError);
                userData = await userDataService.migrateFromOldSystem(
                    req.userId,
                    user.username || user.email.split('@')[0],
                    user.email
                );
            }
        }

        // 更新最后登录时间
        await userDataService.updateLastLogin(userData.user_id);

        console.log(`[getCurrentUserIdAsync] 用户ID映射: ${user.email} -> ${userData.user_id}`);
        return userData.user_id;
    } catch (error) {
        console.error('[getCurrentUserIdAsync] 获取用户ID失败:', error);
        // 回退到同步版本
        return getCurrentUserId(req);
    }
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
    getCurrentUserIdAsync,
    isAuthenticated,
    userDataService
};