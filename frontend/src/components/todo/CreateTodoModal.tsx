'use client';

import React, { useState, useEffect } from 'react';
import { Todo } from '../../types/todo';
import { todoService } from '../../services/todoService';
import { toast } from 'react-hot-toast';
import { format, parse } from 'date-fns';

interface CreateTodoModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editTodo?: Todo | null; // Keep this as editTodo to match usage in page.tsx
}

const CreateTodoModal: React.FC<CreateTodoModalProps> = ({
  open,
  onClose,
  onSuccess,
  editTodo,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editTodo) {
      setTitle(editTodo.title);
      setDescription(editTodo.description || '');
      setPriority(editTodo.priority);
      // Ensure we parse the date string correctly into a Date object
      setScheduledDate(editTodo.scheduled_date ? new Date(editTodo.scheduled_date) : null);
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setScheduledDate(null);
    }
  }, [editTodo, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('请输入标题');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title,
        description,
        priority,
        scheduled_date: scheduledDate ? scheduledDate.toISOString() : (editTodo ? null : undefined),
      };

      if (editTodo) {
        await todoService.updateTodo(editTodo.id, payload);
        toast.success('待办事项已更新');
      } else {
        // Create payload must not have null scheduled_date
        const createPayload = { ...payload, scheduled_date: payload.scheduled_date || undefined };
        await todoService.createTodo(createPayload);
        toast.success('待办事项已创建');
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('保存失败:', error);
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 overflow-y-auto h-full w-full z-50 flex items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

      {/* Modal */}
      <div className="relative mx-auto p-5 border border-gray-300 w-full max-w-lg shadow-lg rounded-md bg-white pointer-events-auto">
        <form onSubmit={handleSubmit}>
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            {editTodo ? '编辑待办事项' : '新建待办事项'}
          </h3>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="todo-title" className="block text-sm font-medium text-gray-700">标题:</label>
              <input
                type="text"
                id="todo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="待办事项标题"
                required
                autoFocus
              />
            </div>

            {/* Scheduled Time */}
            <div>
              <label htmlFor="todo-scheduled-date" className="block text-sm font-medium text-gray-700">计划时间:</label>
              <input
                type="datetime-local"
                id="todo-scheduled-date"
                value={scheduledDate ? format(scheduledDate, "yyyy-MM-dd'T'HH:mm") : ''}
                onChange={(e) => {
                  const newDate = e.target.value ? parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date()) : null;
                  setScheduledDate(newDate);
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">留空则为未安排时间</p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="todo-description" className="block text-sm font-medium text-gray-700">描述:</label>
              <textarea
                id="todo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="待办详情"
              />
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="todo-priority" className="block text-sm font-medium text-gray-700">优先级:</label>
              <select
                id="todo-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={loading || !title.trim()}
            >
              {loading ? '保存中...' : (editTodo ? '保存' : '创建')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTodoModal;
