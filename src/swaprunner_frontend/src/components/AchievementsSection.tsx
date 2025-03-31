import React, { useState, useEffect } from 'react';
import { FiAward, FiRefreshCw, FiChevronDown, FiChevronUp, FiLoader, FiGift } from 'react-icons/fi';
import { backendService } from '../services/backend';
import { CollapsibleSection } from '../pages/Me';
import '../styles/AchievementsSection.css';
import { allocationService } from '../services/allocation';
import { formatTokenAmount } from '../utils/format';
import { useTokens } from '../contexts/TokenContext';

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

interface ClaimableReward {
    achievement_id: string;
    allocation_id: string;
    claimable_amount: {
        min_e8s: bigint;
        max_e8s: bigint;
    };
}

interface AchievementCardProps {
    achievement: UserAchievement;
    details: Achievement;
    formatDate: (timestamp: number) => string;
    onClaimSuccess?: () => void;
}

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, details, formatDate, onClaimSuccess }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [availableClaims, setAvailableClaims] = useState<ClaimableReward[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { tokens } = useTokens();

    useEffect(() => {
        if (isExpanded) {
            loadAvailableClaims();
        }
    }, [isExpanded]);

    const loadAvailableClaims = async () => {
        try {
            setLoading(true);
            console.log('Loading available claims for achievement:', achievement.achievement_id);
            const claims = await allocationService.getAvailableClaims();
            console.log('All available claims:', claims);
            // Filter claims for this achievement
            const filteredClaims = claims.filter(claim => claim.achievement_id === achievement.achievement_id);
            console.log('Filtered claims for achievement:', filteredClaims);
            setAvailableClaims(filteredClaims);
        } catch (err: any) {
            console.error('Error in loadAvailableClaims:', err);
            setError('Failed to load available claims: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleClaim = async (allocationId: string) => {
        try {
            setLoading(true);
            await allocationService.claimAllocation(achievement.achievement_id, allocationId);
            // Reload claims after successful claim
            await loadAvailableClaims();
            if (onClaimSuccess) {
                onClaimSuccess();
            }
        } catch (err: any) {
            setError('Failed to claim reward: ' + (err.message || String(err)));
            console.error('Error claiming reward:', err);
        } finally {
            setLoading(false);
        }
    };

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

                        <div className="achievement-rewards">
                            <h4>Available Rewards</h4>
                            {loading ? (
                                <div className="rewards-loading">
                                    <FiLoader className="spinning" /> Loading rewards...
                                </div>
                            ) : error ? (
                                <div className="error-message">{error}</div>
                            ) : availableClaims.length > 0 ? (
                                <div className="rewards-list">
                                    {availableClaims.map((claim) => {
                                        const allocation = tokens.find(t => t.canisterId === claim.allocation_id);
                                        return (
                                            <div key={claim.allocation_id} className="reward-item">
                                                <div className="reward-info">
                                                    <FiGift className="reward-icon" />
                                                    <div className="reward-details">
                                                        <span className="reward-amount">
                                                            {claim.claimable_amount.min_e8s === claim.claimable_amount.max_e8s ? (
                                                                formatTokenAmount(claim.claimable_amount.min_e8s, claim.allocation_id)
                                                            ) : (
                                                                `${formatTokenAmount(claim.claimable_amount.min_e8s, claim.allocation_id)} - ${formatTokenAmount(claim.claimable_amount.max_e8s, claim.allocation_id)}`
                                                            )}
                                                            {allocation?.metadata?.symbol || ' tokens'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    className="claim-button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleClaim(claim.allocation_id);
                                                    }}
                                                    disabled={loading}
                                                >
                                                    {loading ? (
                                                        <>
                                                            <FiLoader className="spinning" />
                                                            Claiming...
                                                        </>
                                                    ) : (
                                                        'Claim Reward'
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="no-rewards">
                                    No rewards available to claim
                                </div>
                            )}
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
                                    onClaimSuccess={loadAchievements}
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