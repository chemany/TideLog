const fs = require('fs');

// 检查全局事件文件
try {
    const globalEvents = JSON.parse(fs.readFileSync('./data/events_db.json', 'utf8'));
    console.log('全局事件数量:', globalEvents.length);
    
    // 显示前3个事件的标题
    globalEvents.slice(0, 3).forEach((event, index) => {
        console.log(`  事件${index + 1}: ${event.title || 'No title'} (ID: ${event.id})`);
    });
} catch (error) {
    console.log('读取全局事件文件失败:', error.message);
}

// 检查用户目录
const usersDir = './data/users';
if (fs.existsSync(usersDir)) {
    const userDirs = fs.readdirSync(usersDir);
    console.log('\n用户目录:');
    userDirs.forEach(userId => {
        const userEventsPath = `${usersDir}/${userId}/events_db.json`;
        if (fs.existsSync(userEventsPath)) {
            try {
                const userEvents = JSON.parse(fs.readFileSync(userEventsPath, 'utf8'));
                console.log(`  用户 ${userId}: ${userEvents.length} 个事件`);
                
                // 显示前3个事件的标题
                userEvents.slice(0, 3).forEach((event, index) => {
                    console.log(`    事件${index + 1}: ${event.title || 'No title'} (迁移: ${event.migrated_from_global || 'No'})`);
                });
            } catch (error) {
                console.log(`  用户 ${userId}: 读取事件文件失败`, error.message);
            }
        } else {
            console.log(`  用户 ${userId}: 无事件文件`);
        }
    });
} else {
    console.log('\n用户目录不存在');
} 