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
    refreshAchievements: () => Promise<void>;
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
    const [needsRefresh, setNeedsRefresh] = useState(false);

    // Clean up existing timer before setting up a new one
    const cleanupTimer = useCallback(() => {
        if (scanTimer) {
            console.log('[Achievement Scanner] Cleaning up existing scan timer');
            clearInterval(scanTimer);
            setScanTimer(null);
        }
    }, [scanTimer]);

    // Wrap setNeedsScan to add logging
    const setNeedsScanWithLogging = (needs: boolean) => {
        console.log(`[Achievement Scanner] Setting needsScan to ${needs}${needs ? ', will trigger scan soon' : ''}`);
        setNeedsScan(needs);
    };

    const refreshAchievements = useCallback(async () => {
        try {
            console.log('[Achievement Scanner] Refreshing achievements list');
            const actor = await backendService.getActor();
            const result = await actor.get_user_achievements();
            setNeedsRefresh(false);
            console.log('[Achievement Scanner] Achievements list refreshed');
        } catch (error) {
            console.error('[Achievement Scanner] Error refreshing achievements:', error);
        }
    }, []);

    const performScan = useCallback(async () => {
        if (!needsScan) {
            console.log('[Achievement Scanner] Scan requested but needsScan is false, skipping');
            return;
        }
        
        console.log('[Achievement Scanner] Starting achievement scan');
        try {
            const actor = await backendService.getActor();
            const result = await actor.scan_for_new_achievements();
            
            if (result.new_achievements.length > 0) {
                console.log(`[Achievement Scanner] Found ${result.new_achievements.length} new achievements, fetching details`);
                // Fetch details for each new achievement
                const newAchievementsWithDetails: Achievement[] = [];
                for (const achievement of result.new_achievements) {
                    const details = await actor.get_achievement_details(achievement.achievement_id);
                    if ('ok' in details) {
                        newAchievementsWithDetails.push(details.ok);
                    }
                }
                console.log('[Achievement Scanner] Setting new achievements for notification:', newAchievementsWithDetails);
                setNewAchievements(prev => [...prev, ...newAchievementsWithDetails]);
                
                // Set flag to refresh after notifications are dismissed
                setNeedsRefresh(true);
            } else {
                console.log('[Achievement Scanner] No new achievements found');
            }
        } catch (error) {
            console.error('[Achievement Scanner] Error scanning for achievements:', error);
        } finally {
            console.log('[Achievement Scanner] Scan complete, resetting needsScan flag');
            setNeedsScan(false);
        }
    }, [needsScan]);

    useEffect(() => {
        // Clean up any existing timer first
        cleanupTimer();

        // Set up periodic scanning
        console.log('[Achievement Scanner] Setting up periodic scan timer');
        const timer = setInterval(() => {
            if (needsScan) {
                console.log('[Achievement Scanner] Periodic scan timer triggered, needsScan is true');
                performScan();
            } else {
                console.log('[Achievement Scanner] Periodic scan timer triggered, but needsScan is false');
            }
        }, 60000); // Check every minute
        
        setScanTimer(timer);
        
        // Clean up on unmount or when dependencies change
        return () => {
            console.log('[Achievement Scanner] Component cleanup: removing scan timer');
            cleanupTimer();
        };
    }, [needsScan, performScan, cleanupTimer]);

    // Perform immediate scan when needsScan is set to true
    useEffect(() => {
        if (needsScan) {
            console.log('[Achievement Scanner] needsScan changed to true, triggering immediate scan');
            performScan();
        }
    }, [needsScan, performScan]);

    const dismissAchievement = (id: string) => {
        console.log(`[Achievement Scanner] Dismissing achievement notification: ${id}`);
        setNewAchievements(prev => {
            const updated = prev.filter(a => a.id !== id);
            // If this was the last notification and we need to refresh, do it
            if (updated.length === 0 && needsRefresh) {
                console.log('[Achievement Scanner] Last notification dismissed, triggering refresh');
                refreshAchievements();
            }
            return updated;
        });
    };

    return (
        <AchievementContext.Provider value={{
            needsScan,
            setNeedsScan: setNeedsScanWithLogging,
            newAchievements,
            dismissAchievement,
            refreshAchievements
        }}>
            {children}
        </AchievementContext.Provider>
    );
}; 