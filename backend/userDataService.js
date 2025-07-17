/**
 * 新的用户数据管理服务
 * 使用CSV文件管理用户映射，JSON文件存储用户设置
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

class UserDataService {
    constructor() {
        // 新的用户数据目录
        this.userDataPath = 'C:\\code\\unified-settings-service\\user-data-v2';
        this.usersCSVPath = path.join(this.userDataPath, 'users.csv');

        // 用户创建锁，防止并发创建同一用户
        this.userCreationLocks = new Map();

        // 确保目录存在
        this.ensureDirectory(this.userDataPath);

        // 初始化CSV文件
        this.initializeUsersCSV();
    }

    /**
     * 确保目录存在
     */
    ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * 初始化用户CSV文件
     */
    initializeUsersCSV() {
        if (!fs.existsSync(this.usersCSVPath)) {
            const csvWriter = createObjectCsvWriter({
                path: this.usersCSVPath,
                header: [
                    { id: 'user_id', title: 'user_id' },
                    { id: 'username', title: 'username' },
                    { id: 'email', title: 'email' },
                    { id: 'created_at', title: 'created_at' },
                    { id: 'last_login', title: 'last_login' },
                    { id: 'status', title: 'status' }
                ]
            });
            
            // 写入表头
            csvWriter.writeRecords([]).then(() => {
                console.log('[UserDataService] 用户CSV文件已初始化');
            });
        }
    }

    /**
     * 读取所有用户信息
     */
    async getAllUsers() {
        return new Promise((resolve, reject) => {
            const users = [];
            
            if (!fs.existsSync(this.usersCSVPath)) {
                resolve([]);
                return;
            }
            
            fs.createReadStream(this.usersCSVPath)
                .pipe(csv())
                .on('data', (row) => {
                    users.push(row);
                })
                .on('end', () => {
                    resolve(users);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    /**
     * 同步获取所有用户（用于存储服务）
     */
    getAllUsersSync() {
        try {
            if (!fs.existsSync(this.usersCSVPath)) {
                return [];
            }

            const csvData = fs.readFileSync(this.usersCSVPath, 'utf8');
            const lines = csvData.split('\n').filter(line => line.trim());

            if (lines.length <= 1) {
                return []; // 只有表头或空文件
            }

            // 解析表头
            const headers = lines[0].split(',');
            const records = [];

            // 解析数据行
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',');
                if (values.length === headers.length) {
                    const record = {};
                    headers.forEach((header, index) => {
                        record[header] = values[index];
                    });
                    records.push(record);
                }
            }

            return records;
        } catch (error) {
            console.error(`[UserDataService] 同步读取用户CSV文件失败:`, error);
            return [];
        }
    }

    /**
     * 根据邮箱查找用户
     */
    async getUserByEmail(email) {
        const users = await this.getAllUsers();
        return users.find(user => user.email === email);
    }

    /**
     * 根据用户名查找用户
     */
    async getUserByUsername(username) {
        const users = await this.getAllUsers();
        return users.find(user => user.username === username);
    }

    /**
     * 创建新用户
     */
    async createUser(username, email) {
        const users = await this.getAllUsers();
        
        // 检查用户是否已存在
        const existingUser = users.find(u => u.email === email || u.username === username);
        if (existingUser) {
            throw new Error(`用户已存在: ${existingUser.email}`);
        }
        
        // 生成新的用户ID
        const nextUserId = this.generateNextUserId(users);
        
        const newUser = {
            user_id: nextUserId,
            username: username,
            email: email,
            created_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
            status: 'active'
        };
        
        // 添加到CSV文件
        const csvWriter = createObjectCsvWriter({
            path: this.usersCSVPath,
            header: [
                { id: 'user_id', title: 'user_id' },
                { id: 'username', title: 'username' },
                { id: 'email', title: 'email' },
                { id: 'created_at', title: 'created_at' },
                { id: 'last_login', title: 'last_login' },
                { id: 'status', title: 'status' }
            ],
            append: true
        });
        
        await csvWriter.writeRecords([newUser]);
        
        // 创建用户设置文件
        await this.createUserSettingsFile(nextUserId, username, email);
        
        console.log(`[UserDataService] 新用户已创建: ${nextUserId} (${email})`);
        return newUser;
    }

    /**
     * 生成下一个用户ID
     */
    generateNextUserId(users) {
        if (users.length === 0) {
            return 'user_001';
        }
        
        // 找到最大的用户ID数字
        const maxId = users.reduce((max, user) => {
            const match = user.user_id.match(/user_(\d+)/);
            if (match) {
                const num = parseInt(match[1]);
                return num > max ? num : max;
            }
            return max;
        }, 0);
        
        return `user_${String(maxId + 1).padStart(3, '0')}`;
    }

    /**
     * 创建用户设置文件
     */
    async createUserSettingsFile(userId, username, email) {
        // 使用用户名作为文件名，如果用户名太长则使用用户ID
        const fileName = username.length > 20 ? userId : username;
        const settingsPath = path.join(this.userDataPath, `${fileName}_settings.json`);
        
        const defaultSettings = {
            user_info: {
                user_id: userId,
                username: username,
                email: email
            },
            llm: {
                provider: 'builtin-free',
                model: 'deepseek/deepseek-chat-v3-0324:free',
                updated_at: new Date().toISOString()
            },
            caldav: {
                username: '',
                password: '',
                serverUrl: '',
                updated_at: new Date().toISOString()
            },
            imap: {
                user: '',
                host: '',
                password: '',
                port: 993,
                tls: true,
                updated_at: new Date().toISOString()
            },
            exchange: {
                email: '',
                password: '',
                ewsUrl: '',
                exchangeVersion: 'Exchange2013',
                updated_at: new Date().toISOString()
            },
            imap_filter: {
                sender_allowlist: [],
                updated_at: new Date().toISOString()
            }
        };
        
        fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf-8');
        console.log(`[UserDataService] 用户设置文件已创建: ${settingsPath}`);
    }

    /**
     * 获取用户设置
     */
    async getUserSettings(userId) {
        // 先通过用户ID找到用户名
        const users = await this.getAllUsers();
        const user = users.find(u => u.user_id === userId);
        if (!user) {
            throw new Error(`用户不存在: ${userId}`);
        }

        // 使用用户名作为文件名，如果用户名太长则使用用户ID
        const fileName = user.username.length > 20 ? userId : user.username;
        const settingsPath = path.join(this.userDataPath, `${fileName}_settings.json`);
        
        if (!fs.existsSync(settingsPath)) {
            throw new Error(`用户设置文件不存在: ${userId}`);
        }
        
        const content = fs.readFileSync(settingsPath, 'utf-8');
        return JSON.parse(content);
    }

    /**
     * 保存用户设置
     */
    async saveUserSettings(userId, settings) {
        // 先通过用户ID找到用户名
        const users = await this.getAllUsers();
        const user = users.find(u => u.user_id === userId);
        if (!user) {
            throw new Error(`用户不存在: ${userId}`);
        }

        // 使用用户名作为文件名，如果用户名太长则使用用户ID
        const fileName = user.username.length > 20 ? userId : user.username;
        const settingsPath = path.join(this.userDataPath, `${fileName}_settings.json`);
        
        // 更新时间戳
        const updatedSettings = {
            ...settings,
            updated_at: new Date().toISOString()
        };
        
        fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2), 'utf-8');
        console.log(`[UserDataService] 用户设置已保存: ${userId}`);
    }

    /**
     * 获取特定类型的设置（不自动创建用户）
     */
    async getUserSettingsByType(userId, settingType, userInfo = null) {
        console.log(`[UserDataService] 获取设置类型: ${settingType}, 用户ID: ${userId}`);
        try {
            const settings = await this.getUserSettings(userId);
            console.log(`[UserDataService] 用户完整设置:`, settings);
            const result = settings[settingType] || {};
            console.log(`[UserDataService] 返回${settingType}设置:`, result);
            return result;
        } catch (error) {
            if (error.message.includes('用户不存在')) {
                console.log(`[UserDataService] 用户不存在，返回默认设置: ${userId}`);
                // 返回默认设置，不自动创建用户
                const defaultSettings = this.getDefaultSettingsByType(settingType);
                console.log(`[UserDataService] 返回${settingType}默认设置:`, defaultSettings);
                return defaultSettings;
            }
            throw error;
        }
    }

    /**
     * 获取默认设置（按类型）
     */
    getDefaultSettingsByType(settingType) {
        const defaultSettings = {
            caldav: {
                username: '',
                password: '',
                serverUrl: '',
                updated_at: new Date().toISOString()
            },
            imap: {
                user: '',
                host: '',
                password: '',
                port: 993,
                tls: true,
                updated_at: new Date().toISOString()
            },
            exchange: {
                email: '',
                password: '',
                ewsUrl: '',
                exchangeVersion: 'Exchange2013',
                updated_at: new Date().toISOString()
            },
            llm: {
                provider: 'builtin-free',
                model: 'deepseek/deepseek-chat-v3-0324:free',
                updated_at: new Date().toISOString()
            },
            imap_filter: {
                sender_allowlist: [],
                updated_at: new Date().toISOString()
            }
        };

        return defaultSettings[settingType] || {};
    }

    /**
     * 保存特定类型的设置（如果用户不存在则自动创建）
     */
    async saveUserSettingsByType(userId, settingType, settingData, userInfo = null) {
        try {
            const settings = await this.getUserSettings(userId);
            settings[settingType] = {
                ...settingData,
                updated_at: new Date().toISOString()
            };
            await this.saveUserSettings(userId, settings);
        } catch (error) {
            if (error.message.includes('用户不存在')) {
                console.log(`[UserDataService] 保存设置时用户不存在，自动创建用户: ${userId}`);
                console.log(`[UserDataService] 用户信息:`, userInfo);
                // 自动创建用户
                await this.autoCreateUserIfNeeded(userId, userInfo);
                // 重新尝试保存设置
                const settings = await this.getUserSettings(userId);
                settings[settingType] = {
                    ...settingData,
                    updated_at: new Date().toISOString()
                };
                await this.saveUserSettings(userId, settings);
            } else {
                throw error;
            }
        }
    }

    /**
     * 更新用户最后登录时间
     */
    async updateLastLogin(userId) {
        const users = await this.getAllUsers();
        const userIndex = users.findIndex(u => u.user_id === userId);
        
        if (userIndex !== -1) {
            users[userIndex].last_login = new Date().toISOString();
            
            // 重写整个CSV文件
            const csvWriter = createObjectCsvWriter({
                path: this.usersCSVPath,
                header: [
                    { id: 'user_id', title: 'user_id' },
                    { id: 'username', title: 'username' },
                    { id: 'email', title: 'email' },
                    { id: 'created_at', title: 'created_at' },
                    { id: 'last_login', title: 'last_login' },
                    { id: 'status', title: 'status' }
                ]
            });
            
            await csvWriter.writeRecords(users);
            console.log(`[UserDataService] 用户最后登录时间已更新: ${userId}`);
        }
    }

    /**
     * 从旧系统迁移用户数据
     */
    async migrateFromOldSystem(oldUserId, username, email) {
        // 检查用户是否已存在
        const existingUser = await this.getUserByEmail(email);
        if (existingUser) {
            console.log(`[UserDataService] 用户已存在，返回现有用户: ${existingUser.user_id}`);
            return existingUser;
        }
        
        // 创建新用户
        const newUser = await this.createUser(username, email);
        
        // 从旧系统复制设置数据
        await this.copySettingsFromOldSystem(oldUserId, newUser.user_id);
        
        return newUser;
    }

    /**
     * 自动创建用户（如果需要）
     */
    async autoCreateUserIfNeeded(userId, userInfo = null) {
        try {
            // 检查是否已有其他请求正在创建此用户
            if (this.userCreationLocks.has(userId)) {
                console.log(`[UserDataService] 用户正在被创建中，等待完成: ${userId}`);
                // 等待其他请求完成创建
                await this.userCreationLocks.get(userId);
                // 重新检查用户是否已存在
                const users = await this.getAllUsers();
                const existingUser = users.find(u => u.user_id === userId);
                if (existingUser) {
                    console.log(`[UserDataService] 用户创建完成，返回已存在用户: ${userId} -> ${existingUser.username}`);
                    return existingUser;
                }
            }

            // 检查用户是否已存在（重新读取以确保最新状态）
            const users = await this.getAllUsers();
            const existingUser = users.find(u => u.user_id === userId);
            if (existingUser) {
                console.log(`[UserDataService] 用户已存在，跳过创建: ${userId} -> ${existingUser.username}`);
                return existingUser;
            }

            // 创建锁，防止并发创建
            const creationPromise = this._createUserInternal(userId, userInfo);
            this.userCreationLocks.set(userId, creationPromise);

            try {
                const newUser = await creationPromise;
                return newUser;
            } finally {
                // 创建完成后移除锁
                this.userCreationLocks.delete(userId);
            }

        } catch (error) {
            console.error(`[UserDataService] 自动创建用户失败: ${userId}`, error);
            throw error;
        }
    }

    /**
     * 内部创建用户方法（带锁保护）
     */
    async _createUserInternal(userId, userInfo = null) {
        try {
            // 重新获取最新的用户列表，防止并发创建
            const users = await this.getAllUsers();
            const existingUser = users.find(u => u.user_id === userId);
            if (existingUser) {
                console.log(`[UserDataService] 用户已存在（并发检查），返回已存在用户: ${userId} -> ${existingUser.username}`);
                return existingUser;
            }

            // 从用户信息中提取用户名和邮箱
            let username = userId;
            let email = `${userId}@example.com`;

            if (userInfo && userInfo.email) {
                email = userInfo.email;
                // 从邮箱中提取用户名
                username = userInfo.username || userInfo.email.split('@')[0];
            }

            // 确保用户名唯一
            const existingUsernames = users.map(u => u.username);
            let finalUsername = username;
            let counter = 1;
            while (existingUsernames.includes(finalUsername)) {
                finalUsername = `${username}_${counter}`;
                counter++;
            }

            console.log(`[UserDataService] 自动创建用户: ${userId} -> ${finalUsername} (${email})`);

            // 添加到CSV文件
            const newUser = {
                user_id: userId,
                username: finalUsername,
                email: email,
                created_at: new Date().toISOString(),
                last_login: new Date().toISOString(),
                status: 'active'
            };

            // 使用简单的文件追加方式，避免文件锁定问题
            const csvLine = `${newUser.user_id},${newUser.username},${newUser.email},${newUser.created_at},${newUser.last_login},${newUser.status}\n`;

            console.log(`[UserDataService] 准备写入CSV文件:`, this.usersCSVPath);
            console.log(`[UserDataService] 新用户数据:`, newUser);

            // 使用同步写入，避免并发问题
            const fs = require('fs');
            fs.appendFileSync(this.usersCSVPath, csvLine, 'utf8');
            console.log(`[UserDataService] CSV文件写入成功`);

            // 创建用户设置文件
            console.log(`[UserDataService] 准备创建用户设置文件`);
            await this.createUserSettingsFile(userId, finalUsername, email);
            console.log(`[UserDataService] 用户设置文件创建成功`);

            console.log(`[UserDataService] 自动创建用户完成: ${userId}`);
            return newUser;
        } catch (error) {
            console.error(`[UserDataService] 自动创建用户失败: ${userId}`, error);
            throw error;
        }
    }

    /**
     * 从旧系统复制设置数据
     */
    async copySettingsFromOldSystem(oldUserId, newUserId) {
        const oldSettingsPath = `C:\\code\\unified-settings-service\\user-settings\\${oldUserId}`;
        
        if (!fs.existsSync(oldSettingsPath)) {
            console.log(`[UserDataService] 旧用户设置不存在: ${oldUserId}`);
            return;
        }
        
        const newSettings = await this.getUserSettings(newUserId);
        
        // 复制各种设置文件
        const settingFiles = [
            { old: 'caldav.json', new: 'caldav' },
            { old: 'imap.json', new: 'imap' },
            { old: 'exchange.json', new: 'exchange' },
            { old: 'imap-filter.json', new: 'imap_filter' },
            { old: 'llm.json', new: 'llm' }
        ];
        
        for (const { old, new: newKey } of settingFiles) {
            const oldFilePath = path.join(oldSettingsPath, old);
            if (fs.existsSync(oldFilePath)) {
                try {
                    const oldData = JSON.parse(fs.readFileSync(oldFilePath, 'utf-8'));
                    newSettings[newKey] = {
                        ...oldData,
                        updated_at: new Date().toISOString()
                    };
                    console.log(`[UserDataService] 已复制设置: ${old} -> ${newKey}`);
                } catch (error) {
                    console.error(`[UserDataService] 复制设置失败 ${old}:`, error);
                }
            }
        }
        
        await this.saveUserSettings(newUserId, newSettings);
        console.log(`[UserDataService] 用户数据迁移完成: ${oldUserId} -> ${newUserId}`);
    }
}

module.exports = new UserDataService();