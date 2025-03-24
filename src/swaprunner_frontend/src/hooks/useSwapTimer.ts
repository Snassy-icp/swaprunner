import { useState, useEffect } from 'react';

interface Timer {
  startTime: number;
  endTime?: number;
  isRunning: boolean;
}

interface SwapTimers {
  overall: Timer;
  steps: Timer[];
}

export const useSwapTimer = (steps: { status: string; error?: string }[]) => {
  const [timers, setTimers] = useState<SwapTimers>({
    overall: { startTime: 0, isRunning: false },
    steps: steps.map(() => ({ startTime: 0, isRunning: false }))
  });

  // Format duration in seconds with milliseconds
  const formatDuration = (start: number, end: number = Date.now()) => {
    const duration = (end - start) / 1000; // Convert to seconds
    return `${duration.toFixed(3)}s`;
  };

  // Start/stop step timer
  useEffect(() => {
    steps.forEach((step, index) => {
      setTimers(current => {
        const newTimers = { ...current };
        
        // Start timer when step becomes 'loading'
        // NB: Extra check for current.steps[index] to avoid errors
        if (step.status === 'loading' && current.steps && current.steps[index] && !current.steps[index].isRunning) {
          newTimers.steps[index] = {
            startTime: Date.now(),
            isRunning: true
          };
        }
        
        // Stop timer when step completes or errors
        // NB: Extra check for current.steps[index] to avoid errors
        if ((step.status === 'complete' || step.status === 'error') && current.steps && current.steps[index] && current.steps[index].isRunning) {
          newTimers.steps[index] = {
            startTime: current.steps[index].startTime,
            endTime: Date.now(),
            isRunning: false
          };

          // If this step errored or has an error message, also stop the overall timer
          if (step.status === 'error' || step.error) {
            newTimers.overall = {
              ...current.overall,
              endTime: Date.now(),
              isRunning: false
            };
          }
        }

        return newTimers;
      });
    });
  }, [steps]);

  // Start/stop overall timer
  useEffect(() => {
    setTimers(current => {
      // Start overall timer when first step starts and has no errors
      if (steps.some(step => step.status === 'loading' && !step.error) && !current.overall.isRunning) {
        return {
          ...current,
          overall: {
            startTime: Date.now(),
            isRunning: true
          }
        };
      }

      // Stop overall timer when all steps are complete/skipped or any step has an error
      if ((steps.every(step => step.status === 'complete' || step.status === 'skipped') || 
           steps.some(step => step.status === 'error' || step.error)) && 
          current.overall.isRunning) {
        return {
          ...current,
          overall: {
            ...current.overall,
            endTime: Date.now(),
            isRunning: false
          }
        };
      }

      return current;
    });
  }, [steps]);

  // Get formatted duration for overall timer
  const getOverallDuration = () => {
    if (!timers.overall.startTime) return '';
    return formatDuration(timers.overall.startTime, timers.overall.endTime);
  };

  // Get formatted duration for a specific step
  const getStepDuration = (index: number) => {
    const stepTimer = timers.steps[index];
    if (!stepTimer.startTime) return '';
    return formatDuration(stepTimer.startTime, stepTimer.endTime);
  };

  return {
    getOverallDuration,
    getStepDuration,
    timer: timers.overall,
    stepTimers: timers.steps
  };
}; 