import React, { useState, useEffect } from 'react';

interface TimerDisplayProps {
  startTime: number;
  endTime?: number;
  isRunning: boolean;
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({ startTime, endTime, isRunning }) => {
  const [displayTime, setDisplayTime] = useState('0.000s');

  useEffect(() => {
    if (!startTime) return;

    const updateTimer = () => {
      const end = endTime || Date.now();
      const duration = (end - startTime) / 1000; // Convert to seconds
      setDisplayTime(`${duration.toFixed(3)}s`);
    };

    // Update immediately
    updateTimer();

    // If still running, update every 10ms for smooth display
    let intervalId: NodeJS.Timeout;
    if (isRunning) {
      intervalId = setInterval(updateTimer, 10);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [startTime, endTime, isRunning]);

  return <span className="timer-display">{displayTime}</span>;
}; 