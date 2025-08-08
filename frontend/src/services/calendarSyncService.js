/**
 * 潮汐志网页版日历同步服务
 * 
 * 负责与安卓客户端进行数据同步，确保跨平台数据一致性
 * 
 * 核心功能：
 * 1. 定时检查数据变化
 * 2. 监测文件修改时间
 * 3. 处理数据冲突
 * 4. 保持数据格式兼容性
 */

class CalendarSyncService {
    constructor() {
        this.syncInterval = 5 * 60 * 1000; // 5分钟
        this.syncTimer = null;
        this.isSyncing = false;
        this.lastSyncTime = null;
        this.lastFileModTime = null;
        
        // 监听页面可见性变化，页面激活时立即同步
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.shouldSync()) {
                this.performSync();
            }
        });
    }
    
    /**
     * 初始化同步服务
     */
    async init() {
        console.log('🔄 CalendarSyncService: 初始化网页版同步服务...');
        
        try {
            // 立即执行一次同步
            await this.performSync();
            
            // 启动定时同步
            this.startPeriodicSync();
            
            console.log('✅ CalendarSyncService: 网页版同步服务初始化完成');
        } catch (error) {
            console.error('❌ CalendarSyncService: 初始化失败', error);
        }
    }
    
    /**
     * 启动定时同步
     */
    startPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
        }
        
        this.syncTimer = setInterval(async () => {
            if (!this.isSyncing && this.shouldSync()) {
                await this.performSync();
            }
        }, this.syncInterval);
        
        console.log(`📅 CalendarSyncService: 定时同步已启动，间隔：${this.syncInterval / 1000 / 60}分钟`);
    }
    
    /**
     * 停止定时同步
     */
    stopPeriodicSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
            console.log('⏹️ CalendarSyncService: 定时同步已停止');
        }
    }
    
    /**
     * 判断是否需要同步
     */
    shouldSync() {
        // 如果从未同步过，需要同步
        if (!this.lastSyncTime) return true;
        
        // 如果距离上次同步超过间隔时间，需要同步
        const now = Date.now();
        return (now - this.lastSyncTime) >= this.syncInterval;
    }
    
    /**
     * 执行同步操作
     */
    async performSync() {
        if (this.isSyncing) {
            console.log('⏳ CalendarSyncService: 同步进行中，跳过本次同步');
            return;
        }
        
        this.isSyncing = true;
        
        try {
            console.log('🔄 CalendarSyncService: 开始检查数据变化...');
            
            // 1. 获取文件修改时间
            const fileModTime = await this.getFileModificationTime();
            
            // 2. 如果文件没有变化，跳过同步
            if (this.lastFileModTime && fileModTime <= this.lastFileModTime) {
                console.log('📄 CalendarSyncService: 文件无变化，跳过同步');
                this.lastSyncTime = Date.now();
                return;
            }
            
            // 3. 重新加载事件数据
            await this.reloadEventsData();
            
            // 4. 触发界面更新
            this.triggerUIRefresh();
            
            // 5. 更新同步时间记录
            this.lastFileModTime = fileModTime;
            this.lastSyncTime = Date.now();
            
            console.log('✅ CalendarSyncService: 同步完成');
            
        } catch (error) {
            console.error('❌ CalendarSyncService: 同步失败', error);
        } finally {
            this.isSyncing = false;
        }
    }
    
    /**
     * 获取文件修改时间
     */
    async getFileModificationTime() {
        try {
            const response = await fetch('/api/calendar/file-info');
            if (!response.ok) throw new Error('获取文件信息失败');
            
            const fileInfo = await response.json();
            return new Date(fileInfo.lastModified).getTime();
        } catch (error) {
            console.error('获取文件修改时间失败:', error);
            return Date.now();
        }
    }
    
    /**
     * 重新加载事件数据
     */
    async reloadEventsData() {
        try {
            const response = await fetch('/api/calendar/events?force_reload=true');
            if (!response.ok) throw new Error('重新加载事件数据失败');
            
            const events = await response.json();
            console.log(`📥 CalendarSyncService: 重新加载了 ${events.length} 个事件`);
            
            // 存储到全局变量或状态管理中
            window.calendarEvents = events;
            
            return events;
        } catch (error) {
            console.error('重新加载事件数据失败:', error);
            return [];
        }
    }
    
    /**
     * 触发界面更新
     */
    triggerUIRefresh() {
        // 触发自定义事件，通知界面更新
        const event = new CustomEvent('calendarDataUpdated', {
            detail: {
                timestamp: Date.now(),
                source: 'sync'
            }
        });
        document.dispatchEvent(event);
        
        // 如果使用React等框架，这里可以调用相应的状态更新函数
        if (window.updateCalendarState) {
            window.updateCalendarState();
        }
    }
    
    /**
     * 手动触发同步
     */
    async triggerSync() {
        console.log('🔄 CalendarSyncService: 手动触发同步...');
        await this.performSync();
    }
    
    /**
     * 获取同步状态
     */
    getSyncStatus() {
        return {
            isSyncing: this.isSyncing,
            lastSyncTime: this.lastSyncTime,
            isAutoSyncEnabled: this.syncTimer !== null,
            statusText: this.getStatusText()
        };
    }
    
    /**
     * 获取状态文本
     */
    getStatusText() {
        if (this.isSyncing) return '同步中...';
        if (!this.lastSyncTime) return '未同步';
        
        const now = Date.now();
        const diff = now - this.lastSyncTime;
        
        if (diff < 60000) return '刚刚同步'; // 1分钟内
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前同步`; // 1小时内
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前同步`; // 1天内
        return `${Math.floor(diff / 86400000)}天前同步`; // 超过1天
    }
    
    /**
     * 启用/禁用自动同步
     */
    setAutoSync(enabled) {
        if (enabled && !this.syncTimer) {
            this.startPeriodicSync();
        } else if (!enabled && this.syncTimer) {
            this.stopPeriodicSync();
        }
    }
    
    /**
     * 设置同步间隔
     * @param {number} intervalMinutes 同步间隔（分钟）
     */
    setSyncInterval(intervalMinutes) {
        this.syncInterval = intervalMinutes * 60 * 1000;
        
        if (this.syncTimer) {
            this.stopPeriodicSync();
            this.startPeriodicSync();
        }
        
        console.log(`⚙️ CalendarSyncService: 同步间隔已设置为 ${intervalMinutes} 分钟`);
    }
    
    /**
     * 销毁服务
     */
    dispose() {
        this.stopPeriodicSync();
        this.lastSyncTime = null;
        this.lastFileModTime = null;
        console.log('🗑️ CalendarSyncService: 网页版同步服务已销毁');
    }
}

// 创建全局实例
const calendarSyncService = new CalendarSyncService();

// 导出服务
export default calendarSyncService;

// 同时挂载到window对象，便于调试
window.calendarSyncService = calendarSyncService;