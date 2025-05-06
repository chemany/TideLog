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
  
          const dateMatches = [...text.matchAll(dateRegex)];
          const timeMatches = [...text.matchAll(timeRegex)];
          
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