'use client';

import React, { useState, useCallback } from 'react';
import { Todo } from '../../types/todo';
import { todoService } from '../../services/todoService';
import { toast } from 'react-hot-toast';
import {
  Box,
  CircularProgress,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  IconButton,
  Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { format, isValid, parseISO } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface TodoListProps {
  onEditTodo: (todo: Todo) => void;
  onRefreshNeeded: () => void;
}

const TodoList: React.FC<TodoListProps> = ({ onEditTodo, onRefreshNeeded }) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await todoService.getTodos();
      // Filter out scheduled todos as they appear on the calendar
      const unscheduledTodos = data.filter(t => !t.scheduled_date);

      // 客户端排序
      const sorted = unscheduledTodos.sort((a, b) => {
        // 完成的排在后面
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;

        // 按创建时间排序 (新创建的在前)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setTodos(sorted);
    } catch (error) {
      console.error('获取待办事项失败:', error);
      toast.error('获取待办事项失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const handleToggleComplete = async (todo: Todo) => {
    try {
      // 乐观更新
      setTodos(prev => prev.map(t =>
        t.id === todo.id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t
      ));

      const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
      await todoService.updateTodo(todo.id, { status: newStatus });
      toast.success(newStatus === 'completed' ? '已完成任务' : '已标记为未完成');
      onRefreshNeeded();
    } catch (error) {
      console.error('更新状态失败:', error);
      toast.error('更新失败');
      fetchTodos(); // 回滚
    }
  };

  const handleDelete = async (todo: Todo) => {
    if (!window.confirm(`确定要删除待办事项「${todo.title}」吗？`)) {
      return;
    }
    try {
      setTodos(prev => prev.filter(t => t.id !== todo.id)); // 乐观删除
      await todoService.deleteTodo(todo.id);
      toast.success('已删除');
      onRefreshNeeded();
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
      fetchTodos(); // 回滚
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '未安排';
    const date = parseISO(dateString);
    if (!isValid(date)) return '无效日期';
    return format(date, 'MM月dd日 EEE', { locale: zhCN });
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = parseISO(dateString);
    if (!isValid(date)) return '';
    // 如果是 00:00:00 可能是只设置了日期，不显示时间
    if (date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0) return '';
    return format(date, 'p', { locale: zhCN });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '无';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  if (todos.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Typography color="text.secondary">暂无待办事项，点击右上角"新建待办"添加</Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: 'none' }}>
      <Table stickyHeader size="medium">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold', width: '20%', minWidth: 100 }}>日期</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: '15%', minWidth: 80 }}>时间</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>事件</TableCell>
            <TableCell sx={{ fontWeight: 'bold', width: 100 }} align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {todos.map((todo) => {
            const isCompleted = todo.status === 'completed';
            return (
              <TableRow
                key={todo.id}
                sx={{
                  '&:last-child td, &:last-child th': { border: 0 },
                  backgroundColor: isCompleted ? 'rgba(0, 0, 0, 0.02)' : 'inherit',
                  transition: 'background-color 0.2s',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  },
                }}
              >
                <TableCell
                  component="th"
                  scope="row"
                  sx={{
                    color: isCompleted ? 'text.disabled' : 'text.primary',
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}
                >
                  {formatDate(todo.scheduled_date || todo.created_at)}
                </TableCell>
                <TableCell
                  sx={{
                    color: isCompleted ? 'text.disabled' : 'text.primary',
                  }}
                >
                  {formatTime(todo.scheduled_date)}
                </TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Checkbox
                      checked={isCompleted}
                      onChange={() => handleToggleComplete(todo)}
                      color="primary"
                      size="small"
                      sx={{ p: 0.5, mr: 1 }}
                    />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isCompleted ? 'normal' : 'medium',
                          color: isCompleted ? 'text.disabled' : 'text.primary',
                          textDecoration: isCompleted ? 'line-through' : 'none',
                        }}
                      >
                        {todo.title}
                      </Typography>
                      {todo.description && (
                        <Typography variant="caption" display="block" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                          {todo.description}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      label={getPriorityLabel(todo.priority)}
                      color={getPriorityColor(todo.priority) as any}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.7rem', ml: 1, opacity: isCompleted ? 0.5 : 1 }}
                    />
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    aria-label="edit"
                    onClick={() => onEditTodo(todo)}
                    size="small"
                    disabled={isCompleted}
                    sx={{ mr: 1 }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label="delete"
                    onClick={() => handleDelete(todo)}
                    size="small"
                    color="error"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default TodoList;
