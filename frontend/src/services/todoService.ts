import { getApiBaseUrl, authenticatedFetch } from '../config';
import { Todo, TodoStats, CreateTodoPayload, UpdateTodoPayload, ScheduleTodoPayload } from '../types/todo';

export const todoService = {
  async getTodos(): Promise<Todo[]> {
    const response = await authenticatedFetch(`${getApiBaseUrl()}/todos`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error('获取待办事项列表失败');
    }
    return response.json();
  },

  async createTodo(data: CreateTodoPayload): Promise<Todo> {
    const response = await authenticatedFetch(`${getApiBaseUrl()}/todos`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '创建待办事项失败' }));
      throw new Error(error.detail || '创建待办事项失败');
    }
    return response.json();
  },

  async updateTodo(id: string, data: UpdateTodoPayload): Promise<Todo> {
    const response = await authenticatedFetch(`${getApiBaseUrl()}/todos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '更新待办事项失败' }));
      throw new Error(error.detail || '更新待办事项失败');
    }
    return response.json();
  },

  async deleteTodo(id: string): Promise<void> {
    const response = await authenticatedFetch(`${getApiBaseUrl()}/todos/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: '删除待办事项失败' }));
      throw new Error(error.detail || '删除待办事项失败');
    }
  },

  async getTodoStats(): Promise<TodoStats> {
    const response = await authenticatedFetch(`${getApiBaseUrl()}/todos/stats`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error('获取待办统计失败');
    }
    return response.json();
  },

  async completeTodo(id: string): Promise<Todo> {
    return this.updateTodo(id, { status: 'completed' });
  },
};
