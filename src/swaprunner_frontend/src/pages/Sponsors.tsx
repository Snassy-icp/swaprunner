import React, { useEffect, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiCheck, FiExternalLink, FiAward } from 'react-icons/fi';
import { userProfileService } from '../services/userProfile';
import { allocationService } from '../services/allocation';
import { tokenService } from '../services/token';
import { formatTokenAmount } from '../utils/format';
import { TokenMetadata } from '../types/token';
import '../styles/Sponsors.css';
import { useTokens } from '../contexts/TokenContext';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';

interface UserProfile {
    principal: Principal;
    name: string;
    description: string;
    logo_url: [] | [string];
    social_links: Array<{
        platform: string;
        url: string;
    }>;
    created_at: bigint;
    updated_at: bigint;
    created_by: string;
    verified: boolean;
}

interface Achievement {
    id: string;
    name: string;
    description: string;
    criteria: string;
    logo_url?: string;
}

interface AllocationWithAchievement {
    allocation: {
        id: string;
        token: {
            canister_id: string;
            total_amount_e8s: bigint;
            per_user: {
                min_e8s: bigint;
                max_e8s: bigint;
            };
        };
    };
    achievement: Achievement;
    claims: {
        total_claimed: bigint;
        claim_count: number;
        remaining_balance: bigint;
    };
}

interface SponsorWithClaims {
    profile: UserProfile;
    allocations: {
        token: string;
        totalAllocated: bigint;
        totalClaimed: bigint;
    }[];
    achievementAllocations: {
        [achievementId: string]: AllocationWithAchievement[];
    };
}

export const Sponsors: React.FC = () => {
    const [sponsors, setSponsors] = useState<SponsorWithClaims[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSponsors, setExpandedSponsors] = useState<Set<string>>(new Set());
    const { tokens } = useTokens();

    useEffect(() => {
        loadSponsors();
    }, []);

    const loadSponsors = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const verifiedProfiles = await userProfileService.getVerifiedProfiles();
            const actor = await backendService.getActor();
            
            const sponsorsWithClaims = await Promise.all(verifiedProfiles.map(async (profile) => {
                const allocations = await allocationService.getSponsorAllocations(profile.principal.toString());
                const tokenStats = new Map<string, { totalAllocated: bigint; totalClaimed: bigint }>();
                const achievementAllocations: { [key: string]: AllocationWithAchievement[] } = {};

                for (const { allocation } of allocations) {
                    const token = allocation.token.canister_id.toString();
                    if (!tokenStats.has(token)) {
                        tokenStats.set(token, { totalAllocated: BigInt(0), totalClaimed: BigInt(0) });
                    }
                    const stats = tokenStats.get(token)!;
                    stats.totalAllocated += allocation.token.total_amount_e8s;

                    // Get achievement details
                    const achievementResult = await actor.get_achievement_details(allocation.achievement_id);
                    if ('ok' in achievementResult) {
                        const achievement = achievementResult.ok;
                        
                        // Get claims for this allocation
                        const claims = await allocationService.getAllocationClaims(allocation.id);
                        const totalClaimed = claims.reduce((sum, claim) => sum + claim.amount_e8s, BigInt(0));
                        stats.totalClaimed += totalClaimed;

                        // Get remaining balance
                        const remainingBalance = await allocationService.getAllocationBalance(allocation.id);

                        // Group by achievement
                        if (!achievementAllocations[achievement.id]) {
                            achievementAllocations[achievement.id] = [];
                        }
                        achievementAllocations[achievement.id].push({
                            allocation,
                            achievement,
                            claims: {
                                total_claimed: totalClaimed,
                                claim_count: claims.length,
                                remaining_balance: remainingBalance
                            }
                        });
                    }
                }

                const typedProfile: UserProfile = {
                    principal: profile.principal,
                    name: profile.name,
                    description: profile.description,
                    logo_url: profile.logo_url ? [profile.logo_url] : [],
                    social_links: profile.social_links,
                    created_at: BigInt(profile.created_at),
                    updated_at: BigInt(profile.updated_at),
                    created_by: profile.created_by.toString(),
                    verified: profile.verified
                };

                return {
                    profile: typedProfile,
                    allocations: Array.from(tokenStats.entries()).map(([token, stats]) => ({
                        token,
                        totalAllocated: stats.totalAllocated,
                        totalClaimed: stats.totalClaimed
                    })),
                    achievementAllocations
                };
            }));

            setSponsors(sponsorsWithClaims);
        } catch (err) {
            console.error('Error loading sponsors:', err);
            setError('Failed to load sponsors');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (timestamp: bigint): string => {
        return new Date(Number(timestamp)).toLocaleString();
    };

    const toggleSponsor = (principalId: string) => {
        const newExpandedSponsors = new Set(expandedSponsors);
        if (newExpandedSponsors.has(principalId)) {
            newExpandedSponsors.delete(principalId);
        } else {
            newExpandedSponsors.add(principalId);
        }
        setExpandedSponsors(newExpandedSponsors);
    };

    if (loading) {
        return (
            <div className="sponsors-page">
                <div className="swap-box">
                    <div className="loading">Loading sponsors...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="sponsors-page">
                <div className="swap-box">
                    <div className="error-message">{error}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="sponsors-page">
            <div className="swap-box">
                <h1>Sponsors</h1>
                <div className="sponsors-list">
                    {sponsors.map((sponsor) => (
                        <div key={sponsor.profile.principal.toString()} className="sponsor-card">
                            <div 
                                className="sponsor-header"
                                onClick={() => toggleSponsor(sponsor.profile.principal.toString())}
                            >
                                <div className="sponsor-logo-cell">
                                    <img 
                                        className="sponsor-logo"
                                        src={sponsor.profile.logo_url[0] || '/default-logo.png'}
                                        alt={`${sponsor.profile.name} logo`}
                                        onError={(e) => {
                                            const img = e.target as HTMLImageElement;
                                            img.src = '/default-logo.png';
                                        }}
                                    />
                                </div>
                                <div className="sponsor-info">
                                    <div className="sponsor-name">
                                        <div className="name-with-badge">
                                            <h3>{sponsor.profile.name}</h3>
                                            {sponsor.profile.verified && (
                                                <span className="verified-badge" title="Verified Sponsor">
                                                    <FiCheck />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="sponsor-stats">
                                        {sponsor.allocations.map((allocation, index) => {
                                            const token = tokens.find(t => t.canisterId === allocation.token);
                                            const claimPercentage = Number((allocation.totalClaimed * BigInt(100)) / allocation.totalAllocated);
                                            const symbol = token?.metadata?.symbol || 'tokens';
                                            return (
                                                <div key={index} className="token-stats">
                                                    <span>{formatTokenAmount(allocation.totalClaimed, allocation.token)} / {formatTokenAmount(allocation.totalAllocated, allocation.token)} {symbol}</span>
                                                    <span>•</span>
                                                    <span>{claimPercentage}% claimed</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <button className="expand-button">
                                    {expandedSponsors.has(sponsor.profile.principal.toString()) ? <FiChevronUp /> : <FiChevronDown />}
                                </button>
                            </div>
                            {expandedSponsors.has(sponsor.profile.principal.toString()) && (
                                <div className="sponsor-details">
                                    <p className="sponsor-description">{sponsor.profile.description}</p>
                                    {sponsor.profile.social_links.length > 0 && (
                                        <div className="social-links">
                                            {sponsor.profile.social_links.map((link, index) => (
                                                <a 
                                                    key={index}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="social-link"
                                                >
                                                    {link.platform}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                    
                                    {/* Achievement Allocations Section */}
                                    <div className="achievement-allocations">
                                        <h4>Sponsored Achievements</h4>
                                        {Object.entries(sponsor.achievementAllocations).map(([achievementId, allocations]) => (
                                            <div key={achievementId} className="achievement-group">
                                                <div className="achievement-header">
                                                    <div className="achievement-icon-wrapper">
                                                        {allocations[0].achievement.logo_url ? (
                                                            <img 
                                                                src={allocations[0].achievement.logo_url} 
                                                                alt={allocations[0].achievement.name}
                                                                className="achievement-logo"
                                                            />
                                                        ) : (
                                                            <FiAward className="achievement-icon" />
                                                        )}
                                                    </div>
                                                    <div className="achievement-info">
                                                        <h5>{allocations[0].achievement.name}</h5>
                                                        <p>{allocations[0].achievement.description}</p>
                                                        <div className="achievement-criteria">
                                                            <strong>How to earn:</strong> {allocations[0].achievement.criteria}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="allocation-list">
                                                    {allocations.map((alloc, index) => {
                                                        const token = tokens.find(t => t.canisterId === alloc.allocation.token.canister_id.toString());
                                                        const claimPercentage = Number((alloc.claims.total_claimed * BigInt(100)) / alloc.allocation.token.total_amount_e8s);
                                                        return (
                                                            <div key={index} className="allocation-item">
                                                                <div className="allocation-stats">
                                                                    <div className="allocation-amount">
                                                                        <span>Total Allocated:</span>
                                                                        <span>{formatTokenAmount(alloc.allocation.token.total_amount_e8s, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'}</span>
                                                                    </div>
                                                                    <div className="allocation-claims">
                                                                        <span>Claims:</span>
                                                                        <span>{formatTokenAmount(alloc.claims.total_claimed, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'} ({claimPercentage}%) by {alloc.claims.claim_count} users</span>
                                                                    </div>
                                                                    <div className="allocation-remaining">
                                                                        <span>Remaining:</span>
                                                                        <span>{formatTokenAmount(alloc.claims.remaining_balance, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'}</span>
                                                                    </div>
                                                                    <div className="allocation-range">
                                                                        <span>Per User Range:</span>
                                                                        <span>{formatTokenAmount(alloc.allocation.token.per_user.min_e8s, alloc.allocation.token.canister_id.toString())} - {formatTokenAmount(alloc.allocation.token.per_user.max_e8s, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'}</span>
                                                                    </div>
                                                                    <div className={`allocation-progress ${alloc.claims.remaining_balance === BigInt(0) ? 'allocation-progress-depleted' : ''}`}>
                                                                        <div 
                                                                            className="allocation-progress-bar" 
                                                                            style={{ 
                                                                                width: `${(Number(alloc.claims.remaining_balance) * 100) / Number(alloc.allocation.token.total_amount_e8s)}%` 
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="sponsor-footer">
                                        <span>Joined: {formatDate(sponsor.profile.created_at)}</span>
                                        <span>Last active: {formatDate(sponsor.profile.updated_at)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}; 