import React from 'react';
import { View } from 'react-big-calendar';
import { Box, Button, ButtonGroup } from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';

// 自定义 Toolbar 接口，不再继承 ToolbarProps 以获得更大的灵活性
interface CustomToolbarProps {
  date: Date;
  view: View | 'todo';
  views: (View | 'todo')[]; // 允许包含 'todo'
  onNavigate: (action: 'PREV' | 'NEXT' | 'TODAY') => void; // 简化导航动作类型
  onView: (view: View | 'todo') => void;
  label: string;
}

const CalendarToolbar: React.FC<CustomToolbarProps> = ({
  date,
  view,
  views,
  onNavigate,
  onView,
  label,
}) => {
  const viewNames = () => {
    // 确保 views 是数组
    const viewList = Array.isArray(views) ? views : [];
    
    return viewList.map((viewName) => {
      let displayName: string = viewName;
      let icon = null;

      switch (viewName) {
        case 'month': displayName = '月'; break;
        case 'week': displayName = '周'; break;
        case 'day': displayName = '日'; break;
        case 'agenda': displayName = '议程'; break;
        case 'todo': 
          displayName = '待办'; 
          icon = <AssignmentIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />;
          break;
        default: displayName = viewName;
      }

      return (
        <Button
          key={viewName}
          size="small"
          variant={view === viewName ? 'contained' : 'text'} // 选中状态样式
          color={view === viewName ? 'primary' : 'inherit'} // 选中颜色
          onClick={() => onView(viewName)}
          sx={{ minWidth: 'auto', px: 1.5 }}
        >
          {icon}
          {displayName}
        </Button>
      );
    });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px', // 增加一些内边距匹配原有样式
        borderBottom: '1px solid #e0e0e0', // 添加分割线
        flexWrap: 'wrap',
        gap: 1,
      }}
    >
      <Box>
        <Button size="small" onClick={() => onNavigate('TODAY')}>
          今天
        </Button>
        <Button size="small" onClick={() => onNavigate('PREV')}>
          上一步
        </Button>
        <Button size="small" onClick={() => onNavigate('NEXT')}>
          下一步
        </Button>
        <Button size="small" disabled sx={{ color: 'text.primary', fontWeight: 'bold' }}>
          {label}
        </Button>
      </Box>

      <Box display="flex" alignItems="center" gap={1}>
        <ButtonGroup size="small" variant="outlined">
          {viewNames()}
        </ButtonGroup>
      </Box>
    </Box>
  );
};

export default CalendarToolbar;
