'use client';

import React, { useState, useCallback } from 'react';
import { TodoStats } from '../../types/todo';
import { todoService } from '../../services/todoService';
import { toast } from 'react-hot-toast';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import AssignmentIcon from '@mui/icons-material/Assignment';
import WarningIcon from '@mui/icons-material/Warning';

interface TodoStatsProps {
  onRefreshNeeded?: () => void;
}

const TodoStatsPanel: React.FC<TodoStatsProps> = ({ onRefreshNeeded }) => {
  const [stats, setStats] = useState<TodoStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await todoService.getTodoStats();
      setStats(data);
    } catch (error) {
      console.error('获取待办统计失败:', error);
      toast.error('获取统计失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => {
    fetchStats();
    onRefreshNeeded?.();
  };

  if (loading && !stats) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={100}>
        <CircularProgress />
      </Box>
    );
  }

  if (!stats) {
    return null;
  }

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">待办统计</Typography>
        <Tooltip title="刷新">
          <IconButton onClick={handleRefresh} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box mb={3}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="body2" color="text.secondary">
            完成率
          </Typography>
          <Typography variant="body2" fontWeight="bold">
            {completionRate}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={completionRate}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <AssignmentIcon color="primary" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h4">{stats.total}</Typography>
              <Typography variant="caption" color="text.secondary">
                总数
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <ScheduleIcon color="warning" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h4">{stats.pending}</Typography>
              <Typography variant="caption" color="text.secondary">
                待处理
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <PlayCircleIcon color="info" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h4">{stats.in_progress}</Typography>
              <Typography variant="caption" color="text.secondary">
                进行中
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <CheckCircleIcon color="success" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h4">{stats.completed}</Typography>
              <Typography variant="caption" color="text.secondary">
                已完成
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 4 }}>
          <Card variant="outlined">
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <WarningIcon color="error" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="h4">{stats.high_priority}</Typography>
              <Typography variant="caption" color="text.secondary">
                高优先级
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TodoStatsPanel;
