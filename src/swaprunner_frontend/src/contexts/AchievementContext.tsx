import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { backendService } from '../services/backend';
import { useClaims } from './ClaimContext';

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
    const needsScanRef = useRef(needsScan);
    const { loadClaims } = useClaims();

    // Update ref when needsScan changes
    useEffect(() => {
        needsScanRef.current = needsScan;
    }, [needsScan]);

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

    // Set up the periodic scan timer
    useEffect(() => {
        const performScan = async () => {
            if (!needsScanRef.current) {
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
                    await refreshAchievements();
                    
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

                    // Refresh claims to update the UI
                    console.log('[Achievement Scanner] Refreshing claims after finding new achievements');
                    await loadClaims();
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
        };

        // Clean up any existing timer first
        cleanupTimer();

        // Set up periodic scanning
        console.log('[Achievement Scanner] Setting up periodic scan timer');
        const timer = setInterval(() => {
            if (needsScanRef.current) {
                console.log('[Achievement Scanner] Periodic scan timer triggered, needsScan is true');
                performScan();
            } else {
                console.log('[Achievement Scanner] Periodic scan timer triggered, but needsScan is false');
            }
        }, 60000); // Check every minute
        
        timerRef.current = timer;
        
        // Clean up on unmount
        return () => {
            console.log('[Achievement Scanner] Component cleanup: removing scan timer');
            cleanupTimer();
        };
    }, []); // Empty dependency array since we use refs

    // Perform immediate scan when needsScan is set to true
    useEffect(() => {
        const performImmediateScan = async () => {
            // Return early if conditions aren't met
            if (!needsScan || isScanning.current) {
                console.log('[Achievement Scanner] Skipping immediate scan:', 
                    !needsScan ? 'needsScan is false' : 'scan already in progress');
                return;
            }
            
            console.log('[Achievement Scanner] Starting immediate scan');
            isScanning.current = true;
            
            try {
                const actor = await backendService.getActor();
                const result = await actor.scan_for_new_achievements();
                
                if (result.new_achievements.length > 0) {
                    console.log(`[Achievement Scanner] Found ${result.new_achievements.length} new achievements`);
                    // Update achievements list first
                    setUserAchievements(prev => [...prev, ...result.new_achievements]);
                    
                    // Then get details for notifications
                    const newAchievementsWithDetails: Achievement[] = [];
                    for (const achievement of result.new_achievements) {
                        try {
                            const details = await actor.get_achievement_details(achievement.achievement_id);
                            if ('ok' in details) {
                                newAchievementsWithDetails.push(details.ok);
                            }
                        } catch (error) {
                            console.error('[Achievement Scanner] Error fetching achievement details:', error);
                        }
                    }
                    
                    if (newAchievementsWithDetails.length > 0) {
                        setNewAchievements(prev => [...prev, ...newAchievementsWithDetails]);
                    }

                    // Refresh claims to update the UI
                    console.log('[Achievement Scanner] Refreshing claims after finding new achievements');
                    await loadClaims();
                } else {
                    console.log('[Achievement Scanner] No new achievements found');
                }
            } catch (error) {
                console.error('[Achievement Scanner] Error in immediate scan:', error);
            } finally {
                // Always clean up scanning state
                console.log('[Achievement Scanner] Immediate scan complete, cleaning up state');
                isScanning.current = false;
                setNeedsScan(false);
            }
        };
        
        if (needsScan) {
            performImmediateScan();
        }
    }, [needsScan, loadClaims]);

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