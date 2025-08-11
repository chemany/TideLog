// backend/regex_parser.js

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
      // 可以添加对 YYYY/MM/DD 等格式的补充尝试（如果 new Date 不能直接处理）
      
    } catch(e) {
      console.error(`[ParseDate-Regex] 解析日期字符串 "${dateStr}" 出错:`, e);
    }
    console.warn(`[ParseDate-Regex] 无法解析日期字符串: ${dateStr}`);
    return null;
  }
  
  /**
   * 使用正则表达式尝试从文本中解析事件信息。
   * @param {string} text - 要解析的文本。
   * @returns {{title: string, start_datetime: string|null, end_datetime: string|null, description: string|null, location: string|null}} 解析结果。
   */
  function parse(text) {
      console.log(`[Regex Parse] Attempting to parse text: "${text.substring(0, 100)}..."`);
      let title = text; // 默认标题为完整文本
      let startDate = null;
      let endDate = null;
      let isAllDay = false;
  
      try {
          // 改进的正则表达式
          const dateRegex = /(\d{4}[-/年]\s?\d{1,2}[-/月]\s?\d{1,2})日?/g; 
          const timeRegex = /(\d{1,2}\s?[:：]\s?\d{2})\s?([APap][Mm])?/g; 
          
          // 新增：相对时间正则表达式
          const relativeDateRegex = /(今天|今日|明天|明日|后天|昨天|昨日)/g;
          const relativeTimeRegex = /(上午|下午|早上|早晨|中午|晚上|傍晚|晚间)/g;
          const weekdayRegex = /(周一|周二|周三|周四|周五|周六|周日|星期一|星期二|星期三|星期四|星期五|星期六|星期日)/g;
  
          const dateMatches = [...text.matchAll(dateRegex)];
          const timeMatches = [...text.matchAll(timeRegex)];
          const relativeDateMatches = [...text.matchAll(relativeDateRegex)];
          const relativeTimeMatches = [...text.matchAll(relativeTimeRegex)];
          const weekdayMatches = [...text.matchAll(weekdayRegex)];
          
          let extractedTitlePart = text; // 用于尝试提取标题
  
          if (dateMatches.length > 0) {
              const parsedDate = parseDateString(dateMatches[0][1]); 
              if (parsedDate) {
                   startDate = parsedDate;
                   endDate = new Date(startDate); 
                   
                   // 尝试提取日期前的部分作为标题
                   const dateStartIndex = text.indexOf(dateMatches[0][0]);
                   if (dateStartIndex > 0) {
                       extractedTitlePart = text.substring(0, dateStartIndex).trim();
                       // 移除可能的标点符号结尾
                       extractedTitlePart = extractedTitlePart.replace(/[.,;:!?]$/, '').trim();
                   } else if (text.length > dateMatches[0][0].length) {
                        // 如果日期在开头，尝试用日期后的部分
                        extractedTitlePart = text.substring(dateMatches[0][0].length).trim();
                   }
                   // 如果提取的部分太短或不像标题，则回退
                   title = (extractedTitlePart && extractedTitlePart.length > 2) ? extractedTitlePart : title;
  
  
                   if (timeMatches.length > 0) {
                       const timeParts = timeMatches[0][1].replace('：', ':').split(':');
                       let hours = parseInt(timeParts[0]);
                       const minutes = parseInt(timeParts[1]);
                       const ampm = timeMatches[0][2];
  
                       if (ampm && hours === 12 && ampm.toLowerCase() === 'am') hours = 0;
                       if (ampm && hours < 12 && ampm.toLowerCase() === 'pm') hours += 12;
                       
                       if (!isNaN(hours) && !isNaN(minutes)) {
                           startDate.setHours(hours, minutes, 0, 0);
                           endDate = new Date(startDate.getTime() + 60 * 60 * 1000); 
  
                           if (timeMatches.length > 1) {
                               const endTimeParts = timeMatches[1][1].replace('：', ':').split(':');
                               let endHours = parseInt(endTimeParts[0]);
                               const endMinutes = parseInt(endTimeParts[1]);
                               const endAmpm = timeMatches[1][2];
                               
                               if (endAmpm && endHours === 12 && endAmpm.toLowerCase() === 'am') endHours = 0;
                               if (endAmpm && endHours < 12 && endAmpm.toLowerCase() === 'pm') endHours += 12;
  
                               if (!isNaN(endHours) && !isNaN(endMinutes)) {
                                   const potentialEndDate = new Date(startDate); 
                                   potentialEndDate.setHours(endHours, endMinutes, 0, 0);
                                   if (potentialEndDate >= startDate) {
                                       endDate = potentialEndDate;
                                   }
                               }
                           }
                       } 
                   } else {
                       startDate.setHours(0, 0, 0, 0);
                       endDate.setHours(23, 59, 59, 999);
                       isAllDay = true;
                   }
              }
          }
          
          // 如果没有找到明确日期，尝试解析相对日期和时间
          if (!startDate && (relativeDateMatches.length > 0 || relativeTimeMatches.length > 0 || weekdayMatches.length > 0)) {
              console.log("[Regex Parse] 尝试解析相对时间...");
              
              let relativeDate = new Date(); // 默认今天
              
              // 解析相对日期
              if (relativeDateMatches.length > 0) {
                  const relativeDateStr = relativeDateMatches[0][1];
                  switch (relativeDateStr) {
                      case '今天':
                      case '今日':
                          // 默认已经是今天，不需要修改
                          break;
                      case '明天':
                      case '明日':
                          relativeDate.setDate(relativeDate.getDate() + 1);
                          break;
                      case '后天':
                          relativeDate.setDate(relativeDate.getDate() + 2);
                          break;
                      case '昨天':
                      case '昨日':
                          relativeDate.setDate(relativeDate.getDate() - 1);
                          break;
                  }
              }
              
              // 解析星期几（假设是下周的该天）
              if (weekdayMatches.length > 0) {
                  const weekdayStr = weekdayMatches[0][1];
                  const weekdayMap = {
                      '周一': 1, '星期一': 1,
                      '周二': 2, '星期二': 2,
                      '周三': 3, '星期三': 3,
                      '周四': 4, '星期四': 4,
                      '周五': 5, '星期五': 5,
                      '周六': 6, '星期六': 6,
                      '周日': 0, '星期日': 0
                  };
                  
                  const targetWeekday = weekdayMap[weekdayStr];
                  if (targetWeekday !== undefined) {
                      const currentWeekday = relativeDate.getDay();
                      let daysToAdd = targetWeekday - currentWeekday;
                      
                      // 如果目标是今天的星期几，则找下周的同一天
                      if (daysToAdd <= 0) {
                          daysToAdd += 7;
                      }
                      
                      relativeDate.setDate(relativeDate.getDate() + daysToAdd);
                  }
              }
              
              // 解析相对时间
              if (relativeTimeMatches.length > 0) {
                  const relativeTimeStr = relativeTimeMatches[0][1];
                  let hour = 14; // 默认下午2点
                  
                  switch (relativeTimeStr) {
                      case '上午':
                      case '早上':
                      case '早晨':
                          hour = 9; // 上午9点
                          break;
                      case '中午':
                          hour = 12; // 中午12点
                          break;
                      case '下午':
                          hour = 14; // 下午2点
                          break;
                      case '晚上':
                      case '傍晚':
                      case '晚间':
                          hour = 19; // 晚上7点
                          break;
                  }
                  
                  relativeDate.setHours(hour, 0, 0, 0);
              } else {
                  // 如果只有日期没有时间，默认设为全天事件
                  relativeDate.setHours(0, 0, 0, 0);
                  isAllDay = true;
              }
              
              startDate = relativeDate;
              endDate = new Date(startDate);
              
              if (isAllDay) {
                  endDate.setHours(23, 59, 59, 999);
              } else {
                  endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 默认1小时
              }
              
              // 提取标题（去除时间相关词汇）
              extractedTitlePart = text
                  .replace(relativeDateRegex, '')
                  .replace(relativeTimeRegex, '')
                  .replace(weekdayRegex, '')
                  .trim();
              
              title = (extractedTitlePart && extractedTitlePart.length > 2) ? extractedTitlePart : title;
              
              console.log(`[Regex Parse] 相对时间解析成功: ${startDate.toISOString()}`);
          }
      } catch (e) {
           console.error("[Regex Parse] Error during regex parsing:", e);
           // 保留 startDate 和 endDate 为 null
           startDate = null;
           endDate = null;
      }
  
     const result = {
         title: title || '未命名事件 (正则)',
         start_datetime: startDate && !isNaN(startDate) ? startDate.toISOString() : null,
         end_datetime: endDate && startDate && !isNaN(endDate) && endDate >= startDate ? endDate.toISOString() : null,
         description: null, // 正则表达式难以提取良好描述
         location: null, // 正则表达式难以提取地点
         is_all_day: isAllDay && startDate !== null, // 仅当有日期时才认为全天
     };
     console.log("[Regex Parse] Result:", result);
     return result;
  }
  
  // 导出 parse 函数
  module.exports = {
      parse
  };