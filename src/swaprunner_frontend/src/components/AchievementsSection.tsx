import React, { useState, useEffect } from 'react';
import { FiAward, FiRefreshCw, FiChevronDown, FiChevronUp } from 'react-icons/fi';
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

interface AchievementCardProps {
    achievement: UserAchievement;
    details: Achievement;
    formatDate: (timestamp: number) => string;
}

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, details, formatDate }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="achievement-card">
            <div 
                className="achievement-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="achievement-icon-wrapper">
                    {details.logo_url ? (
                        <img 
                            src={details.logo_url} 
                            alt={details.name} 
                            className="achievement-logo"
                        />
                    ) : (
                        <FiAward size={32} className="achievement-icon" />
                    )}
                </div>
                <div className="achievement-info">
                    <h3>{details.name}</h3>
                    <div className="achievement-date">
                        {formatDate(achievement.discovered_at)}
                    </div>
                </div>
                <div className="achievement-expand">
                    {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                </div>
            </div>
            {isExpanded && (
                <div className="achievement-details">
                    <div className="achievement-details-content">
                        <h4>{details.name}</h4>
                        <p>{details.description}</p>
                        <div className="achievement-details-date">
                            Earned on {formatDate(achievement.discovered_at)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

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
            console.log('Loaded achievements:', achievements);
            setUserAchievements(achievements);

            // Get details for each achievement
            const details: Record<string, Achievement> = {};
            for (const achievement of achievements) {
                const result = await actor.get_achievement_details(achievement.achievement_id);
                console.log('Achievement details result:', result);
                if ('ok' in result) {
                    details[achievement.achievement_id] = result.ok;
                }
            }
            console.log('Final achievement details:', details);
            setAchievementDetails(details);
        } catch (err: any) {
            setError('Failed to load achievements: ' + (err.message || String(err)));
            console.error('Load error:', err);
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
            console.log('Scan result:', result);
            
            if (result.new_achievements.length > 0) {
                console.log('Found', result.new_achievements.length, 'new achievements, reloading...');
                // Reload achievements to get the new ones
                await loadAchievements();
            } else {
                console.log('No new achievements found');
            }
        } catch (err: any) {
            setError('Failed to scan for achievements: ' + (err.message || String(err)));
            console.error('Scan error:', err);
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
                <div className="achievements-list">
                    {userAchievements.length === 0 ? (
                        <div className="no-achievements">
                            No achievements yet. Keep trading to earn some!
                        </div>
                    ) : (
                        userAchievements.map(achievement => {
                            const details = achievementDetails[achievement.achievement_id];
                            if (!details) return null;

                            return (
                                <AchievementCard
                                    key={achievement.achievement_id}
                                    achievement={achievement}
                                    details={details}
                                    formatDate={formatDate}
                                />
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