import React from 'react';



interface NotificationBadgeProps {
  count: number;
  className?: string;
  maxCount?: number;
}
const NotificationBadge: React.FC<NotificationBadgeProps> = ({ 
  count, 
  className = '',
  maxCount = 9
}) => {
  if (count <= 0) return null;
  const displayCount = count > maxCount ? `${maxCount}+` : count.toString();
  return (
    <span className={`absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center animate-pulse ${className}`}>
      {displayCount}
    </span>
  );
};

export default NotificationBadge;