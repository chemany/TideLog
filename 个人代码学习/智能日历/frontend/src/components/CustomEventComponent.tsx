import React from 'react';
import type { EventProps } from 'react-big-calendar'; // Import EventProps for typing
import type { MyCalendarEvent } from '../app/page'; // Import your specific event type
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';

interface CustomEventProps extends EventProps<MyCalendarEvent> {
  onToggleComplete: (eventId: string | number, currentState: boolean) => void;
  onDelete: (eventId: string | number) => void;
}

const CustomEventComponent: React.FC<CustomEventProps> = ({ event, title, onToggleComplete, onDelete }) => {
  if (!event || !event.id) {
    // Handle cases where event or event.id might be undefined, though unlikely with proper filtering
    return <div className="rbc-event-content">{title}</div>;
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent onSelectEvent from firing
    onToggleComplete(event.id!, event.completed || false);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent onSelectEvent from firing
    onDelete(event.id!);
  };

  const isCompleted = event.completed === true;

  return (
    <div className={`flex items-center justify-between w-full h-full px-1 ${isCompleted ? 'text-gray-500' : 'text-gray-800'}`} style={{ textDecoration: isCompleted ? 'line-through' : 'none' }}>
      <div className="flex items-center overflow-hidden whitespace-nowrap">
        {/* Toggle Button/Icon */}
        <IconButton size="small" onClick={handleToggle} sx={{ padding: '2px', marginRight: '4px' }}>
          {isCompleted ? (
            <CheckCircleOutlineIcon fontSize="inherit" sx={{ color: 'green' }} />
          ) : (
            <RadioButtonUncheckedIcon fontSize="inherit" />
          )}
        </IconButton>
        
        {/* Event Title with conditional styling */}
        <span 
          className="flex-grow overflow-hidden text-ellipsis"
          title={title}
        >
          {title}
        </span>
      </div>

      {/* Delete Button */}
      <IconButton 
        size="small" 
        onClick={handleDelete} 
        sx={{ 
          padding: '2px', 
          marginLeft: '4px',
          color: 'rgba(0, 0, 0, 0.4)',
          '&:hover': {
            color: 'red',
            backgroundColor: 'rgba(255, 0, 0, 0.05)',
          }
        }}
        aria-label="Delete event"
      >
        <DeleteIcon fontSize="inherit" />
      </IconButton>
    </div>
  );
};

export default CustomEventComponent; 