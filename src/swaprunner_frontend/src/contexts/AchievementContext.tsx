import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { backendService } from '../services/backend';

interface Achievement {
    id: string;
    name: string;
    description: string;
    criteria: string;
    logo_url?: string;
}

interface UserAchievement {
    user: string;
    achievement_id: string;
    discovered_at: number;
}

interface AchievementContextType {
    needsScan: boolean;
    setNeedsScan: (needs: boolean) => void;
    newAchievements: Achievement[];
    dismissAchievement: (id: string) => void;
}

const AchievementContext = createContext<AchievementContextType | null>(null);

export const useAchievements = () => {
    const context = useContext(AchievementContext);
    if (!context) {
        throw new Error('useAchievements must be used within an AchievementProvider');
    }
    return context;
};

export const AchievementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [needsScan, setNeedsScan] = useState(false);
    const [newAchievements, setNewAchievements] = useState<Achievement[]>([]);
    const [scanTimer, setScanTimer] = useState<NodeJS.Timeout | null>(null);

    const performScan = useCallback(async () => {
        if (!needsScan) return;
        
        try {
            const actor = await backendService.getActor();
            const result = await actor.scan_for_new_achievements();
            
            if (result.new_achievements.length > 0) {
                // Fetch details for each new achievement
                const newAchievementsWithDetails: Achievement[] = [];
                for (const achievement of result.new_achievements) {
                    const details = await actor.get_achievement_details(achievement.achievement_id);
                    if ('ok' in details) {
                        newAchievementsWithDetails.push(details.ok);
                    }
                }
                setNewAchievements(prev => [...prev, ...newAchievementsWithDetails]);
            }
        } catch (error) {
            console.error('Error scanning for achievements:', error);
        } finally {
            setNeedsScan(false);
        }
    }, [needsScan]);

    useEffect(() => {
        // Set up periodic scanning
        const timer = setInterval(() => {
            if (needsScan) {
                performScan();
            }
        }, 60000); // Check every minute
        
        setScanTimer(timer);
        
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [needsScan, performScan]);

    // Perform immediate scan when needsScan is set to true
    useEffect(() => {
        if (needsScan) {
            performScan();
        }
    }, [needsScan, performScan]);

    const dismissAchievement = (id: string) => {
        setNewAchievements(prev => prev.filter(a => a.id !== id));
    };

    return (
        <AchievementContext.Provider value={{
            needsScan,
            setNeedsScan,
            newAchievements,
            dismissAchievement
        }}>
            {children}
        </AchievementContext.Provider>
    );
}; 