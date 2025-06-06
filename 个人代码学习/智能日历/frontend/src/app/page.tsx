"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Views, Event as RbcEvent, View } from 'react-big-calendar'; // 重命名 Event 防止冲突，添加 View type
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'; // 导入拖放 HOC
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'; // 导入拖放样式
import 'react-big-calendar/lib/css/react-big-calendar.css'; // 确保基础样式已导入
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { addMonths, addWeeks, addDays } from 'date-fns'; // <-- Import date calculation functions
import { zhCN } from 'date-fns/locale/zh-CN'; // 引入中文语言包
import { toast, Toaster } from 'react-hot-toast'; // 用于显示提示信息
import { Modal, Box } from '@mui/material'; // <-- Import Modal and Box
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'; // <-- 添加图标导入
import SettingsIcon from '@mui/icons-material/Settings';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import FileUploadIcon from '@mui/icons-material/FileUpload';

// Import the modal component
import CreateEventModal from '../components/CreateEventModal'; // 假设路径正确
import SettingsPanel from '../components/SettingsPanel';
import CustomEventComponent from '../components/CustomEventComponent'; // <-- 导入自定义事件组件

// --- 新增：颜色生成辅助函数 (如果需要，可以移到 utils) ---
// 这个函数根据字符串（如事件ID）生成一个相对稳定的 HSL 颜色中的 Hue 值
const stringToHue = (str: string): number => {
  let hash = 0;
  if (!str || str.length === 0) {
      return Math.random() * 360; // Fallback for empty strings
  }
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash % 360); // Hue is a degree on the color wheel (0-360)
};

const locales = {
  'zh-CN': zhCN, // 使用中文
};

// Configure the localizer, passing date-fns functions directly
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek, // Pass the imported startOfWeek function directly
  getDay,
  locales, // locale object should handle week start day
});

// 创建支持拖放的日历组件
const DnDCalendar = withDragAndDrop(Calendar);

// react-big-calendar 的中文消息配置
const messages = {
  allDay: '全天',
  previous: '上一步',
  next: '下一步',
  today: '今天',
  month: '月',
  week: '周',
  day: '日',
  agenda: '议程',
  date: '日期',
  time: '时间',
  event: '事件', // 如果 CalendarEvent 已被使用，这里可能需要调整
  noEventsInRange: '此范围内没有事件。',
  showMore: (total: number) => `+ 查看更多 (${total})`,
};

// 新增：定义日历的日期时间显示格式
const calendarFormats = {
  // 月视图事件时间格式：显示 AM/PM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventTimeRangeFormat: ({ start }: { start: Date, end: Date }, culture?: any, local?: any): string => {
    // 移除未使用的 end, culture, local 参数类型设为 any (与库匹配)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startTime = (local as any)?.format(start, 'p', culture) ?? format(start, 'p', { locale: zhCN }); // Use type assertion on local
    return startTime;
  },
};

// 事件接口定义
export interface MyCalendarEvent {
  id?: string | number; // 事件的唯一标识符
  title?: string; // 事件标题
  start: Date; // 事件开始时间 (改为必须，且是 Date)
  end: Date;   // 事件结束时间 (改为必须，且是 Date)
  allDay?: boolean; // 是否为全天事件
  completed?: boolean; // <-- 新增：事件是否完成
  resourceId?: string; // 相关资源ID
  description?: string; // 事件描述
  location?: string; // 事件地点
  created_at?: Date;
  updated_at?: Date;
}

// 日历格子信息接口定义
export interface SlotInfo {
  title?: string; // 选中时可能预设的标题
  start: Date; // 选中区域的开始时间
  end: Date; // 选中区域的结束时间
  slots: Date[] | string[]; // 包含的具体时间点或槽位
  action: 'select' | 'click' | 'doubleClick'; // 触发选择的操作类型
}

// Define the structure for LLM settings (matching backend)
// Keep this type as it might be used by SettingsPanel or fetched data
// export interface LLMSettingsData { ... } // Keep export if SettingsPanel imports it

// Backend might return date strings, so define a type for raw event data
interface RawBackendEvent {
    id: string | number;
    title?: string;
    start_datetime: string; // Expecting ISO string from backend
    end_datetime?: string; // Expecting ISO string from backend
    is_all_day?: boolean;
    completed?: boolean; // <-- 新增：从后端读取
    description?: string;
    location?: string;
    created_at: string;
    updated_at: string;
}

// Type for data expected from the parsing endpoint
interface ParsedEventData {
    title?: string;
    start_datetime?: string | null;
    end_datetime?: string | null;
}

// Type matching backend's EventCreate model (for POST /events)
interface EventCreatePayload {
  title?: string;
    start_datetime?: string;
    end_datetime?: string | null;
    is_all_day?: boolean;
  description?: string;
  location?: string;
  source?: string;
}

// Add interface for Exchange settings (data received from GET /config/exchange)
// Keep this type as it might be used by SettingsPanel or fetched data
// export interface ExchangeSettingsData { ... } // Keep export if SettingsPanel imports it

// --- 智能创建模态框的样式 (类似 SettingsPanel) ---
const smartCreateModalStyle = {
  position: 'absolute' as 'absolute', // 类型断言
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400, // 可以调整宽度
  bgcolor: 'background.paper',
  border: '1px solid #ccc',
  boxShadow: 24,
  p: 4, // 内边距
  borderRadius: '8px',
};

// 日历页面主组件
export default function CalendarPage() {
  // 状态管理
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [events, setEvents] = useState<MyCalendarEvent[]>([]);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<MyCalendarEvent | null>(null);
  const [naturalInput, setNaturalInput] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [showSmartCreateModal, setShowSmartCreateModal] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState<boolean>(false);
  const [eventToDeleteInfo, setEventToDeleteInfo] = useState<{ id: string | number | null, title: string | null }>({ id: null, title: null });
  // REMOVED unused llmSettings and exchangeSettings state
  // const [llmSettings, setLlmSettings] = useState<LLMSettingsData>({ provider: 'none' });
  // const [exchangeSettings, setExchangeSettings] = useState<ExchangeSettingsData>({});

  // --- Add State for Controlled View --- 
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState<Date>(new Date()); // <-- Add state for calendar date
  const [nextUpcomingEventId, setNextUpcomingEventId] = useState<string | number | null>(null); // <-- 新增 state

  // REMOVED useEffect related to initializing settings form fields

  // --- Effect to fetch initial data on component mount --- 
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoadingData(true);
      try {
        // REMOVED Fetching LLM Settings logic
        /*
        try {
          const settingsRes = await fetch('http://localhost:8001/config/llm'); 
          // ... (handling logic removed)
        } catch (error: unknown) { 
          // ... (error handling removed)
        }
        */

        // REMOVED Fetching Exchange Settings logic
        /*
        try {
          const exchangeSettingsRes = await fetch('http://localhost:8001/config/exchange');
          // ... (handling logic removed)
        } catch (error: unknown) { 
          // ... (error handling removed)
        }
        */

        // Fetch Events (Keep this)
        try {
          const eventsRes = await fetch('http://localhost:8001/events');
          if (eventsRes.ok) {
            const rawEvents: RawBackendEvent[] = await eventsRes.json();
            const calendarEvents: MyCalendarEvent[] = rawEvents
              // Step 1: Map raw data, ensure start/end are Date, handle potential nulls cautiously
              .map(event => ({
                id: event.id, // Keep id as is for now
                title: event.title || '无标题事件',
                // Handle potential invalid date strings gracefully
                start: event.start_datetime ? new Date(event.start_datetime) : null,
                end: event.end_datetime ? new Date(event.end_datetime) : null,
                allDay: event.is_all_day || false,
                completed: event.completed || false,
                description: event.description,
                location: event.location,
                created_at: event.created_at ? new Date(event.created_at) : undefined,
                updated_at: event.updated_at ? new Date(event.updated_at) : undefined,
              }))
              // Step 2: Filter out events where id is null/undefined or dates are invalid/null or end < start
              .filter(event => 
                 event.id != null && // Ensure id is not null/undefined
                 event.start instanceof Date && !isNaN(event.start.getTime()) &&
                 event.end instanceof Date && !isNaN(event.end.getTime()) &&
                 event.end >= event.start
              )
              // Step 3: Assert the type for the remaining valid events (now matches predicate expectation)
              .map(event => event as MyCalendarEvent & { id: string | number; start: Date; end: Date }); 
              // The assertion helps bridge the gap, but relies on the filter being correct.
              // We are effectively saying the result IS MyCalendarEvent with non-nullable id/start/end.

            setEvents(calendarEvents);
            console.log("Loaded and processed events:", calendarEvents);
            if (calendarEvents.length > 0) {
                console.log("First event local start time:", calendarEvents[0].start.toLocaleString()); 
                console.log("First event raw start Date object:", calendarEvents[0].start); 
            }
          } else {
            console.error(`Failed to fetch events: ${eventsRes.status}`);
            toast.error(`无法加载日程事件: ${eventsRes.statusText}`);
          }
        } catch (error: unknown) { 
          console.error("Events fetch error:", error);
          toast.error(`事件加载失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      } catch (error: unknown) { 
        console.error("Error in fetchInitialData:", error);
        toast.error(`加载初始数据失败: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchInitialData();
  }, []); // Empty dependency array means this runs once on mount

  // --- 新增：Effect Hook 计算下一个即将发生的事件 ---
  useEffect(() => {
    const now = new Date();
    const upcomingEvents = events
      .filter(event => event.start > now) // 筛选出开始时间在当前时间之后的事件
      .sort((a, b) => a.start.getTime() - b.start.getTime()); // 按开始时间升序排序

    if (upcomingEvents.length > 0) {
      setNextUpcomingEventId(upcomingEvents[0].id ?? null); // 设置第一个事件的 ID
    } else {
      setNextUpcomingEventId(null); // 没有即将发生的事件
    }
  }, [events]); // 当事件列表变化时重新计算
  // 注意：这个 effect 不会自动按时间推移更新，只在 events 变化时更新。
  // 如果需要实时更新（比如每分钟检查一次），需要引入计时器，但会增加复杂性和潜在性能影响。

  // --- 新增：事件样式获取器 ---
  /**
   * 根据事件属性返回自定义样式
   * @param {MyCalendarEvent} event - 当前事件对象 (Use specific type now)
   * @returns {object} 包含 style 和 className 的对象
   */
  const eventPropGetter = useCallback((event: MyCalendarEvent) => { // Use MyCalendarEvent directly
    const style: React.CSSProperties = {}; 

    // 1. 设置背景颜色
    const colorSource = String(event.id || event.title || `event-${Math.random()}`);
    const hue = stringToHue(colorSource);
    // 根据完成状态调整饱和度和亮度/透明度
    const saturation = event.completed ? '40%' : '70%';
    const lightness = event.completed ? '92%' : '88%';
    const opacity = event.completed ? 0.7 : 1;

    const backgroundColor = `hsl(${hue}, ${saturation}, ${lightness})`;
    const textColor = event.completed ? 'gray' : '#333'; 
    const borderColor = `hsl(${hue}, ${event.completed ? '30%': '60%'}, ${event.completed? '85%' : '80%'})`;

    style.backgroundColor = backgroundColor;
    style.color = textColor;
    style.borderRadius = '4px';
    style.border = `1px solid ${borderColor}`;
    style.opacity = opacity; // 应用透明度

    // 2. 设置字体大小
    style.fontSize = '15px';

    return {
      style: style,
    };
  }, []); 


  /**
   * 处理在日历上选择时间段的操作
   * @param {SlotInfo} slotInfo - 用户选中的时间段信息
   */
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setSelectedSlot(slotInfo);
    setSelectedEvent(null);
    setShowCreateModal(true);
  }, []);

  /**
   * 处理点击现有事件的操作
   * @param {MyCalendarEvent} event - 被点击的事件 (Use specific type)
   */
  const handleEventClick = useCallback((event: MyCalendarEvent) => {
    // Now using MyCalendarEvent directly, no need for complex checks/assertions
    setSelectedEvent(event); 
    setSelectedSlot(null);
    setShowCreateModal(true);
    console.log("Event clicked:", event);
  }, []);

  /**
   * 处理保存新事件的操作（由两个模态框共用）
   * @param {Omit<MyCalendarEvent, 'id'>} newEventData - 不包含ID的新事件数据
   */
  const handleSaveEventFromModal = async (eventData: Omit<MyCalendarEvent, 'id'> & { id?: string | number }) => {
    const toastId = toast.loading(eventData.id ? "正在更新事件..." : "正在创建事件...");
    console.log(eventData.id ? "Updating event:" : "Creating event:", eventData);

    // Prepare payload (adjust based on create/update)
    const payload: EventCreatePayload & { id?: string | number; source?: string } = {
      id: eventData.id, // Include ID if updating
      title: eventData.title || undefined,
      start_datetime: eventData.start ? eventData.start.toISOString() : undefined,
      end_datetime: eventData.end ? eventData.end.toISOString() : null, // Allow null
      is_all_day: eventData.allDay || false,
      description: eventData.description || undefined,
      location: eventData.location || undefined,
      source: eventData.id ? undefined : 'manual_ui' // 仅在新创建时添加 source
    };

    const apiUrl = eventData.id ? `http://localhost:8001/events/${eventData.id}` : 'http://localhost:8001/events';
    const apiMethod = eventData.id ? 'PUT' : 'POST'; // Use PUT for update, POST for create

    try {
      const response = await fetch(apiUrl, {
        method: apiMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `${eventData.id ? '更新' : '创建'}失败: ${response.statusText}`);
      }

      const savedEventRaw: RawBackendEvent = await response.json();

      // Convert backend response to frontend event format
      const savedCalendarEvent: MyCalendarEvent = {
        id: savedEventRaw.id,
        title: savedEventRaw.title || '无标题事件',
        start: new Date(savedEventRaw.start_datetime),
        end: savedEventRaw.end_datetime ? new Date(savedEventRaw.end_datetime) : new Date(new Date(savedEventRaw.start_datetime).getTime() + 60*60*1000),
        allDay: savedEventRaw.is_all_day || false,
        completed: savedEventRaw.completed || false,
        description: savedEventRaw.description,
        location: savedEventRaw.location,
        created_at: savedEventRaw.created_at ? new Date(savedEventRaw.created_at) : undefined,
        updated_at: savedEventRaw.updated_at ? new Date(savedEventRaw.updated_at) : undefined,
      };

      // Update the events state
      if (eventData.id) {
        // Update existing event
        setEvents(prevEvents => prevEvents.map(ev => ev.id === savedCalendarEvent.id ? savedCalendarEvent : ev));
      } else {
        // Add new event
        setEvents(prevEvents => [...prevEvents, savedCalendarEvent]);
      }

      setShowCreateModal(false); // Close modal
      toast.success(`事件已${eventData.id ? '更新' : '创建'}！`, { id: toastId });

    } catch (error) {
      console.error(`Error ${eventData.id ? 'updating' : 'creating'} event:`, error);
      toast.error(`保存事件出错: ${error instanceof Error ? error.message : '未知错误'}`, { id: toastId });
    }
  };

  /**
   * 关闭由日历格子选择触发的创建模态框
   */
  const handleCloseModal = () => {
    setShowCreateModal(false);
    setSelectedSlot(null); // Clear selected slot when closing
    setSelectedEvent(null); // Clear selected event when closing
  };

  /**
   * 处理自然语言输入并尝试解析和创建事件
   */
  const handleNaturalLanguageSubmit = useCallback(async () => {
    if (!naturalInput.trim()) { toast.error('请输入事件描述.'); return; }
    setIsParsing(true);
    const toastId = toast.loading('正在解析文本并创建事件...', { id: 'parsing-toast' }); // 更新初始提示
    try {
        const parseResponse = await fetch('http://localhost:8001/events/parse-natural-language', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: naturalInput }),
        });
        if (!parseResponse.ok) {
             const errorData = await parseResponse.json().catch(() => ({ detail: `解析 API 请求失败: ${parseResponse.statusText} - ${parseResponse.status}` }));
             const detail = (errorData as { detail?: string }).detail || `解析 API 请求失败: ${parseResponse.statusText}`;
             if (parseResponse.status === 409) { throw new Error("LLM 未配置，请在设置中配置。"); }
             throw new Error(detail);
        }
        // 确保 ParsedEventData 接口定义与后端返回一致，特别是 is_all_day, description, location
        interface ExtendedParsedEventData extends ParsedEventData {
            is_all_day?: boolean;
            description?: string;
            location?: string;
        }
        const parsedData: ExtendedParsedEventData = await parseResponse.json();

        if (!parsedData.start_datetime) {
            toast.error('无法从文本中解析出有效的日期和时间。', { id: toastId });
            setIsParsing(false);
            return;
        }

        // 直接使用解析的数据创建事件 POST 请求的 payload
        const payload: EventCreatePayload = {
            title: parsedData.title || '未命名事件',
            start_datetime: parsedData.start_datetime, // 已经是字符串
            end_datetime: parsedData.end_datetime,     // 已经是字符串或null
            is_all_day: parsedData.is_all_day,       // 从解析结果获取
            description: parsedData.description || naturalInput, // 优先使用解析的描述，否则用原始输入
            location: parsedData.location,           // <--- 使用从LLM解析的地点
            source: 'llm_direct_create'             // 标记来源为LLM直接创建
        };
        
        console.log("[NLP Submit] Payload for creating event:", payload);

        const createResponse = await fetch('http://localhost:8001/events', {
             method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });

        if (!createResponse.ok) {
             const errorData = await createResponse.json().catch(() => ({ detail: `创建事件 API 请求失败: ${createResponse.statusText} - ${createResponse.status}` }));
             const detail = (errorData as { detail?: string }).detail || `创建事件 API 请求失败: ${createResponse.statusText}`;
             throw new Error(detail);
        }

        const createdEventRaw: RawBackendEvent = await createResponse.json();

        // 将后端返回的事件转换为前端格式并添加到日历
        const newCalendarEvent: MyCalendarEvent = {
            id: createdEventRaw.id,
            title: createdEventRaw.title || '无标题事件',
            start: new Date(createdEventRaw.start_datetime),
            end: createdEventRaw.end_datetime ? new Date(createdEventRaw.end_datetime) : new Date(new Date(createdEventRaw.start_datetime).getTime() + 60*60*1000),
            allDay: createdEventRaw.is_all_day || false,
            completed: createdEventRaw.completed || false,
            description: createdEventRaw.description,
            location: createdEventRaw.location, // <--- 确保这里也从后端返回的数据中获取地点
            created_at: createdEventRaw.created_at ? new Date(createdEventRaw.created_at) : undefined,
            updated_at: createdEventRaw.updated_at ? new Date(createdEventRaw.updated_at) : undefined,
        };

        setEvents(prevEvents => [...prevEvents, newCalendarEvent]);
        
        // 清空智能输入框并关闭智能创建的浮动模态框
        setNaturalInput('');
        setShowSmartCreateModal(false);
        
        toast.success('智能创建成功！', { id: toastId }); // 改回成功提示

    } catch (error) {
        console.error("Error in natural language submission flow:", error);
        toast.error(`处理出错: ${error instanceof Error ? error.message : '未知错误'}`, { id: toastId });
    } finally {
      setIsParsing(false);
    }
  }, [naturalInput, setEvents, setNaturalInput, setShowSmartCreateModal]);

  // --- Add Navigation Handler ---
  /**
   * Handles calendar navigation actions (Previous, Next, Today, Date Change)
   * @param {Date} newDate - The new date resulting from the navigation.
   * @param {View} view - The current view of the calendar.
   * @param {string} action - The navigation action ('PREV', 'NEXT', 'TODAY', 'DATE').
   */
  const handleNavigate = useCallback((newDate: Date, view: View, action: string) => {
    console.log(`[Navigate] Action: ${action}, New Date: ${newDate.toLocaleDateString()}, View: ${view}`);
    // Update the controlled date state.
    // React Big Calendar's default toolbar actions already provide the correct newDate.
    setCurrentDate(newDate);
  }, [setCurrentDate]); // Dependency on setCurrentDate setter

  /**
   * Callback function for when the view changes
   * Update the controlled view state
   */
  const handleViewChange = useCallback((view: View) => {
    console.log("Calendar view *requested* to change to:", view);
    setCurrentView(view); // Update our state
    // It's good practice to also reset the date focus when changing views, 
    // though onNavigate might handle this implicitly depending on library version.
    // setCurrentDate(new Date()); // Optional: Reset date focus to today when view changes
  }, []);

  // --- 处理事件拖放的回调函数 ---
  const handleEventDrop = useCallback(async (args: { event: MyCalendarEvent, start: string | Date, end: string | Date, isAllDay?: boolean | undefined }) => { 
    // Use MyCalendarEvent for event type
    const { event, start, end } = args;
    const startDate = typeof start === 'string' ? new Date(start) : start;
    const endDate = typeof end === 'string' ? new Date(end) : end;

    // event is already MyCalendarEvent, no need for assertion
    const typedEvent = event;

    console.log(`Event dropped in ${currentView} view:`, typedEvent.title, 'New start date:', startDate, 'New end date:', endDate);

    if (!typedEvent.id) {
      toast.error('无法更新缺少 ID 的事件。');
      return;
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      toast.error('无效的日期时间。');
      return;
    }

    // --- 新增：根据视图类型执行不同操作 ---
    if (currentView === Views.MONTH) {
        // 月视图拖放：只更新日期，然后打开模态框让用户确认/修改时间

        // 1. 保留原始时间，只更新日期
        // const originalStartTime = typedEvent.start.getHours() * 3600000 + typedEvent.start.getMinutes() * 60000 + typedEvent.start.getSeconds() * 1000 + typedEvent.start.getMilliseconds();
        // const originalEndTime = typedEvent.end.getHours() * 3600000 + typedEvent.end.getMinutes() * 60000 + typedEvent.end.getSeconds() * 1000 + typedEvent.end.getMilliseconds();

        // 计算新的开始时间（新日期 + 原始时间）
        const newStartDateWithOriginalTime = new Date(startDate); // startDate 已经包含了新的日期，时间部分可能不准 (e.g., 00:00:00)
        newStartDateWithOriginalTime.setHours(typedEvent.start.getHours(), typedEvent.start.getMinutes(), typedEvent.start.getSeconds(), typedEvent.start.getMilliseconds());

        // 计算新的结束时间 (基于新的开始时间和原始时长)
        const duration = typedEvent.end.getTime() - typedEvent.start.getTime();
        // let newEndDateWithOriginalTime = new Date(newStartDateWithOriginalTime.getTime() + duration);

        // 特殊处理：如果拖放导致日期变化很大，结束时间可能也需要调整日期
        // （简单处理：如果结束日期和开始日期在同一天，用新日期+原始结束时间；否则用新开始时间+时长）
        let finalEndDate = new Date(newStartDateWithOriginalTime.getTime() + duration); // Default to using duration
        if (typedEvent.end.getDate() === typedEvent.start.getDate() && !typedEvent.allDay) {
          // 如果原始事件在同一天且不是全天，尝试保留结束时间的小时分钟
            const newEndDateCandidate = new Date(startDate); // 用拖放目标日期
            newEndDateCandidate.setHours(typedEvent.end.getHours(), typedEvent.end.getMinutes(), typedEvent.end.getSeconds(), typedEvent.end.getMilliseconds());
            // 如果计算出的结束时间早于开始时间（例如，原始是下午拖到了早上），则使用时长
            if (newEndDateCandidate >= newStartDateWithOriginalTime) {
               finalEndDate = newEndDateCandidate;
            }
        } else if (typedEvent.allDay) {
           // If original was all day, keep it all day on the new date
           finalEndDate = new Date(newStartDateWithOriginalTime);
           finalEndDate.setHours(23, 59, 59, 999); // End of the new day
        }

        // 确定拖放后是否为全天事件 (如果原始是全天，保持全天)
        const isDroppedAsAllDay = typedEvent.allDay === true; // Keep original allDay status for month view drop


        // 2. 准备要在模态框中显示的事件数据
        const eventToEdit: MyCalendarEvent = {
          ...typedEvent, // 复制原始事件的其他属性 (title, description, etc.)
          start: isDroppedAsAllDay ? new Date(startDate.setHours(0, 0, 0, 0)) : newStartDateWithOriginalTime,
          end: isDroppedAsAllDay ? new Date(startDate.setHours(23, 59, 59, 999)) : finalEndDate,
          allDay: isDroppedAsAllDay, // 使用原始的 allDay 状态
        };

        // 3. 设置状态以打开编辑模态框
        setSelectedEvent(eventToEdit);
        setSelectedSlot(null); // 清除可能存在的 slot 选择
        setShowCreateModal(true);

        // 4. 提示用户
        toast('日期已更新，请在弹窗中确认或修改时间。', { icon: '🗓️' });

        // 注意：此处不直接调用 setEvents 或 fetch PUT

    } else {
        // 周/日/议程视图拖放：直接更新并保存 (保持原有逻辑)
        const toastId = toast.loading('正在更新事件时间...'); // Start loading toast here

        const eventId = typedEvent.id;
        // 修正：对于非月视图拖放，我们需要使用 args 中的 isAllDay
        const isAllDay = args.isAllDay === true || (endDate.getTime() - startDate.getTime() >= 24 * 60 * 60 * 1000);

        // 如果在周/日视图中拖放到全天区域，确保时间正确
        const finalStartDate = isAllDay ? new Date(startDate.setHours(0, 0, 0, 0)) : startDate;
        // For non-all-day events dropped in week/day view, the 'end' from args should be correct.
        // For all-day events, set end to end of day.
        const finalEndDate = isAllDay ? new Date(startDate.setHours(23, 59, 59, 999)) : endDate;


        const updatedEventData = {
          start_datetime: finalStartDate.toISOString(),
          end_datetime: finalEndDate.toISOString(),
          is_all_day: isAllDay,
        };

        try {
          const response = await fetch(`http://localhost:8001/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedEventData),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: '无法解析错误响应' }));
            // Use toastId here
            throw new Error(errorData.error || `更新事件失败: ${response.statusText}`);
          }

          const updatedEventFromServer: RawBackendEvent = await response.json();
          console.log('事件更新成功 (非月视图):', updatedEventFromServer);

          // 更新前端状态
          setEvents(prevEvents =>
            prevEvents.map(prevEvent =>
              prevEvent.id === eventId
                ? { ...prevEvent, start: finalStartDate, end: finalEndDate, allDay: isAllDay }
                : prevEvent
            )
          );
          toast.success('事件时间已更新！', { id: toastId }); // Use toastId here

        } catch (error) {
          console.error('更新事件时间时出错 (非月视图):', error);
          // Use toastId here
          toast.error(`更新事件时间出错: ${error instanceof Error ? error.message : '未知错误'}`, { id: toastId });
          // 可以在这里考虑是否需要回滚前端状态，但通常保留失败前的状态并显示错误
        }
    }
  }, [setEvents, currentView, setSelectedEvent, setShowCreateModal]); 

  // --- 新增：处理事件调整大小的回调函数 ---
  const handleEventResize = useCallback(async (args: { event: MyCalendarEvent, start: string | Date, end: string | Date }) => {
    // Use MyCalendarEvent for event type
    const { event, start, end } = args;
    const startDate = typeof start === 'string' ? new Date(start) : start;
    const endDate = typeof end === 'string' ? new Date(end) : end;

    // event is already MyCalendarEvent, no need for assertion
    const typedEvent = event;

    console.log('Event resized:', typedEvent.title, 'New start:', startDate, 'New end:', endDate);
    const toastId = toast.loading('正在更新事件时间...');

    if (!typedEvent.id) {
      toast.error('无法更新缺少 ID 的事件。', { id: toastId });
      return;
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      toast.error('无效的日期时间。', { id: toastId });
      return;
    }

    // 确保结束时间不早于开始时间 (调整大小可能导致)
    if (endDate < startDate) {
      toast.error('结束时间不能早于开始时间。', { id: toastId });
      // 可以在这里选择不更新状态，或者将结束时间强制设为开始时间
      return; 
    }

    const eventId = typedEvent.id;
    const updatedEventData = {
      start_datetime: startDate.toISOString(),
      end_datetime: endDate.toISOString(),
      // is_all_day: false, // 通常调整大小意味着不是全天事件，可以考虑强制更新，但也可能调整全天事件使其跨越多天
      is_all_day: typedEvent.allDay ?? false, // 保持原始的 allDay 状态可能更安全
    };

    try {
      const response = await fetch(`http://localhost:8001/events/${eventId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedEventData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '无法解析错误响应' }));
        // 断言 errorData 类型
        throw new Error((errorData as { error?: string }).error || `更新事件失败: ${response.statusText}`);
      }

      const updatedEventFromServer: RawBackendEvent = await response.json();
      console.log('事件时间更新成功:', updatedEventFromServer);

      // 更新前端状态
      setEvents(prevEvents =>
        prevEvents.map(prevEvent =>
          prevEvent.id === eventId
            ? { ...prevEvent, start: startDate, end: endDate, allDay: updatedEventData.is_all_day } // 更新 start, end, 和 allDay 状态
            : prevEvent
        )
      );
      toast.success('事件时间已更新！', { id: toastId });

    } catch (error) {
      console.error('更新事件时间时出错:', error);
      toast.error(`更新事件时间出错: ${error instanceof Error ? error.message : '未知错误'}`, { id: toastId });
    }
  }, [setEvents]);

  /**
   * 修改：处理文件选择，直接调用上传函数
   * @param {React.ChangeEvent<HTMLInputElement>} e - 文件输入变化事件
   */
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 重置文件输入值，允许用户再次选择相同的文件
    const target = e.target;
    target.value = ''; 

    if (!file) {
      return;
    }

    console.log(`File selected: ${file.name}, type: ${file.type}`);

    // 基本的文件类型前端检查 (更严格的检查在后端)
    if (!file.type.startsWith('text/plain') && 
        !file.type.startsWith('application/vnd.openxmlformats-officedocument.wordprocessingml.document') &&
        !file.name.toLowerCase().endsWith('.docx')) {
        toast.error('请选择一个纯文本 (.txt) 或 Word (.docx) 文件。');
        return;
    }

    // 调用新的上传处理函数
    uploadAndImportFile(file);
  };

  /**
   * 新增：上传文件并触发导入
   * @param {File} file - 用户选择的文件
   */
  const uploadAndImportFile = async (file: File) => {
    const toastId = toast.loading('正在上传并导入事件...');
    const formData = new FormData();
    formData.append('documentFile', file); // 后端 multer 中间件期望的字段名

    try {
      const response = await fetch('http://localhost:8001/events/import', {
        method: 'POST',
        // 不需要设置 Content-Type，浏览器会为 FormData 自动设置
        body: formData, 
      });

      const result = await response.json();

      if (!response.ok) {
        // 尝试从 result 中获取更具体的错误信息
        throw new Error(result.error || `导入失败 (${response.status})`);
      }
      
      // 根据后端返回的 count 显示不同消息
      if (result.count > 0) {
          toast.success(result.message || `成功导入 ${result.count} 个事件!`, { id: toastId });
      } else {
          // 如果 count 为 0 但请求成功，说明可能没找到符合格式的事件
          toast(`🤔 ${result.message || '未找到符合格式的事件。'}`, { id: toastId, duration: 4000 });
      }
      
      // 刷新事件列表
      await fetchEvents(); 

    } catch (error: unknown) {
      console.error('导入文档时出错:', error);
      toast.error(`导入失败: ${error instanceof Error ? error.message : String(error)}`, { id: toastId });
    }
  };

  // --- 用于刷新的函数 (fetchEvents) ---
  const fetchEvents = useCallback(async () => {
    // setIsLoadingData(true); // 可选：添加加载状态
    try {
      const eventsRes = await fetch('http://localhost:8001/events');
      if (eventsRes.ok) {
        const rawEvents: RawBackendEvent[] = await eventsRes.json();
        const calendarEvents: MyCalendarEvent[] = rawEvents
          .map(event => ({
            id: event.id, 
            title: event.title || '无标题事件',
            start: event.start_datetime ? new Date(event.start_datetime) : null,
            end: event.end_datetime ? new Date(event.end_datetime) : null,
            allDay: event.is_all_day || false,
            completed: event.completed || false, 
            description: event.description,
            location: event.location,
            created_at: event.created_at ? new Date(event.created_at) : undefined,
            updated_at: event.updated_at ? new Date(event.updated_at) : undefined,
          }))
          .filter(event => 
             event.id != null && 
             event.start instanceof Date && !isNaN(event.start.getTime()) &&
             event.end instanceof Date && !isNaN(event.end.getTime()) &&
             event.end >= event.start
          )
          .map(event => event as MyCalendarEvent & { id: string | number; start: Date; end: Date });

        setEvents(calendarEvents);
        console.log("Events refreshed.");
      } else {
        toast.error(`刷新事件失败: ${eventsRes.statusText}`);
      }
    } catch (error: unknown) {
      console.error("刷新事件时出错:", error);
      toast.error(`刷新事件出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // setIsLoadingData(false); // 可选：结束加载状态
    }
  }, [setEvents]); // 依赖 setEvents

  // --- Effect to fetch initial data on component mount --- 
  useEffect(() => {
    // 移除原始的 fetchEvents 逻辑, 改为调用 fetchEvents 函数
    fetchEvents();
    // REMOVED fetching settings logic
    // ... fetch events logic moved to fetchEvents ...
  }, [fetchEvents]); // 添加 fetchEvents 作为依赖

  // 切换设置面板显示
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  /**
   * 修改：处理删除事件 - 只打开确认模态框
   * @param {string | number} eventId - 要删除的事件 ID
   */
  const handleDeleteEvent = useCallback((eventId: string | number) => {
    // 查找事件标题用于确认信息
    const eventToDelete = events.find(e => e.id === eventId);
    if (eventToDelete) {
      setEventToDeleteInfo({ id: eventId, title: eventToDelete.title || '该事件' });
      setShowDeleteConfirmModal(true); // 打开模态框，而不是直接 window.confirm
    } else {
       console.error(`[handleDeleteEvent] Event with ID ${eventId} not found in state.`);
       toast.error('找不到要删除的事件信息。');
    }
  }, [events]); // 依赖 events 状态来查找标题

  /**
   * 新增：执行实际的删除操作 (由模态框调用)
   */
  const confirmDeleteEvent = useCallback(async () => {
    const eventId = eventToDeleteInfo.id;
    if (eventId === null) return; // 防御性检查

    setShowDeleteConfirmModal(false); // 先关闭模态框
    const toastId = toast.loading('正在删除事件...');

    try {
      const response = await fetch(`http://localhost:8001/events/${eventId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let errorMsg = `删除失败: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) { /* ignore */ }
        throw new Error(errorMsg);
      }

      setEvents(prevEvents => prevEvents.filter(event => event.id !== eventId));
      toast.success('事件已成功删除！', { id: toastId });
      console.log(`Event with ID ${eventId} deleted successfully.`);
      setEventToDeleteInfo({ id: null, title: null }); // 清空待删除信息

    } catch (error) {
      console.error("删除事件时出错:", error);
      toast.error(`删除事件出错: ${error instanceof Error ? error.message : '未知错误'}`, { id: toastId });
      setEventToDeleteInfo({ id: null, title: null }); // 清空待删除信息
    }
  }, [eventToDeleteInfo, setEvents]); // 依赖 eventToDeleteInfo 和 setEvents

  /**
   * 新增：处理切换事件完成状态
   * @param {string | number} eventId - 要切换状态的事件 ID
   * @param {boolean} currentState - 事件当前的完成状态
   */
  const handleToggleComplete = useCallback(async (eventId: string | number, currentState: boolean) => {
    const newCompletedStatus = !currentState;
    console.log(`Toggling event ${eventId} completed status to ${newCompletedStatus}`);

    // 乐观更新 UI
    const originalEvents = events;
    setEvents(prevEvents => 
      prevEvents.map(event => 
        event.id === eventId ? { ...event, completed: newCompletedStatus } : event
      )
    );
    
    // 发送请求到后端
    const toastId = toast.loading('正在更新状态...');
    try {
      const response = await fetch(`http://localhost:8001/events/${eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // 只发送 completed 字段
        body: JSON.stringify({ completed: newCompletedStatus }), 
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as {error?: string}).error || `更新失败: ${response.statusText}`);
      }

      // 后端确认成功，无需额外操作，因为 UI 已乐观更新
      const updatedEventFromServer: RawBackendEvent = await response.json();
      // 可以在这里做一次最终确认，确保前端状态与服务器一致
      setEvents(prevEvents => 
        prevEvents.map(event => 
          event.id === eventId ? { ...event, completed: updatedEventFromServer.completed } : event
        )
      );
      toast.success('状态已更新!', { id: toastId });

    } catch (error: unknown) {
      console.error('更新事件完成状态时出错:', error);
      toast.error(`更新失败: ${error instanceof Error ? error.message : String(error)}`, { id: toastId });
      // 回滚 UI 到原始状态
      setEvents(originalEvents);
    }
  }, [events, setEvents]);

  // 渲染页面组件
  return (
    <div className="min-h-screen flex flex-col">
      <Toaster position="top-center" />
      
      {/* 顶部导航栏和设置按钮 - 高度调整 */}
      <div className="bg-white shadow-sm flex-shrink-0">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          {/* 将 h-12 改为 h-9 (3rem -> 2.25rem / 36px) */}
          <div className="flex justify-between h-9 items-center">
            {/* 调整标题部分 */}
            <div className="flex items-center gap-1">
              {/* 调整图标大小 */}
              <CalendarTodayIcon className="text-gray-700" sx={{ fontSize: '1.125rem' }} />
              {/* 调整字体大小 */}
              <span className="text-base font-semibold text-gray-900 whitespace-nowrap">潮汐志</span>
            </div>
            {/* 调整按钮部分 */}
            <div className="flex items-center space-x-1.5">
              {/* 调整按钮的 padding 和字体大小 */}
              <button
                  onClick={() => setShowSmartCreateModal(true)}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
              >
                  <NoteAddIcon sx={{ fontSize: '1rem' }} />
                  <span>智能创建</span>
              </button>
              <button
                  onClick={() => document.getElementById('doc-import-input')?.click()}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md shadow-sm text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
              >
                  <FileUploadIcon sx={{ fontSize: '1rem' }} />
                  <span>导入文档</span>
              </button>
              <input 
                type="file" 
                accept=".txt,.docx"
                id="doc-import-input" 
                style={{ display: 'none' }} 
                onChange={handleFileSelected}
              />
              <button 
                onClick={toggleSettings} 
                className="flex items-center space-x-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md shadow-sm text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
              >
                 <SettingsIcon sx={{ fontSize: '1rem' }} />
                 <span>设置</span>
              </button>
              <a
                href="http://localhost:3000/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center px-2.5 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-md shadow-sm text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-1 no-underline"
              >
                灵枢笔记
              </a>
            </div>
          </div>
        </div>
      </div>
      
      {/* 主内容区域 */}
      <main className="flex-grow container mx-auto p-2 flex flex-col">
        {/* 日历容器 - 移除内边距，高度设为 h-full */}
        {isLoadingData ? (
          <div className="text-center py-10">加载数据中...</div>
        ) : (
          <> 
            {/* Wrap console.log in a self-invoking function */} 
            {(() => { 
              console.log("[Render] Rendering DnDCalendar, events count:", events.length, "Events:", events, "Current Date:", currentDate);
              return null; // Return null to satisfy ReactNode type
            })()}
            <div className="bg-white rounded-lg shadow h-[calc(100vh-60px)]">
              <DnDCalendar
                localizer={localizer}
                events={events}
                messages={messages}
                formats={calendarFormats}
                culture='zh-CN'
                startAccessor={(event: RbcEvent) => (event as MyCalendarEvent).start}
                endAccessor={(event: RbcEvent) => (event as MyCalendarEvent).end}
                style={{ height: '100%' }}
                selectable={true}
                onSelectSlot={handleSelectSlot}
                onSelectEvent={handleEventClick as (event: RbcEvent) => void}
                onEventDrop={handleEventDrop as (args: { event: RbcEvent, start: string | Date, end: string | Date, isAllDay?: boolean | undefined }) => void}
                onEventResize={handleEventResize as (args: { event: RbcEvent, start: string | Date, end: string | Date }) => void}
                resizable
                views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
                view={currentView}
                onView={handleViewChange}
                // --- Add Controlled Date Props ---
                date={currentDate}         // <-- Control the displayed date
                onNavigate={handleNavigate} // <-- Handle navigation actions
                // ----------------------------------
                eventPropGetter={eventPropGetter as (event: RbcEvent) => { style: React.CSSProperties }}
                components={{
                  event: (props) => (
                    <CustomEventComponent 
                      {...props} 
                      event={props.event as MyCalendarEvent} // 断言类型
                      onToggleComplete={handleToggleComplete} 
                      onDelete={handleDeleteEvent}
                      // 将 nextUpcomingEventId 直接传递给子组件
                      nextUpcomingEventId={nextUpcomingEventId}
                    />
                  )
                }}
              />
            </div>
          </>
        )}
      </main>
      
      {/* 创建事件模态框 */}
      {showCreateModal && (
        <CreateEventModal
          isOpen={showCreateModal}
          onClose={handleCloseModal}
          slotInfo={selectedSlot}
          eventData={selectedEvent}
          onSave={handleSaveEventFromModal}
        />
      )}
      
      {/* 智能创建模态框 (使用 MUI Modal) */}
      <Modal
        open={showSmartCreateModal}
        onClose={() => setShowSmartCreateModal(false)}
        aria-labelledby="smart-create-modal-title"
      >
        <Box sx={smartCreateModalStyle}>
          <h3 id="smart-create-modal-title" className="text-lg leading-6 font-medium text-gray-900 text-center mb-4">
             智能创建事件
          </h3>
          <div className="space-y-3">
            <label htmlFor="natural-input-modal" className="sr-only">快速创建事件:</label>
            <input
              type="text"
              id="natural-input-modal"
              value={naturalInput}
              onChange={(e) => setNaturalInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="例如：明天下午3点和张三开会"
              disabled={isParsing}
              onKeyDown={(e) => e.key === 'Enter' && !isParsing && handleNaturalLanguageSubmit()}
            />
            <button
              onClick={handleNaturalLanguageSubmit}
              disabled={isParsing || !naturalInput.trim()}
              className="w-full px-4 py-2 bg-blue-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isParsing ? '解析中...' : '创建'}
            </button>
          </div>
          <div className="mt-4 text-center">
            <button
              id="close-smart-modal"
              onClick={() => setShowSmartCreateModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-base font-medium shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              关闭
            </button>
        </div>
        </Box>
      </Modal>
      
      {/* 新增：删除确认模态框 */}
      <Modal
        open={showDeleteConfirmModal}
        onClose={() => {
           setShowDeleteConfirmModal(false);
           setEventToDeleteInfo({ id: null, title: null }); // 关闭时也清空信息
        }}
        aria-labelledby="delete-confirm-modal-title"
      >
        <Box sx={smartCreateModalStyle}> {/* 复用智能创建的样式 */} 
          <h3 id="delete-confirm-modal-title" className="text-lg leading-6 font-medium text-gray-900 text-center mb-4">
            确认删除
          </h3>
          <p className="text-sm text-gray-700 text-center mb-6">
            确定要删除事件 "<span className="font-semibold">{eventToDeleteInfo.title}</span>" 吗？<br/>此操作无法撤销。
          </p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => {
                setShowDeleteConfirmModal(false);
                setEventToDeleteInfo({ id: null, title: null });
              }}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-base font-medium shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              取消
            </button>
            <button
              onClick={confirmDeleteEvent} 
              className="px-4 py-2 bg-red-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              确认删除
            </button>
        </div>
        </Box>
      </Modal>

      {/* 设置面板组件 */}
      {showSettings && (
        <SettingsPanel 
          open={showSettings} 
          onClose={toggleSettings} 
          // Pass the fetchEvents function for refreshing
          refreshEvents={fetchEvents} 
        />
      )}
    </div>
  );
}