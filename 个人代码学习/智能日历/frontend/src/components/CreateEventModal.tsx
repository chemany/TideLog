import React, { useState, useEffect, useCallback } from 'react';
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
}) => {
  // --- State for form fields ---
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  /**
   * Effect Hook: 当 slotInfo 或 eventData 变化时，更新模态框内的起止时间
   * 并根据选择的时间差判断是否默认为全天事件
   */
  useEffect(() => {
    if (eventData) {
      // Editing mode: Populate from eventData
      setTitle(eventData.title || '');
      setStartTime(eventData.start || null);
      setEndTime(eventData.end || null);
      setIsAllDay(eventData.allDay || false);
      setDescription(eventData.description || '');
      setLocation(eventData.location || '');
    } else if (slotInfo) {
      // Creation mode: Populate from slotInfo
      setTitle(''); // Reset title for new event
      setStartTime(slotInfo.start);
      // Default end time: 1 hour after start, or slot end if defined
      const defaultEndDate = slotInfo.end && slotInfo.end > slotInfo.start
        ? slotInfo.end
        : new Date(slotInfo.start.getTime() + 60 * 60 * 1000);
      setEndTime(defaultEndDate);
      setIsAllDay(false); // Default to not all-day
      setDescription('');
      setLocation('');
      } else {
      // Reset form if neither is provided (e.g., modal closed and reopened unexpectedly)
      setTitle('');
      setStartTime(null);
      setEndTime(null);
           setIsAllDay(false);
      setDescription('');
      setLocation('');
    }
  }, [isOpen, slotInfo, eventData]);

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
                 onChange={(e) => setStartTime(e.target.value ? parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date()) : null)}
                 required
                 className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
               />
            </div>
             <div>
               <label htmlFor="event-end-modal" className="block text-sm font-medium text-gray-700">结束时间 (可选):</label>
              <input
                 type="datetime-local"
                 id="event-end-modal"
                 value={endTime ? format(endTime, "yyyy-MM-dd'T'HH:mm") : ''}
                 onChange={(e) => setEndTime(e.target.value ? parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date()) : null)}
                 min={startTime ? format(startTime, "yyyy-MM-dd'T'HH:mm") : undefined}
                 className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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