const fs = require('fs');
const path = require('path');

// 手动实现迁移逻辑并添加调试信息
const DATA_DIR = path.join(__dirname, 'data');
const USERS_DATA_DIR = path.join(DATA_DIR, 'users');
const EVENTS_FILE = path.join(DATA_DIR, 'events_db.json');

function getUserFilePath(userId, filename) {
    const userDir = path.join(USERS_DATA_DIR, userId);
    return path.join(userDir, filename);
}

function loadJsonFile(filePath, defaultValue = {}) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } else {
            console.log(`文件不存在: ${filePath}`);
            return defaultValue;
        }
    } catch (error) {
        console.error(`从 ${filePath} 加载数据时出错:`, error);
        return defaultValue;
    }
}

const userId = 'cmmc03v95m7xzqxwewhjt';

console.log('=== 开始调试迁移过程 ===');
console.log('用户ID:', userId);

console.log('\n1. 检查全局事件文件');
console.log('EVENTS_FILE路径:', EVENTS_FILE);
console.log('文件是否存在:', fs.existsSync(EVENTS_FILE));

if (!fs.existsSync(EVENTS_FILE)) {
    console.log('全局事件文件不存在，退出');
    process.exit(0);
}

console.log('\n2. 加载全局事件');
const globalEvents = loadJsonFile(EVENTS_FILE, []);
console.log('全局事件数量:', globalEvents.length);

if (globalEvents.length === 0) {
    console.log('全局事件文件为空，退出');
    process.exit(0);
}

console.log('\n3. 检查用户事件文件');
const userFilePath = getUserFilePath(userId, 'events_db.json');
console.log('用户事件文件路径:', userFilePath);
console.log('用户事件文件是否存在:', fs.existsSync(userFilePath));

let userEvents = [];
let needsMigration = true;

if (fs.existsSync(userFilePath)) {
    console.log('\n4. 加载用户事件');
    userEvents = loadJsonFile(userFilePath, []);
    console.log('用户事件数量:', userEvents.length);
    
    console.log('\n5. 检查是否已有迁移事件');
    const hasMigratedEvents = userEvents.some(event => event.migrated_from_global);
    console.log('是否有迁移标记的事件:', hasMigratedEvents);
    
    if (hasMigratedEvents) {
        console.log('已有迁移事件，跳过迁移');
        needsMigration = false;
    } else {
        console.log('\n6. 检查数量条件');
        const threshold = globalEvents.length * 0.1;
        console.log(`用户事件数量(${userEvents.length}) < 全局事件数量的10%(${threshold})?`, userEvents.length < threshold);
        
        if (userEvents.length < threshold) {
            console.log('满足迁移条件，执行迁移');
            needsMigration = true;
        } else {
            console.log('用户已有足够事件，跳过迁移');
            needsMigration = false;
        }
    }
}

console.log('\n7. 迁移决定');
console.log('是否需要迁移:', needsMigration);

if (needsMigration) {
    console.log('\n8. 执行迁移（模拟）');
    console.log('将要迁移的事件数量:', globalEvents.length);
    console.log('用户现有事件数量:', userEvents.length);
    console.log('迁移后总事件数量:', userEvents.length + globalEvents.length);
} 