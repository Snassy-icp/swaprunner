import React, { useEffect, useState } from 'react';
import { FiAward, FiX } from 'react-icons/fi';
import { useAchievements } from '../contexts/AchievementContext';
import '../styles/AchievementNotification.css';

interface Achievement {
    id: string;
    name: string;
    description: string;
    criteria: string;
    logo_url?: string;
}

export const AchievementNotification: React.FC = () => {
    const { newAchievements, dismissAchievement } = useAchievements();
    const [visibleAchievements, setVisibleAchievements] = useState<Achievement[]>([]);

    useEffect(() => {
        // When new achievements come in, add them to visible achievements
        if (newAchievements.length > 0) {
            setVisibleAchievements(prev => [...prev, ...newAchievements]);
        }
    }, [newAchievements]);

    useEffect(() => {
        // Set up auto-dismiss timers for each achievement
        const timers = visibleAchievements.map(achievement => {
            return setTimeout(() => {
                handleDismiss(achievement.id);
            }, 10000); // 10 seconds
        });

        return () => {
            timers.forEach(timer => clearTimeout(timer));
        };
    }, [visibleAchievements]);

    const handleDismiss = (id: string) => {
        setVisibleAchievements(prev => prev.filter(a => a.id !== id));
        dismissAchievement(id);
    };

    if (visibleAchievements.length === 0) return null;

    return (
        <div className="achievement-notifications">
            {visibleAchievements.map((achievement, index) => (
                <div 
                    key={achievement.id}
                    className="achievement-notification"
                    style={{
                        bottom: `${index * 80}px`, // Stack notifications from bottom
                        animationDelay: `${index * 0.1}s` // Stagger animations
                    }}
                >
                    <div className="achievement-icon-wrapper">
                        {achievement.logo_url ? (
                            <img 
                                src={achievement.logo_url} 
                                alt={achievement.name} 
                                className="achievement-logo"
                            />
                        ) : (
                            <FiAward size={32} className="achievement-icon" />
                        )}
                    </div>
                    <div className="achievement-info">
                        <h3>New Achievement!</h3>
                        <div className="achievement-name">{achievement.name}</div>
                    </div>
                    <button 
                        className="dismiss-button"
                        onClick={() => handleDismiss(achievement.id)}
                    >
                        <FiX />
                    </button>
                </div>
            ))}
        </div>
    );
}; 