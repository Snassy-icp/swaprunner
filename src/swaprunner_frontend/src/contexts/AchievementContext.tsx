import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
    userAchievements: UserAchievement[];
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
    const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const isScanning = useRef(false);

    // Clean up existing timer
    const cleanupTimer = useCallback(() => {
        if (timerRef.current) {
            console.log('[Achievement Scanner] Cleaning up existing scan timer');
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

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
            console.log('[Achievement Scanner] Got updated achievements:', result);
            setUserAchievements(result);
            console.log('[Achievement Scanner] Achievements list refreshed and stored');
        } catch (error) {
            console.error('[Achievement Scanner] Error refreshing achievements:', error);
        }
    }, []);

    // Load achievements on mount
    useEffect(() => {
        console.log('[Achievement Scanner] Initial achievements load');
        refreshAchievements();
    }, [refreshAchievements]);

    const performScan = useCallback(async () => {
        if (!needsScan) {
            console.log('[Achievement Scanner] Scan requested but needsScan is false, skipping');
            return;
        }

        if (isScanning.current) {
            console.log('[Achievement Scanner] Scan already in progress, skipping');
            return;
        }
        
        console.log('[Achievement Scanner] Starting achievement scan');
        isScanning.current = true;
        
        try {
            const actor = await backendService.getActor();
            const result = await actor.scan_for_new_achievements();
            
            if (result.new_achievements.length > 0) {
                console.log(`[Achievement Scanner] Found ${result.new_achievements.length} new achievements, fetching details`);
                // Fetch details for each new achievement
                const newAchievementsWithDetails: Achievement[] = [];
                
                // Update the achievements list first
                setUserAchievements(prev => [...prev, ...result.new_achievements]);
                
                // Then get details for notifications
                for (const achievement of result.new_achievements) {
                    const details = await actor.get_achievement_details(achievement.achievement_id);
                    if ('ok' in details) {
                        newAchievementsWithDetails.push(details.ok);
                    }
                }
                
                console.log('[Achievement Scanner] Setting new achievements for notification:', newAchievementsWithDetails);
                setNewAchievements(prev => {
                    console.log('[Achievement Scanner] Previous achievements:', prev);
                    const updated = [...prev, ...newAchievementsWithDetails];
                    console.log('[Achievement Scanner] Updated achievements:', updated);
                    return updated;
                });
            } else {
                console.log('[Achievement Scanner] No new achievements found');
            }
        } catch (error) {
            console.error('[Achievement Scanner] Error scanning for achievements:', error);
        } finally {
            console.log('[Achievement Scanner] Scan complete, resetting needsScan flag');
            setNeedsScan(false);
            isScanning.current = false;
        }
    }, [needsScan]); // Keep needsScan dependency since we're using isScanning ref to prevent loops

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
        
        timerRef.current = timer;
        
        // Clean up on unmount or when dependencies change
        return () => {
            console.log('[Achievement Scanner] Component cleanup: removing scan timer');
            cleanupTimer();
        };
    }, [cleanupTimer, performScan]);

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
            console.log('[Achievement Scanner] After dismissal, remaining achievements:', updated);
            return updated;
        });
    };

    return (
        <AchievementContext.Provider value={{
            needsScan,
            setNeedsScan: setNeedsScanWithLogging,
            newAchievements,
            dismissAchievement,
            refreshAchievements,
            userAchievements
        }}>
            {children}
        </AchievementContext.Provider>
    );
}; 