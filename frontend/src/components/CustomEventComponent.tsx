// React import removed - using modern JSX transform
import type { EventProps } from 'react-big-calendar'; // Import EventProps for typing
import type { MyCalendarEvent } from '../app/page'; // Import your specific event type
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';

interface CustomEventProps extends EventProps<MyCalendarEvent> {
  onToggleComplete: (eventId: string | number, currentState: boolean) => void;
  onDelete: (eventId: string | number) => void;
  nextUpcomingEventId?: string | number | null;
}

const CustomEventComponent: React.FC<CustomEventProps> = ({ event, title, onToggleComplete, onDelete, nextUpcomingEventId }) => {
  if (!event || event.id === undefined) {
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

  // 在组件内部判断是否是下一个即将发生的事件
  const isNextUpcoming = event.id === nextUpcomingEventId;

  // Add 'custom-event-item' for CSS hover targeting
  // Apply text color based on completion to the wrapper, but strikethrough only to title
  const eventWrapperClass = `custom-event-item flex items-center justify-between w-full h-full px-1 relative ${isNextUpcoming ? 'next-upcoming-event' : ''} ${isCompleted ? 'text-gray-400' : 'text-gray-800'}`;

  return (
    <div className={eventWrapperClass}>
      {/* Event Title - takes up available space */}
      <span 
        className="event-title flex-grow overflow-hidden text-ellipsis whitespace-nowrap"
        title={event.title} // Show full event title on hover
        style={{ textDecoration: isCompleted ? 'line-through' : 'none', marginRight: '4px' }} // Add some margin if actions are on the right
      >
        {title} {/* Display title (possibly truncated) */}
      </span>

      {/* Container for action buttons, controlled by CSS for hover display */}
      <div className="event-actions flex items-center">
        {/* Toggle Complete Button */}
        <IconButton 
          size="small" 
          onClick={handleToggle} 
          sx={{
            padding: '2px',
            marginRight: '2px', // Space between toggle and delete
            color: isCompleted ? 'green' : 'rgba(0, 0, 0, 0.5)', // Dynamic color for toggle
            '&:hover': {
              backgroundColor: isCompleted ? 'rgba(0, 128, 0, 0.08)' : 'rgba(0, 0, 0, 0.08)',
            }
          }}
          aria-label={isCompleted ? "Mark as incomplete" : "Mark as complete"}
          className="action-icon toggle-icon" // For general styling if needed
        >
          {isCompleted ? (
            <CheckCircleOutlineIcon fontSize="inherit" />
          ) : (
            <RadioButtonUncheckedIcon fontSize="inherit" />
          )}
        </IconButton>

        {/* Delete Button */}
        <IconButton 
          size="small" 
          onClick={handleDelete} 
          sx={{
            padding: '2px',
            color: 'rgba(0, 0, 0, 0.5)',
            '&:hover': {
              color: 'red',
              backgroundColor: 'rgba(255, 0, 0, 0.08)',
            }
          }}
          aria-label="Delete event"
          className="action-icon delete-icon" // For general styling if needed
        >
          <DeleteIcon fontSize="inherit" />
        </IconButton>
      </div>
    </div>
  );
};

export default CustomEventComponent; 