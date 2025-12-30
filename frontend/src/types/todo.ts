export interface Todo {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
  source_email_id: string | null;
  scheduled_date: string | null;
  completed_at: string | null;
  tags: string[];
}

export interface TodoStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  high_priority: number;
  overdue: number;
}

export interface CreateTodoPayload {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  scheduled_date?: string;
  tags?: string[];
}

export interface UpdateTodoPayload {
  title?: string;
  description?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  scheduled_date?: string | null;
  tags?: string[];
}

export interface ScheduleTodoPayload {
  scheduled_date: string;
}
