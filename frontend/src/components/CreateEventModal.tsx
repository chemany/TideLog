import { useState, useEffect, useCallback } from 'react';
import { format, parse } from 'date-fns';
// Re-exporting types for now, consider a dedicated types file later
import type { SlotInfo, MyCalendarEvent } from '../app/page';

/**
 * 组件 Props 定义
 * @interface CreateEventModalProps
 * @property {boolean} isOpen - 模态框是否打开
 * @property {() => void} onClose - 关闭模态框的回调函数
 * @property {SlotInfo | null} slotInfo - 从日历选中的时间段信息
 * @property {MyCalendarEvent | null} eventData - 选中的事件数据
 * @property {(eventData: Omit<MyCalendarEvent, 'id'> & { id?: string | number }) => void} onSave - 保存事件的回调函数
 */
interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  slotInfo: SlotInfo | null;
  eventData?: MyCalendarEvent | null;
  onSave: (eventData: Omit<MyCalendarEvent, 'id'> & { id?: string | number }) => void;
  existingEvents?: MyCalendarEvent[];
}

/**
 * 创建新事件的模态框组件
 * @param {CreateEventModalProps} props - 组件属性
 */
const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  slotInfo,
  eventData,
  onSave,
  existingEvents = [],
}) => {
  // --- State for form fields ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [conflicts, setConflicts] = useState<MyCalendarEvent[]>([]);
  const [isEndTimeManuallyModified, setIsEndTimeManuallyModified] = useState(false);

  /**
   * Effect Hook: 当 slotInfo 或 eventData 变化时，更新模态框内的起止时间
   * 并根据选择的时间差判断是否默认为全天事件
   */
  useEffect(() => {
    if (eventData) {
      // 检查 eventData 是否代表一个已存在的事件 (有ID) 或一个来自LLM的预填充建议 (无ID)
      if (eventData.id) {
        // Editing mode: Populate from existing eventData (has an ID)
        setTitle(eventData.title || '');
        const eventStart = eventData.start || null;
        setStartTime(eventStart);
        
        // 如果没有结束时间或结束时间不合适，设置为开始时间+1小时
        let eventEnd = eventData.end || null;
        if (eventStart && (!eventEnd || eventEnd <= eventStart)) {
          eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);
        }
        setEndTime(eventEnd);
        
        setIsAllDay(eventData.allDay || false);
        setDescription(eventData.description || '');
        setLocation(eventData.location || ''); // 编辑时加载地点
        setIsEndTimeManuallyModified(false); // 重置手动修改标记
      } else {
        // Pre-filling from LLM suggestion: eventData exists but has no ID (or ID is falsy)
        // 这通常意味着这是后端 /events/parse-natural-language 返回的数据
        setTitle(eventData.title || '');
        // 后端返回的 start_datetime, end_datetime 是字符串，需要转换为 Date 对象
        // MyCalendarEvent 类型定义中 start/end 已经是 Date，假设上层在传递 eventData 时已转换
        const eventStart = eventData.start || null;
        setStartTime(eventStart);
        
        // 如果没有结束时间或结束时间不合适，设置为开始时间+1小时
        let eventEnd = eventData.end || null;
        if (eventStart && (!eventEnd || eventEnd <= eventStart)) {
          eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);
        }
        setEndTime(eventEnd);
        
        setIsAllDay(eventData.allDay || false);
        setDescription(eventData.description || '');
        setLocation(eventData.location || ''); // <--- 从LLM预填充地点
        setIsEndTimeManuallyModified(false); // 重置手动修改标记
      }
    } else if (slotInfo) {
      // Creation mode from calendar slot: Populate from slotInfo (no LLM data involved here directly)
      setTitle(''); // Reset title for new event from slot
      setStartTime(slotInfo.start);

      let calculatedDefaultEndDate;
      const isLikelyMonthViewDayClick =
        slotInfo.action === 'click' &&
        slotInfo.start.getHours() === 0 &&
        slotInfo.start.getMinutes() === 0 &&
        slotInfo.start.getSeconds() === 0 &&
        slotInfo.end.getTime() - slotInfo.start.getTime() === 24 * 60 * 60 * 1000;

      if (isLikelyMonthViewDayClick) {
        calculatedDefaultEndDate = new Date(slotInfo.start.getTime() + 60 * 60 * 1000);
      } else if (slotInfo.end && slotInfo.end > slotInfo.start) {
        calculatedDefaultEndDate = slotInfo.end;
      } else {
        calculatedDefaultEndDate = new Date(slotInfo.start.getTime() + 60 * 60 * 1000);
      }

      setEndTime(calculatedDefaultEndDate);
      setIsAllDay(false); 
      setDescription('');
      setLocation(''); // 从日历槽创建时，地点默认为空
      setIsEndTimeManuallyModified(false); // 重置手动修改标记
    } else {
      // Reset form if neither is provided
      setTitle('');
      setStartTime(null);
      setEndTime(null);
      setIsAllDay(false);
      setDescription('');
      setLocation('');
      setIsEndTimeManuallyModified(false); // 重置手动修改标记
    }
  }, [isOpen, slotInfo, eventData]);

  /**
   * Effect Hook: 当时间变化时检测冲突
   */
  useEffect(() => {
    if (!startTime || !endTime) {
      setConflicts([]);
      return;
    }

    const currentConflicts = existingEvents.filter(event => {
      // 排除当前正在编辑的事件
      if (eventData && event.id === eventData.id) return false;
      
      // 检查时间重叠
      return (
        (startTime >= event.start && startTime < event.end) ||
        (endTime > event.start && endTime <= event.end) ||
        (startTime <= event.start && endTime >= event.end)
      );
    });

    setConflicts(currentConflicts);
  }, [startTime, endTime, existingEvents, eventData]);

  /**
   * Effect Hook: 当起始时间变化时自动设置结束时间（默认1小时）
   * 只有在用户没有手动修改过结束时间时才自动更新
   */
  useEffect(() => {
    if (startTime && !isEndTimeManuallyModified) {
      // 自动设置结束时间为开始时间+1小时
      const newEndTime = new Date(startTime.getTime() + 60 * 60 * 1000);
      setEndTime(newEndTime);
    }
  }, [startTime, isEndTimeManuallyModified]);

  /**
   * 处理保存按钮点击事件
   */
  const handleSaveClick = useCallback(() => {
    // 移除非空断言 (!)，改为早期返回检查，确保 startTime 存在
    if (!startTime) {
        alert('无效的开始时间。');
      return;
    }
    
    // 结束时间逻辑
    let finalEndTime: Date; // 明确 finalEndTime 必须是 Date 类型

    if (isAllDay) {
        finalEndTime = new Date(startTime);
        finalEndTime.setHours(23, 59, 59, 999); // 设置为当天的最后一刻
    } else {
        // 如果不是全天
        if (endTime && endTime > startTime) {
            // 如果提供了有效的结束时间且晚于开始时间
            finalEndTime = endTime;
        } else {
            // 如果结束时间无效或未提供，则默认为开始时间后一小时
            finalEndTime = new Date(startTime.getTime() + 60 * 60 * 1000);
            // 可选：如果计算出的默认结束时间早于或等于开始时间（理论上不应发生），可以添加警告或回退
            if (finalEndTime <= startTime) {
                 console.warn("Calculated default end time is not after start time.");
                 // Fallback: Make it exactly one hour later
                 finalEndTime = new Date(startTime.getTime() + 60 * 60 * 1000);
            }
        }
    }

    // 再次校验 finalEndTime 必须晚于 startTime
    if (finalEndTime <= startTime) {
        alert('计算出的结束时间必须晚于开始时间。');
        return;
    }

    const eventToSave: Omit<MyCalendarEvent, 'id'> & { id?: string | number } = {
      id: eventData?.id, // 依赖于 eventData
      title: title.trim() || (eventData ? '已编辑事件' : '新事件'), // 依赖于 eventData
      start: startTime, // startTime 已确认非 null
      end: finalEndTime, // finalEndTime 已确保是 Date 类型且 > startTime
      allDay: isAllDay,
      description: description.trim() || undefined,
      location: location.trim() || undefined,
    };
    onSave(eventToSave);
  }, [title, description, location, isAllDay, startTime, endTime, onSave, eventData]); // 依赖数组保持不变

  if (!isOpen) {
    return null;
  }

  // --- Render ---
  return (
    <div className="fixed inset-0 overflow-y-auto h-full w-full z-20 flex items-center justify-center pointer-events-none">
      <div className="relative mx-auto p-5 border border-gray-300 w-full max-w-lg shadow-lg rounded-md bg-white pointer-events-auto">
        <form onSubmit={(e) => { e.preventDefault(); handleSaveClick(); }}>
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
             {eventData ? '编辑事件' : '创建新事件'}
          </h3>
          <div className="space-y-3">
          {/* 冲突提示 */}
          {conflicts.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    检测到 {conflicts.length} 个时间冲突
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <ul className="list-disc list-inside">
                      {conflicts.slice(0, 3).map(conflict => (
                        <li key={conflict.id}>
                          {conflict.title} ({format(conflict.start, 'MM-dd HH:mm')} - {format(conflict.end, 'HH:mm')})
                        </li>
                      ))}
                      {conflicts.length > 3 && (
                        <li>还有 {conflicts.length - 3} 个冲突...</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div>
               <label htmlFor="event-title-modal" className="block text-sm font-medium text-gray-700">标题:</label>
            <input
              type="text"
                 id="event-title-modal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
                 className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                 placeholder="事件标题"
              required
            />
          </div>
             <div>
               <label htmlFor="event-start-modal" className="block text-sm font-medium text-gray-700">开始时间:</label>
               <input
                 type="datetime-local"
                 id="event-start-modal"
                 value={startTime ? format(startTime, "yyyy-MM-dd'T'HH:mm") : ''}
                 onChange={(e) => {
  const newStartTime = e.target.value ? parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date()) : null;
  setStartTime(newStartTime);
}}
                 required
                 className={`mt-1 w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                   conflicts.length > 0 ? 'border-red-500 bg-red-50' : 'border-gray-300'
                 }`}
               />
            </div>
             <div>
               <label htmlFor="event-end-modal" className="block text-sm font-medium text-gray-700">结束时间:</label>
              <input
                 type="datetime-local"
                 id="event-end-modal"
                 value={endTime ? format(endTime, "yyyy-MM-dd'T'HH:mm") : ''}
                 onChange={(e) => {
  const newEndTime = e.target.value ? parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date()) : null;
  setEndTime(newEndTime);
  setIsEndTimeManuallyModified(true); // 标记用户手动修改了结束时间
}}
                 min={startTime ? format(startTime, "yyyy-MM-dd'T'HH:mm") : undefined}
                 className={`mt-1 w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                   conflicts.length > 0 ? 'border-red-500 bg-red-50' : 'border-gray-300'
                 }`}
               />
          </div>
          <div>
               <label htmlFor="event-description-modal" className="block text-sm font-medium text-gray-700">描述:</label>
            <textarea
                 id="event-description-modal"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
                 rows={3}
                 className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                 placeholder="事件详情"
            />
          </div>
          <div>
               <label htmlFor="event-location-modal" className="block text-sm font-medium text-gray-700">地点:</label>
            <input
              type="text"
                 id="event-location-modal"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
                 className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                 placeholder="事件地点"
            />
          </div>
        </div>
          <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            取消
          </button>
          <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
              {eventData ? '更新事件' : '保存事件'}
          </button>
        </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEventModal;

// Re-export types for now, consider a dedicated types file later
export type { SlotInfo, MyCalendarEvent }; 