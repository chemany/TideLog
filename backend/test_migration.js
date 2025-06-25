const { migrateGlobalEventsToUser, migrateGlobalSettingsToUser } = require('./storage');

const userId = 'cmmc03v95m7xzqxwewhjt'; // 当前用户ID

console.log('开始测试迁移功能...');
console.log('用户ID:', userId);

try {
    console.log('步骤1: 测试事件迁移功能');
    const eventMigrationResult = migrateGlobalEventsToUser(userId);
    console.log('事件迁移结果:', eventMigrationResult);
    
    console.log('\n步骤2: 测试完整迁移功能');
    const migrationStats = migrateGlobalSettingsToUser(userId);
    console.log('完整迁移结果:', migrationStats);
} catch (error) {
    console.error('迁移失败:', error);
    console.error('错误详情:', error.stack);
} 