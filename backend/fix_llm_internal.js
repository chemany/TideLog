// 修复getInternalLLMSettings方法
const fs = require('fs');

const fixCode = `
    getInternalLLMSettings(userId = this.defaultUserId) {
        console.log(\`[LocalSettingsService] 获取用户 \${userId} 的内部LLM配置\`);
        
        // 直接复用getCalendarLLMSettings的逻辑，但返回真实API密钥
        try {
            const storageType = process.env.STORAGE_TYPE || 'local';
            const nasPath = process.env.NAS_PATH || '\\\\\\\\\\\\\\\\Z423-DXFP\\\\\\\\sata12-181XXXX7921';
            
            let newSystemPath;
            if (storageType === 'nas') {
                newSystemPath = path.join(nasPath, 'MindOcean', 'user-data', 'settings');
            } else {
                newSystemPath = path.join(this.projectRoot, 'unified-settings-service', 'user-data-v2');
            }
            
            if (fs.existsSync(newSystemPath)) {
                console.log(\`[LocalSettingsService] 直接从NAS读取内部LLM配置: \${newSystemPath}\`);
                
                const userDataService = require('./userDataService');
                const users = userDataService.getAllUsersSync();
                const user = users.find(u => u.user_id === userId);
                
                if (user) {
                    const fileName = user.username.length > 20 ? userId : user.username;
                    const settingsPath = path.join(newSystemPath, \`\${fileName}_settings.json\`);
                    
                    if (fs.existsSync(settingsPath)) {
                        const userSettings = this.readJsonFile(settingsPath, {});
                        const tidelog_llm_config = userSettings.tidelog_llm;
                        
                        if (tidelog_llm_config && tidelog_llm_config.provider !== 'builtin') {
                            console.log('[LocalSettingsService] 成功从NAS读取内部tidelog_llm配置:', tidelog_llm_config.provider);
                            console.log('[LocalSettingsService] 内部配置详情:', {
                                provider: tidelog_llm_config.provider,
                                base_url: tidelog_llm_config.base_url,
                                model_name: tidelog_llm_config.model_name
                            });
                            return {
                                provider: tidelog_llm_config.provider,
                                api_key: tidelog_llm_config.api_key || '',
                                base_url: tidelog_llm_config.base_url || '',
                                model_name: tidelog_llm_config.model_name || '',
                                temperature: tidelog_llm_config.temperature || 0.7,
                                max_tokens: tidelog_llm_config.max_tokens || 2000
                            };
                        }
                    }
                }
            }
        } catch (error) {
            console.log('[LocalSettingsService] NAS读取失败，回退到旧系统:', error.message);
        }
        
        // 回退到内置模型配置
        console.log('[LocalSettingsService] 未找到用户自定义配置，使用内置模型');
        try {
            const config = this.readJsonFile(this.defaultModelsPath, {});
            if (config.builtin_free) {
                console.log('[LocalSettingsService] 内部使用内置模型配置');
                return {
                    provider: 'builtin-free',
                    api_key: config.builtin_free.api_key,
                    base_url: config.builtin_free.base_url,
                    model_name: config.builtin_free.model_name,
                    temperature: config.builtin_free.temperature || 0.7,
                    max_tokens: config.builtin_free.max_tokens || 2000
                };
            }
        } catch (error) {
            console.error('[LocalSettingsService] 读取default-models.json失败:', error);
        }
        
        console.error('[LocalSettingsService] 无法获取LLM配置');
        return null;
    }`;

console.log("修复代码已准备就绪");