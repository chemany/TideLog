/**
 * 创建并显示一个简单的模态弹窗通知。
 * @param {string} title - 弹窗的标题。
 * @param {string} message - 要在弹窗中显示的消息内容。
 * @param {function} [onClose] - 可选的回调函数，当弹窗关闭时调用。
 */
function showNotificationModal(title, message, onClose) {
  // 防止重复创建弹窗
  if (document.getElementById('notificationModal')) {
    return;
  }

  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.id = 'notificationOverlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  overlay.style.zIndex = '999'; // 确保遮罩层在顶层

  // 创建弹窗容器
  const modal = document.createElement('div');
  modal.id = 'notificationModal';
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.backgroundColor = '#fff';
  modal.style.padding = '20px';
  modal.style.borderRadius = '8px';
  modal.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  modal.style.zIndex = '1000'; // 确保弹窗在遮罩层之上
  modal.style.minWidth = '300px';
  modal.style.maxWidth = '80%';

  // 创建弹窗标题
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = title;
  modalTitle.style.marginTop = '0';
  modalTitle.style.marginBottom = '15px';
  modalTitle.style.color = '#333';

  // 创建弹窗消息内容
  const modalMessage = document.createElement('p');
  modalMessage.textContent = message;
  modalMessage.style.marginBottom = '20px';
  modalMessage.style.color = '#555';

  // 创建关闭按钮
  const closeButton = document.createElement('button');
  closeButton.textContent = '关闭';
  closeButton.style.padding = '8px 15px';
  closeButton.style.border = 'none';
  closeButton.style.borderRadius = '4px';
  closeButton.style.backgroundColor = '#007bff';
  closeButton.style.color = 'white';
  closeButton.style.cursor = 'pointer';

  // 关闭按钮点击事件
  closeButton.onclick = function() {
    document.body.removeChild(overlay);
    document.body.removeChild(modal);
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  // 组装弹窗
  modal.appendChild(modalTitle);
  modal.appendChild(modalMessage);
  modal.appendChild(closeButton);

  // 将遮罩层和弹窗添加到body
  document.body.appendChild(overlay);
  document.body.appendChild(modal);
}

// 示例用法 (您可以注释掉或删除这部分)
// showNotificationModal('测试通知', '这是一个弹窗通知消息示例。');

// 如果您使用模块系统 (例如 ES6 Modules), 您可能需要导出这个函数:
// export { showNotificationModal }; 