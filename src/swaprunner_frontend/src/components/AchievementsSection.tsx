import React, { useState, useEffect } from 'react';
import { FiAward, FiRefreshCw } from 'react-icons/fi';
import { backendService } from '../services/backend';
import { CollapsibleSection } from '../pages/Me';
import '../styles/AchievementsSection.css';

interface Achievement {
    id: string;
    name: string;
    description: string;
    logo_url?: string;
}

interface UserAchievement {
    user: string;
    achievement_id: string;
    discovered_at: number;
}

export const AchievementsSection: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
    const [achievementDetails, setAchievementDetails] = useState<Record<string, Achievement>>({});

    const loadAchievements = async () => {
        try {
            setLoading(true);
            setError(null);
            const actor = await backendService.getActor();
            
            // Get user's achievements
            const achievements = await actor.get_user_achievements();
            setUserAchievements(achievements);

            // Get details for each achievement
            const details: Record<string, Achievement> = {};
            for (const achievement of achievements) {
                const result = await actor.get_achievement_details(achievement.achievement_id);
                if ('ok' in result) {
                    details[achievement.achievement_id] = result.ok;
                }
            }
            setAchievementDetails(details);
        } catch (err: any) {
            setError('Failed to load achievements: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const scanForNewAchievements = async () => {
        try {
            setScanning(true);
            setError(null);
            const actor = await backendService.getActor();
            
            const result = await actor.scan_for_new_achievements();
            if (result.new_achievements.length > 0) {
                // Reload achievements to get the new ones
                await loadAchievements();
            }
        } catch (err: any) {
            setError('Failed to scan for achievements: ' + (err.message || String(err)));
        } finally {
            setScanning(false);
        }
    };

    useEffect(() => {
        loadAchievements();
    }, []);

    const formatDate = (timestamp: number) => {
        return new Date(Number(timestamp) / 1_000_000).toLocaleString();
    };

    const achievementsContent = (
        <div className="achievements-content">
            <div className="achievements-actions">
                <button 
                    className="scan-button" 
                    onClick={scanForNewAchievements}
                    disabled={scanning}
                >
                    <FiRefreshCw className={scanning ? 'spinning' : ''} />
                    {scanning ? 'Scanning...' : 'Scan for New'}
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {loading ? (
                <div className="achievements-loading">Loading achievements...</div>
            ) : (
                <div className="achievements-grid">
                    {userAchievements.length === 0 ? (
                        <div className="no-achievements">
                            No achievements yet. Keep trading to earn some!
                        </div>
                    ) : (
                        userAchievements.map(achievement => {
                            const details = achievementDetails[achievement.achievement_id];
                            if (!details) return null;

                            return (
                                <div key={achievement.achievement_id} className="achievement-card">
                                    {details.logo_url ? (
                                        <img 
                                            src={details.logo_url} 
                                            alt={details.name} 
                                            className="achievement-logo"
                                        />
                                    ) : (
                                        <FiAward size={48} className="achievement-icon" />
                                    )}
                                    <h3>{details.name}</h3>
                                    <p className="achievement-description">{details.description}</p>
                                    <div className="achievement-date">
                                        Earned on {formatDate(achievement.discovered_at)}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );

    return (
        <CollapsibleSection 
            title="Achievements" 
            icon={<FiAward size={24} />}
            defaultExpanded={false}
        >
            {achievementsContent}
        </CollapsibleSection>
    );
}; 