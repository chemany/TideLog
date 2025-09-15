// backend/regex_parser.js - 增强版

/**
 * 辅助函数：解析多种格式的日期字符串 (YYYY-MM-DD, YYYY/MM/DD, YYYY年MM月DD日)
 * @param {string} dateStr - 日期字符串
 * @returns {Date | null} 解析后的 Date 对象或 null
 */
function parseDateString(dateStr) {
    if (!dateStr) return null;
    try {
        // 替换中文年月，并处理可能的额外字符和空格
        const standardizedStr = dateStr.replace(/年|月/g, '-').replace(/日/, '').trim();
        // 尝试多种格式解析，增加鲁棒性
        const date = new Date(standardizedStr); 
        if (!isNaN(date.getTime())) {
            // 基本有效性检查
            if(date.getFullYear() < 2000 || date.getFullYear() > 2100) {
                console.warn(`[ParseDate-Regex] 解析出的年份不合理: ${date.getFullYear()} from ${dateStr}`);
                return null;
            }
            return date;
        } 
    } catch(e) {
        console.error(`[ParseDate-Regex] 解析日期字符串 "${dateStr}" 出错:`, e);
    }
    console.warn(`[ParseDate-Regex] 无法解析日期字符串: ${dateStr}`);
    return null;
}

/**
 * 智能解析中文时间表达式
 * @param {string} timeStr - 时间表达式
 * @param {string} context - 上下文（上午/下午）
 * @returns {number|null} 小时数
 */
function parseChineseTime(timeStr, context = '') {
    // 处理"1点半"这样的表达
    const halfMatch = timeStr.match(/(\d{1,2})\s?(点半|半)/);
    if (halfMatch) {
        let hours = parseInt(halfMatch[1]);
        if (context.includes('下午') && hours < 12) hours += 12;
        if (context.includes('上午') && hours === 12) hours = 0;
        return hours + 0.5; // 返回小数表示半点
    }
    
    // 处理"1点"这样的表达
    const simpleMatch = timeStr.match(/(\d{1,2})\s?(点|时)/);
    if (simpleMatch) {
        let hours = parseInt(simpleMatch[1]);
        if (context.includes('下午') && hours < 12) hours += 12;
        if (context.includes('上午') && hours === 12) hours = 0;
        return hours;
    }
    
    // 处理时间点描述
    const timePointMap = {
        '凌晨': 2, '半夜': 2, '深夜': 23,
        '早上': 8, '早晨': 8,
        '上午': 10,
        '中午': 12,
        '下午': 14,
        '傍晚': 17,
        '晚上': 19, '晚间': 19
    };
    
    for (const [point, hour] of Object.entries(timePointMap)) {
        if (timeStr.includes(point)) {
            return hour;
        }
    }
    
    return null;
}

/**
 * 使用增强的正则表达式尝试从文本中解析事件信息。
 * @param {string} text - 要解析的文本。
 * @returns {{title: string, start_datetime: string|null, end_datetime: string|null, description: string|null, location: string|null}} 解析结果。
 */
function parse(text) {
    console.log(`[Regex Parse] 开始解析文本: "${text.substring(0, 100)}..."`);
    
    let title = text; // 默认标题为完整文本
    let startDate = null;
    let endDate = null;
    let isAllDay = false;

    try {
        // 增强的正则表达式系统
        const patterns = {
            date: /(\d{4}[-/年]\s?\d{1,2}[-/月]\s?\d{1,2})日?/g,
            time: /(\d{1,2})\s?[:：]\s?(\d{2})\s?([APap][Mm])?/g,
            timeRange: /(\d{1,2})\s?[:：]\s?(\d{2})\s*[-—～至]\s*(\d{1,2})\s?[:：]\s?(\d{2})/g,
            todayTime: /[本今](\d{1,2})\s?[:：]\s?(\d{2})/g,
            relativeDate: /(今天|今日|明天|明日|后天|昨天|昨日)/g,
            relativeTime: /(上午|下午|早上|早晨|中午|晚上|傍晚|晚间|凌晨|半夜|深夜)/g,
            timePoint: /(凌晨|半夜|深夜|早上|早晨|上午|中午|下午|傍晚|晚上|晚间|深夜)/g,
            simpleTime: /(\d{1,2})\s?(点|时)/g,
            halfTime: /(\d{1,2})\s?(点半|半)/g,
            weekday: /(周一|周二|周三|周四|周五|周六|周日|星期一|星期二|星期三|星期四|星期五|星期六|星期日|周[一二三四五六日])/g
        };

        // 执行所有匹配
        const matches = {};
        for (const [key, regex] of Object.entries(patterns)) {
            matches[key] = [...text.matchAll(regex)];
        }

        // 优先级1: 处理"本13:30"模式（今天具体时间）
        if (matches.todayTime.length > 0) {
            console.log("[Regex Parse] 检测到今天时间模式");
            startDate = new Date();
            const match = matches.todayTime[0];
            let hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            
            // 根据上下文调整小时
            if (text.includes('下午') && hours < 12) hours += 12;
            if (text.includes('上午') && hours === 12) hours = 0;
            
            startDate.setHours(hours, minutes, 0, 0);
            endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
            
            // 检查时间范围
            if (matches.timeRange.length > 0) {
                const rangeMatch = matches.timeRange[0];
                const startHours = parseInt(rangeMatch[1]);
                const startMinutes = parseInt(rangeMatch[2]);
                const endHours = parseInt(rangeMatch[3]);
                const endMinutes = parseInt(rangeMatch[4]);
                
                if (!isNaN(startHours) && !isNaN(startMinutes) && !isNaN(endHours) && !isNaN(endMinutes)) {
                    let adjustedStartHours = startHours;
                    let adjustedEndHours = endHours;
                    
                    if (text.includes('下午')) {
                        if (startHours < 12) adjustedStartHours += 12;
                        if (endHours < 12) adjustedEndHours += 12;
                    }
                    if (text.includes('上午')) {
                        if (startHours === 12) adjustedStartHours = 0;
                        if (endHours === 12) adjustedEndHours = 0;
                    }
                    
                    startDate.setHours(adjustedStartHours, startMinutes, 0, 0);
                    endDate.setHours(adjustedEndHours, endMinutes, 0, 0);
                }
            }
        }
        // 优先级2: 处理明确日期
        else if (matches.date.length > 0) {
            const parsedDate = parseDateString(matches.date[0][1]);
            if (parsedDate) {
                startDate = parsedDate;
                endDate = new Date(startDate);
                
                // 尝试提取标题
                const dateIndex = text.indexOf(matches.date[0][0]);
                if (dateIndex > 0) {
                    title = text.substring(0, dateIndex).replace(/[.,;:!?]$/, '').trim();
                } else if (text.length > matches.date[0][0].length) {
                    title = text.substring(matches.date[0][0].length).trim();
                }
                
                // 处理时间
                let hasTime = false;
                
                // 检查时间范围
                if (matches.timeRange.length > 0) {
                    const rangeMatch = matches.timeRange[0];
                    const startHours = parseInt(rangeMatch[1]);
                    const startMinutes = parseInt(rangeMatch[2]);
                    const endHours = parseInt(rangeMatch[3]);
                    const endMinutes = parseInt(rangeMatch[4]);
                    
                    if (!isNaN(startHours) && !isNaN(startMinutes) && !isNaN(endHours) && !isNaN(endMinutes)) {
                        let adjustedStartHours = startHours;
                        let adjustedEndHours = endHours;
                        
                        // 根据上下文调整
                        if (text.includes('下午')) {
                            if (startHours < 12) adjustedStartHours += 12;
                            if (endHours < 12) adjustedEndHours += 12;
                        }
                        if (text.includes('上午')) {
                            if (startHours === 12) adjustedStartHours = 0;
                            if (endHours === 12) adjustedEndHours = 0;
                        }
                        
                        startDate.setHours(adjustedStartHours, startMinutes, 0, 0);
                        endDate.setHours(adjustedEndHours, endMinutes, 0, 0);
                        hasTime = true;
                        console.log(`[Regex Parse] 时间范围解析成功`);
                    }
                }
                
                // 检查具体时间
                if (!hasTime && matches.time.length > 0) {
                    const timeMatch = matches.time[0];
                    let hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const ampm = timeMatch[3];
                    
                    // 处理AM/PM
                    if (ampm) {
                        if (ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
                        if (ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
                    } else {
                        // 根据上下文推断
                        if (hours < 12 && text.includes('下午')) hours += 12;
                        if (hours === 12 && text.includes('上午')) hours = 0;
                    }
                    
                    if (!isNaN(hours) && !isNaN(minutes)) {
                        startDate.setHours(hours, minutes, 0, 0);
                        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                        hasTime = true;
                        
                        // 检查结束时间
                        if (matches.time.length > 1) {
                            const endTimeMatch = matches.time[1];
                            let endHours = parseInt(endTimeMatch[1]);
                            const endMinutes = parseInt(endTimeMatch[2]);
                            const endAmpm = endTimeMatch[3];
                            
                            if (endAmpm) {
                                if (endAmpm.toLowerCase() === 'am' && endHours === 12) endHours = 0;
                                if (endAmpm.toLowerCase() === 'pm' && endHours < 12) endHours += 12;
                            } else {
                                if (endHours < 12 && text.includes('下午')) endHours += 12;
                                if (endHours === 12 && text.includes('上午')) endHours = 0;
                            }
                            
                            if (!isNaN(endHours) && !isNaN(endMinutes)) {
                                const potentialEndDate = new Date(startDate);
                                potentialEndDate.setHours(endHours, endMinutes, 0, 0);
                                if (potentialEndDate >= startDate) {
                                    endDate = potentialEndDate;
                                }
                            }
                        }
                    }
                }
                
                // 处理中文时间表达
                if (!hasTime) {
                    let eventHour = null;
                    
                    if (matches.simpleTime.length > 0) {
                        eventHour = parseChineseTime(matches.simpleTime[0][0], text);
                    } else if (matches.halfTime.length > 0) {
                        eventHour = parseChineseTime(matches.halfTime[0][0], text);
                    } else if (matches.timePoint.length > 0) {
                        eventHour = parseChineseTime(matches.timePoint[0][0], text);
                    }
                    
                    if (eventHour !== null) {
                        if (eventHour % 1 === 0.5) {
                            // 处理半点
                            startDate.setHours(Math.floor(eventHour), 30, 0, 0);
                        } else {
                            startDate.setHours(eventHour, 0, 0, 0);
                        }
                        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
                        hasTime = true;
                    }
                }
                
                if (!hasTime) {
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(23, 59, 59, 999);
                    isAllDay = true;
                }
            }
        }
        // 优先级3: 处理相对时间
        else if (matches.relativeDate.length > 0 || matches.relativeTime.length > 0 || matches.weekday.length > 0) {
            console.log("[Regex Parse] 尝试解析相对时间");
            
            let relativeDate = new Date();
            
            // 处理相对日期
            if (matches.relativeDate.length > 0) {
                const dateStr = matches.relativeDate[0][1];
                switch (dateStr) {
                    case '今天': case '今日': break;
                    case '明天': case '明日': relativeDate.setDate(relativeDate.getDate() + 1); break;
                    case '后天': relativeDate.setDate(relativeDate.getDate() + 2); break;
                    case '昨天': case '昨日': relativeDate.setDate(relativeDate.getDate() - 1); break;
                }
            }
            
            // 处理星期
            if (matches.weekday.length > 0) {
                const weekdayMap = {
                    '周一': 1, '星期一': 1, '周一': 1,
                    '周二': 2, '星期二': 2, '周二': 2,
                    '周三': 3, '星期三': 3, '周三': 3,
                    '周四': 4, '星期四': 4, '周四': 4,
                    '周五': 5, '星期五': 5, '周五': 5,
                    '周六': 6, '星期六': 6, '周六': 6,
                    '周日': 0, '星期日': 0, '周日': 0
                };
                
                const targetWeekday = weekdayMap[matches.weekday[0][1]];
                if (targetWeekday !== undefined) {
                    const currentWeekday = relativeDate.getDay();
                    let daysToAdd = targetWeekday - currentWeekday;
                    if (daysToAdd <= 0) daysToAdd += 7;
                    relativeDate.setDate(relativeDate.getDate() + daysToAdd);
                }
            }
            
            // 处理时间
            let eventHour = 14; // 默认下午2点
            
            if (matches.relativeTime.length > 0) {
                const timeStr = matches.relativeTime[0][1];
                const hourMap = {
                    '凌晨': 2, '半夜': 2, '深夜': 23,
                    '早上': 8, '早晨': 8,
                    '上午': 10,
                    '中午': 12,
                    '下午': 14,
                    '傍晚': 17,
                    '晚上': 19, '晚间': 19
                };
                eventHour = hourMap[timeStr] || 14;
            } else if (matches.simpleTime.length > 0) {
                const parsedHour = parseChineseTime(matches.simpleTime[0][0], text);
                eventHour = parsedHour || 14;
            } else if (matches.halfTime.length > 0) {
                const parsedHour = parseChineseTime(matches.halfTime[0][0], text);
                eventHour = parsedHour || 14;
            }
            
            if (matches.time.length > 0) {
                const timeMatch = matches.time[0];
                let hours = parseInt(timeMatch[1]);
                const minutes = parseInt(timeMatch[2]);
                const ampm = timeMatch[3];
                
                if (ampm) {
                    if (ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
                    if (ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
                }
                
                if (!isNaN(hours) && !isNaN(minutes)) {
                    relativeDate.setHours(hours, minutes, 0, 0);
                } else {
                    relativeDate.setHours(eventHour, 0, 0, 0);
                }
            } else {
                relativeDate.setHours(eventHour, 0, 0, 0);
            }
            
            startDate = relativeDate;
            endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
            
            // 提取标题 - 更智能的清理方式
            let cleanedText = text;
            
            // 只移除完整的时间表达式，保留词汇的其他部分
            cleanedText = cleanedText.replace(patterns.relativeDate, '');
            cleanedText = cleanedText.replace(patterns.relativeTime, '');
            cleanedText = cleanedText.replace(patterns.weekday, '');
            cleanedText = cleanedText.replace(patterns.time, '');
            cleanedText = cleanedText.replace(patterns.todayTime, '');
            cleanedText = cleanedText.replace(patterns.timeRange, '');
            cleanedText = cleanedText.replace(patterns.timePoint, '');
            
            // 对于简单时间和半点时间，移除整个表达式
            cleanedText = cleanedText.replace(patterns.simpleTime, '');
            cleanedText = cleanedText.replace(patterns.halfTime, '');
            
            title = cleanedText.trim();
        }

        // 清理标题
        if (title === text || title.length < 2) {
            title = '未命名事件';
        } else {
            // 移除多余的标点符号
            title = title.replace(/[.,;:!?]+$/, '').trim();
            if (title.length < 2) title = '未命名事件';
        }

    } catch (e) {
        console.error("[Regex Parse] 解析过程中出错:", e);
        startDate = null;
        endDate = null;
    }

    const result = {
        title: title,
        start_datetime: startDate && !isNaN(startDate.getTime()) ? startDate.toISOString() : null,
        end_datetime: endDate && startDate && !isNaN(endDate.getTime()) && endDate >= startDate ? endDate.toISOString() : null,
        description: null,
        location: null,
        is_all_day: isAllDay && startDate !== null
    };
    
    console.log("[Regex Parse] 解析结果:", result);
    return result;
}

// 导出 parse 函数
module.exports = {
    parse
};