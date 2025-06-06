/**
 * @fileoverview Manages schedule creation, storage, and notification logic.
 * Depends on notification.js for displaying modal notifications.
 */

/**
 * 存储所有日程的数组。
 * 每个日程对象结构:
 * {
 *   id: number, // 日程的唯一ID (例如：时间戳)
 *   title: string, // 日程标题
 *   startTime: Date, // 日程开始时间 (Date 对象)
 *   endTime: Date, // 日程结束时间 (Date 对象)
 *   allDay: boolean, // 是否为全天日程 (false 表示这是一个定时日程)
 *   reminderOffsetMinutes: number, // 提前多少分钟通知
 *   notified: boolean // 此日程是否已经发送过通知
 * }
 * @type {Array<Object>}
 */
let schedules = [];

/**
 * 从输入创建并保存一个新的日程。
 * 预期HTML中存在ID为 'scheduleTitle', 'scheduleTime', 'reminderOffset' 的输入元素。
 * @param {string} title - 日程的标题。
 *   (此参数是为了演示，实际调用时通常会从DOM元素获取)
 * @param {string} startTimeString - 日程开始时间的字符串 (例如 "YYYY-MM-DDTHH:mm")。
 *   (此参数是为了演示，实际调用时通常会从DOM元素获取)
 * @param {string|number} reminderOffsetInput - 用户输入的提前通知分钟数。
 *   (此参数是为了演示，实际调用时通常会从DOM元素获取)
 * @returns {Object|null} 返回创建的日程对象，如果输入无效则返回null。
 */
function saveSchedule(title, startTimeString, reminderOffsetInput) {
  if (!title || !startTimeString) {
    console.error('日程标题和开始时间不能为空！');
    // 在实际应用中，您可能会调用 showNotificationModal 来显示错误
    // showNotificationModal('错误', '日程标题和开始时间不能为空！');
    return null;
  }

  // 原始解析尝试
  let startTime = new Date(startTimeString);

  // 验证解析后的日期
  if (isNaN(startTime.getTime())) {
    console.error('无效的日期时间格式！原始输入: ', startTimeString);
    // showNotificationModal('错误', '无效的日期时间格式！');
    return null;
  }

  // 如果输入字符串仅为日期 (例如 "YYYY-MM-DD") 而没有明确的时间部分，
  // 则将时间设置为 00:00:00 (午夜)，以满足 "0-1点" (即0点开始) 的默认要求。
  if (typeof startTimeString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startTimeString.trim())) {
    startTime.setHours(0, 0, 0, 0);
  }
  // 如果 startTimeString 包含了时间部分 (例如 "YYYY-MM-DDTHH:MM")，
  // startTime 将会使用该解析出来的时间。

  // 计算结束时间，默认为开始时间后1小时
  let endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 加上1小时的毫秒数

  let reminderOffsetMinutes = parseInt(reminderOffsetInput, 10);
  if (isNaN(reminderOffsetMinutes) || reminderOffsetMinutes < 0) {
    reminderOffsetMinutes = 30; // 默认提前30分钟
  }

  const newSchedule = {
    id: Date.now(), // 使用时间戳作为简单唯一ID
    title: title,
    startTime: startTime,
    endTime: endTime, // 结束时间
    allDay: false, // 显式设置这不是一个全天日程
    reminderOffsetMinutes: reminderOffsetMinutes,
    notified: false // 新日程默认为未通知状态
  };

  schedules.push(newSchedule);
  console.log('日程已保存 (含allDay=false):', newSchedule);
  // 可以选择在此处显示一个保存成功的提示
  // showNotificationModal('成功', `日程 "${title}" 已保存。`);
  return newSchedule;
}

/**
 * 检查日程列表，并在到达提醒时间时显示通知。
 * 此函数会定期被调用。
 */
function checkSchedulesForNotifications() {
  const now = new Date();
  // console.log('检查日程通知时间:', now); // 用于调试

  schedules.forEach(schedule => {
    // 如果日程已过时或已通知，则跳过
    if (schedule.notified || schedule.startTime < now) {
      // 如果日程已过时但未通知，可以考虑在这里标记为已通知，避免未来重复检查
      // if (!schedule.notified && schedule.startTime < now) {
      //   schedule.notified = true;
      // }
      return;
    }

    // 计算实际的提醒时间
    const reminderTime = new Date(schedule.startTime.getTime() - schedule.reminderOffsetMinutes * 60 * 1000);

    // console.log(`日程: ${schedule.title}, 计划开始: ${schedule.startTime}, 提醒时间: ${reminderTime}`); // 用于调试

    if (reminderTime <= now) {
      // 确保 showNotificationModal 函数已定义且可用
      if (typeof showNotificationModal === 'function') {
        showNotificationModal(
          `日程提醒: ${schedule.title}`,
          `您的日程 "${schedule.title}" 将于 ${schedule.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 开始。`,
          () => {
            console.log(`日程 "${schedule.title}" 的通知已关闭。`);
          }
        );
        schedule.notified = true; // 标记为已通知，防止重复提醒
        console.log(`已触发日程 "${schedule.title}" 的通知。`);
      } else {
        console.error('showNotificationModal 函数未定义。请确保 notification.js 已正确加载并在本文件之前执行。');
        // 可以提供一个备用通知方案，例如浏览器原生 alert
        // alert(`日程提醒: ${schedule.title}\n您的日程 "${schedule.title}" 将于 ${schedule.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 开始。`);
        // schedule.notified = true;
      }
    }
  });
}

// 设置定时器，每分钟 (60000 毫秒) 检查一次日程通知
const notificationInterval = setInterval(checkSchedulesForNotifications, 60000);
console.log('日程通知检查已启动，每分钟检查一次。');

// 首次加载时也执行一次检查，以处理页面刚加载时就可能需要提醒的日程
// (确保此时 DOM 元素和依赖的函数都已加载完毕)
// 如果此脚本在 DOMContentLoaded 之后运行，可以直接调用
// 或者使用 window.onload 或 DOMContentLoaded 事件监听器
// setTimeout(checkSchedulesForNotifications, 1000); // 延迟1秒执行，给其他脚本加载留出时间

// ----- 示例用法 -----
// 以下代码为演示如何使用 saveSchedule。
// 在您的实际应用中，您会从HTML表单获取用户输入并调用 saveSchedule。

/*
// 模拟1分钟后有一个日程需要提醒
const একMinLater = new Date(Date.now() + 1 * 60 * 1000 + 5000); // 1分钟5秒后
saveSchedule(
    "测试1分钟后提醒",
    `${einMinLater.getFullYear()}-${String(einMinLater.getMonth() + 1).padStart(2, '0')}-${String(einMinLater.getDate()).padStart(2, '0')}T${String(einMinLater.getHours()).padStart(2, '0')}:${String(einMinLater.getMinutes()).padStart(2, '0')}`,
    0 // 提前0分钟，即准时提醒
);

// 模拟一个日程，使用默认的30分钟提前提醒 (假设当前时间是 10:00，日程是 10:35)
const in35Minutes = new Date(Date.now() + 35 * 60 * 1000);
saveSchedule(
    "默认30分钟提前提醒",
    `${in35Minutes.getFullYear()}-${String(in35Minutes.getMonth() + 1).padStart(2, '0')}-${String(in35Minutes.getDate()).padStart(2, '0')}T${String(in35Minutes.getHours()).padStart(2, '0')}:${String(in35Minutes.getMinutes()).padStart(2, '0')}`
    // reminderOffsetInput 参数未提供或为NaN时，saveSchedule内部会使用默认值30
);

// 模拟一个日程，自定义提前5分钟提醒
const in10Minutes = new Date(Date.now() + 10 * 60 * 1000);
saveSchedule(
    "自定义5分钟提前",
    `${in10Minutes.getFullYear()}-${String(in10Minutes.getMonth() + 1).padStart(2, '0')}-${String(in10Minutes.getDate()).padStart(2, '0')}T${String(in10Minutes.getHours()).padStart(2, '0')}:${String(in10Minutes.getMinutes()).padStart(2, '0')}`,
    5
);
*/

// 建议: 将日程数据持久化存储 (例如使用 localStorage 或后端API)
// 而不是仅仅存储在内存中的 `schedules` 数组，这样刷新页面后日程不会丢失。
// 例如，可以在 saveSchedule 时保存到 localStorage，并在脚本加载时从 localStorage 读取。

// function loadSchedulesFromLocalStorage() {
//   const storedSchedules = localStorage.getItem('schedules');
//   if (storedSchedules) {
//     schedules = JSON.parse(storedSchedules).map(s => ({
//       ...s,
//       startTime: new Date(s.startTime) // 确保 startTime 是 Date 对象
//     }));
//     console.log('已从LocalStorage加载日程:', schedules);
//   }
// }
// function saveSchedulesToLocalStorage() {
//   localStorage.setItem('schedules', JSON.stringify(schedules));
// }
// // 在脚本开始时加载
// loadSchedulesFromLocalStorage();
// // 在 saveSchedule 内部，当 schedules 数组更新后调用 saveSchedulesToLocalStorage();
// // 也可能需要在删除或修改日程时调用。

// 页面加载完成后立即检查一次
if (document.readyState === 'loading') {  // 仍在加载
    document.addEventListener('DOMContentLoaded', checkSchedulesForNotifications);
} else {  // `DOMContentLoaded` 已触发
    checkSchedulesForNotifications();
} 