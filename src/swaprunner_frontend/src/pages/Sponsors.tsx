import React, { useEffect, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiCheck, FiExternalLink, FiAward, FiLoader, FiGift, FiCheckCircle } from 'react-icons/fi';
import { userProfileService } from '../services/userProfile';
import { allocationService } from '../services/allocation';
import { tokenService } from '../services/token';
import { formatTokenAmount } from '../utils/format';
import { TokenMetadata } from '../types/token';
import '../styles/Sponsors.css';
import { useTokens } from '../contexts/TokenContext';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import { useAuth } from '../contexts/AuthContext';
import { priceService } from '../services/price';
import { useClaims } from '../contexts/ClaimContext';
import { useAchievements } from '../contexts/AchievementContext';
import '../styles/ClaimSuccessModal.css';
import { ClaimSuccessModal } from '../components/AchievementsSection';

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

interface AchievementLoadingState {
    isLoading: boolean;
    error?: string;
    data?: AllocationWithAchievement[];
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

interface SponsorLoadingState {
    profile: UserProfile;
    isLoading: boolean;
    error?: string;
    data?: {
        allocations: {
            token: string;
            totalAllocated: bigint;
            totalClaimed: bigint;
        }[];
        achievementAllocations: {
            [achievementId: string]: AchievementLoadingState;
        };
    };
}

interface UserClaim {
    allocation: {
        id: string;
        creator: string;
        achievement_id: string;
        token: {
            canister_id: string;
            total_amount_e8s: bigint;
            per_user: {
                min_e8s: bigint;
                max_e8s: bigint;
            };
        };
        created_at: number;
    };
    claim: {
        allocation_id: string;
        user: string;
        amount_e8s: bigint;
        claimed_at: bigint;
    };
}

interface UserAchievement {
    user: string;
    achievement_id: string;
    discovered_at: number;
}

export const Sponsors: React.FC = () => {
    const [sponsors, setSponsors] = useState<SponsorLoadingState[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [expandedSponsors, setExpandedSponsors] = useState<Set<string>>(new Set());
    const [expandedAchievements, setExpandedAchievements] = useState<Set<string>>(new Set());
    const [loadedLogos, setLoadedLogos] = useState<Record<string, string>>({});
    const [userClaims, setUserClaims] = useState<UserClaim[]>([]);
    const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([]);
    const [tokenUSDPrices, setTokenUSDPrices] = useState<Record<string, number>>({});
    const [loadingUSDPrices, setLoadingUSDPrices] = useState<Record<string, boolean>>({});
    const { tokens } = useTokens();
    const { isAuthenticated } = useAuth();
    const [claiming, setClaiming] = useState<string | null>(null);
    const [showClaimSuccess, setShowClaimSuccess] = useState(false);
    const [claimSuccessDetails, setClaimSuccessDetails] = useState<{
        amount: bigint;
        tokenId: string;
        achievementName: string;
    } | null>(null);
    const [claimError, setClaimError] = useState<string | null>(null);

    useEffect(() => {
        loadSponsors();
    }, []);

    useEffect(() => {
        const loadUserData = async () => {
            if (isAuthenticated) {
                try {
                    const [claims, achievements] = await Promise.all([
                        allocationService.getUserClaims(),
                        backendService.getActor().then(actor => actor.get_user_achievements())
                    ]);
                    setUserClaims(claims);
                    setUserAchievements(achievements);
                } catch (error) {
                    console.error('Error loading user data:', error);
                }
            }
        };
        loadUserData();
    }, [isAuthenticated]);

    // Load logos for expanded sponsors
    useEffect(() => {
        const loadTokenLogos = async () => {
            for (const sponsor of sponsors) {
                const tokenLink = sponsor.profile.social_links.find(
                    link => link.platform.toLowerCase() === 'token'
                );
                if (tokenLink && !loadedLogos[tokenLink.url]) {
                    try {
                        const logo = await tokenService.getTokenLogo(tokenLink.url);
                        setLoadedLogos(prev => ({
                            ...prev,
                            [tokenLink.url]: logo || '/generic_token.svg'
                        }));
                    } catch (err) {
                        console.error('Error loading token logo:', err);
                    }
                }
            }
        };

        loadTokenLogos();
    }, [sponsors]);

    const loadSponsors = async () => {
        try {
            setIsInitialLoading(true);
            const verifiedProfiles = await userProfileService.getVerifiedProfiles();
            
            // Randomly shuffle the verified profiles array
            const shuffledProfiles = [...verifiedProfiles].sort(() => Math.random() - 0.5);
            
            // Initialize sponsors with loading states using shuffled array
            setSponsors(shuffledProfiles.map(profile => ({
                profile: {
                    principal: profile.principal,
                    name: profile.name,
                    description: profile.description,
                    logo_url: profile.logo_url ? [profile.logo_url] : [],
                    social_links: profile.social_links,
                    created_at: BigInt(profile.created_at),
                    updated_at: BigInt(profile.updated_at),
                    created_by: profile.created_by.toString(),
                    verified: profile.verified
                },
                isLoading: true
            })));
            setIsInitialLoading(false);

            // Load each sponsor's data individually using shuffled array
            for (const profile of shuffledProfiles) {
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
                loadSponsorData(typedProfile);
            }
        } catch (err) {
            console.error('Error loading sponsors:', err);
            setIsInitialLoading(false);
        }
    };

    const loadSponsorData = async (profile: UserProfile) => {
        try {
            const actor = await backendService.getActor();
            const allocations = await allocationService.getSponsorAllocations(profile.principal.toString());
            const tokenStats = new Map<string, { totalAllocated: bigint; totalClaimed: bigint }>();
            const achievementAllocations: { [key: string]: AchievementLoadingState } = {};

            // Initialize achievement allocations with loading state
            allocations.forEach(({ allocation }) => {
                achievementAllocations[allocation.achievement_id] = {
                    isLoading: true
                };
            });

            // Update sponsor with initial loading states
            setSponsors(currentSponsors => 
                currentSponsors.map(s => 
                    s.profile.principal.toString() === profile.principal.toString()
                        ? {
                            ...s,
                            isLoading: false,
                            data: {
                                allocations: [],
                                achievementAllocations
                            }
                        }
                        : s
                )
            );

            // Load USD prices for all unique tokens
            const uniqueTokens = new Set<string>();
            allocations.forEach(({ allocation }) => {
                const tokenId = allocation.token.canister_id.toString();
                uniqueTokens.add(tokenId);
                setLoadingUSDPrices(prev => ({
                    ...prev,
                    [tokenId]: true
                }));
            });

            // Load USD prices in parallel
            await Promise.all(Array.from(uniqueTokens).map(async tokenId => {
                try {
                    const price = await priceService.getTokenUSDPrice(tokenId);
                    setTokenUSDPrices(prev => ({
                        ...prev,
                        [tokenId]: price
                    }));
                } catch (error) {
                    console.error('Failed to fetch USD price for token:', tokenId, error);
                } finally {
                    setLoadingUSDPrices(prev => ({
                        ...prev,
                        [tokenId]: false
                    }));
                }
            }));

            for (const { allocation } of allocations) {
                const token = allocation.token.canister_id.toString();
                if (!tokenStats.has(token)) {
                    tokenStats.set(token, { totalAllocated: BigInt(0), totalClaimed: BigInt(0) });
                }
                const stats = tokenStats.get(token)!;
                stats.totalAllocated += allocation.token.total_amount_e8s;

                try {
                    const achievementResult = await actor.get_achievement_details(allocation.achievement_id);
                    if ('ok' in achievementResult) {
                        const achievement = achievementResult.ok;
                        const claims = await allocationService.getAllocationClaims(allocation.id);
                        const totalClaimed = claims.reduce((sum, claim) => sum + claim.amount_e8s, BigInt(0));
                        stats.totalClaimed += totalClaimed;
                        const remainingBalance = await allocationService.getAllocationBalance(allocation.id);

                        // Update the specific achievement's data
                        setSponsors(currentSponsors => 
                            currentSponsors.map(s => {
                                if (s.profile.principal.toString() !== profile.principal.toString()) return s;
                                return {
                                    ...s,
                                    data: {
                                        ...s.data!,
                                        achievementAllocations: {
                                            ...s.data!.achievementAllocations,
                                            [achievement.id]: {
                                                isLoading: false,
                                                data: [
                                                    ...(s.data!.achievementAllocations[achievement.id]?.data || []),
                                                    {
                                                        allocation,
                                                        achievement,
                                                        claims: {
                                                            total_claimed: totalClaimed,
                                                            claim_count: claims.length,
                                                            remaining_balance: remainingBalance
                                                        }
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                };
                            })
                        );
                    }
                } catch (err) {
                    console.error('Error loading achievement:', err);
                    setSponsors(currentSponsors => 
                        currentSponsors.map(s => {
                            if (s.profile.principal.toString() !== profile.principal.toString()) return s;
                            return {
                                ...s,
                                data: {
                                    ...s.data!,
                                    achievementAllocations: {
                                        ...s.data!.achievementAllocations,
                                        [allocation.achievement_id]: {
                                            isLoading: false,
                                            error: 'Failed to load achievement data'
                                        }
                                    }
                                }
                            };
                        })
                    );
                }
            }

            // Update final token stats
            setSponsors(currentSponsors => 
                currentSponsors.map(s => 
                    s.profile.principal.toString() === profile.principal.toString()
                        ? {
                            ...s,
                            data: {
                                ...s.data!,
                                allocations: Array.from(tokenStats.entries()).map(([token, stats]) => ({
                                    token,
                                    totalAllocated: stats.totalAllocated,
                                    totalClaimed: stats.totalClaimed
                                }))
                            }
                        }
                        : s
                )
            );
        } catch (err) {
            console.error('Error loading sponsor data:', err);
            setSponsors(currentSponsors => 
                currentSponsors.map(s => 
                    s.profile.principal.toString() === profile.principal.toString()
                        ? { ...s, isLoading: false, error: 'Failed to load sponsor data' }
                        : s
                )
            );
        }
    };

    const calculateUSDValue = (amount_e8s: bigint, tokenId: string): string => {
        const price = tokenUSDPrices[tokenId];
        if (!price) return '-';
        
        const token = tokens.find(t => t.canisterId === tokenId);
        if (!token?.metadata) return '-';
        
        const decimals = token.metadata.decimals ?? 8;
        const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
        const amountInWholeUnits = Number(amount_e8s) / Number(baseUnitMultiplier);
        const value = amountInWholeUnits * price;
        
        return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatDate = (timestamp: bigint): string => {
        // Convert nanoseconds to milliseconds by dividing by 1_000_000
        const milliseconds = Number(timestamp) / 1_000_000;
        return new Date(milliseconds).toLocaleString();
    };

    const toggleSponsor = (principalId: string) => {
        setExpandedSponsors(prev => {
            const newExpandedSponsors = new Set(prev);
            if (newExpandedSponsors.has(principalId)) {
                newExpandedSponsors.delete(principalId);
            } else {
                newExpandedSponsors.add(principalId);
            }
            return newExpandedSponsors;
        });
    };

    const toggleAchievement = (achievementId: string) => {
        const newExpandedAchievements = new Set(expandedAchievements);
        if (newExpandedAchievements.has(achievementId)) {
            newExpandedAchievements.delete(achievementId);
        } else {
            newExpandedAchievements.add(achievementId);
        }
        setExpandedAchievements(newExpandedAchievements);
    };

    const handleClaim = async (allocationId: string, tokenId: string, achievementName: string) => {
        try {
            if (claiming) return; // Prevent multiple claims at once
            setClaiming(allocationId);
            setClaimError(null);
            
            const amount = await allocationService.claimAndWithdrawAllocation(allocationId);
            
            // Update user claims
            const updatedClaims = await allocationService.getUserClaims();
            setUserClaims(updatedClaims);

            // Show success modal
            setClaimSuccessDetails({
                amount,
                tokenId,
                achievementName
            });
            setShowClaimSuccess(true);
        } catch (err: any) {
            setClaimError('Failed to claim reward: ' + (err.message || String(err)));
            console.error('Error claiming reward:', err);
        } finally {
            setClaiming(null);
        }
    };

    if (isInitialLoading) {
        return (
            <div className="sponsors-page">
                <div className="swap-box">
                    <div className="loading">Loading sponsors...</div>
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
                        <div className="sponsor-card" key={sponsor.profile.principal.toString()}>
                            <div 
                                className="sponsor-header" 
                                onClick={() => toggleSponsor(sponsor.profile.principal.toString())}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="header-content">
                                    <div className="sponsor-logo-cell">
                                        {sponsor.profile.logo_url[0] && sponsor.profile.logo_url[0].length > 0 ? (
                                            <img src={sponsor.profile.logo_url[0]} alt={sponsor.profile.name} className="sponsor-logo" />
                                        ) : (() => {
                                            const tokenLink = sponsor.profile.social_links.find(
                                                link => link.platform.toLowerCase() === 'token'
                                            );
                                            if (tokenLink) {
                                                const token = tokens.find(t => t.canisterId === tokenLink.url);
                                                if (token?.metadata?.hasLogo) {
                                                    return (
                                                        <img 
                                                            src={loadedLogos[tokenLink.url] || '/generic_token.svg'}
                                                            alt={token.metadata?.symbol || 'Token'} 
                                                            className="sponsor-logo"
                                                            onError={(e) => {
                                                                const img = e.target as HTMLImageElement;
                                                                img.src = token.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                                                            }}
                                                        />
                                                    );
                                                }
                                            }
                                            return <div className="sponsor-logo" />;
                                        })()}
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
                                            <div className="sponsor-usd-values">
                                                {sponsor.isLoading || !sponsor.data ? (
                                                    <FiLoader className="spinning" />
                                                ) : (
                                                    <>
                                                        <span>Total: ${sponsor.data.allocations.reduce((sum, allocation) => {
                                                            const usdValue = calculateUSDValue(allocation.totalAllocated, allocation.token);
                                                            return sum + (usdValue === '-' ? 0 : parseFloat(usdValue.replace('$', '')));
                                                        }, 0).toFixed(2)}</span>
                                                        {(() => {
                                                            const remaining = sponsor.data.allocations.reduce((sum, allocation) => {
                                                                const usdValue = calculateUSDValue(allocation.totalAllocated - allocation.totalClaimed, allocation.token);
                                                                return sum + (usdValue === '-' ? 0 : parseFloat(usdValue.replace('$', '')));
                                                            }, 0);
                                                            return remaining > 0 ? (
                                                                <span className="remaining-positive">Remaining: ${remaining.toFixed(2)}</span>
                                                            ) : null;
                                                        })()}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {sponsor.isLoading || !sponsor.data ? (
                                        <FiLoader className="spinning" />
                                    ) : (
                                        (() => {
                                            // Check all achievements for any yellow or green boxes
                                            const hasAvailableOrFuture = Object.entries(sponsor.data.achievementAllocations).some(([achievementId, state]) => 
                                                state.data?.some(alloc => 
                                                    (userAchievements.some(a => a.achievement_id === achievementId) &&
                                                    !userClaims.some(claim => claim.allocation.id === alloc.allocation.id) &&
                                                    alloc.claims.remaining_balance > BigInt(0)) ||
                                                    (!userAchievements.some(a => a.achievement_id === achievementId) &&
                                                    alloc.claims.remaining_balance > BigInt(0))
                                                )
                                            );
                                            
                                            // Check for any claimed boxes
                                            const hasClaimed = Object.entries(sponsor.data.achievementAllocations).some(([_, state]) => 
                                                state.data?.some(alloc => 
                                                    userClaims.some(claim => claim.allocation.id === alloc.allocation.id)
                                                )
                                            );

                                            // Only render if there are available, future, or claimed rewards
                                            if (!hasAvailableOrFuture && !hasClaimed) {
                                                return null;
                                            }

                                            return (
                                                <FiGift className={`sponsor-gift ${
                                                    Object.entries(sponsor.data.achievementAllocations).some(([achievementId, state]) => 
                                                        state.data?.some(alloc => 
                                                            userAchievements.some(a => a.achievement_id === achievementId) &&
                                                            !userClaims.some(claim => claim.allocation.id === alloc.allocation.id) &&
                                                            alloc.claims.remaining_balance > BigInt(0)
                                                        )
                                                    ) ? 'available' :
                                                    Object.entries(sponsor.data.achievementAllocations).some(([achievementId, state]) => 
                                                        state.data?.some(alloc => 
                                                            !userAchievements.some(a => a.achievement_id === achievementId) &&
                                                            alloc.claims.remaining_balance > BigInt(0)
                                                        )
                                                    ) ? 'future' :
                                                    'claimed'
                                                }`} />
                                            );
                                        })()
                                    )}
                                    <button className="expand-button">
                                        {sponsor.isLoading || (sponsor.data && sponsor.data.allocations.length === 0) ? (
                                            <FiLoader className="spinning" />
                                        ) : (
                                            expandedSponsors.has(sponsor.profile.principal.toString()) ? <FiChevronUp /> : <FiChevronDown />
                                        )}
                                    </button>
                                </div>
                                <div className="sponsor-header-progress">
                                    {sponsor.isLoading || (sponsor.data && sponsor.data.allocations.length === 0) ? (
                                        <div className="progress-bar-wrapper">
                                            <div className="progress-bar" style={{ width: '100%', opacity: '0.2' }} />
                                        </div>
                                    ) : sponsor.data ? (
                                        <div className="progress-bar-wrapper">
                                            {(() => {
                                                const totalPercentages = sponsor.data.allocations.reduce((sum, allocation) => {
                                                    const remaining = Number(allocation.totalAllocated - allocation.totalClaimed);
                                                    const total = Number(allocation.totalAllocated);
                                                    return sum + (remaining * 100 / total);
                                                }, 0);
                                                const averagePercentage = sponsor.data.allocations.length > 0 ? 
                                                    Math.max(0, Math.min(100, totalPercentages / sponsor.data.allocations.length)) : 0;
                                                
                                                return (
                                                    <div 
                                                        className="progress-bar" 
                                                        style={{ width: `${averagePercentage}%` }}
                                                        title={`${averagePercentage.toFixed(1)}% remaining`}
                                                    />
                                                );
                                            })()}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            {expandedSponsors.has(sponsor.profile.principal.toString()) && (
                                <>
                                    {sponsor.isLoading ? (
                                        <div className="sponsor-loading">
                                            <FiLoader className="spinner" />
                                            <span>Loading sponsor details...</span>
                                        </div>
                                    ) : sponsor.error ? (
                                        <div className="sponsor-error">
                                            {sponsor.error}
                                        </div>
                                    ) : sponsor.data && (
                                        <div className="sponsor-details">
                                            <div className="sponsor-stats">
                                                {sponsor.data.allocations.length === 0 ? (
                                                    <div className="token-stats">
                                                        <div className="token-stats-loading">
                                                            <FiLoader className="spinning" />
                                                            <span>Loading token stats...</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    sponsor.data.allocations.map((allocation, index) => {
                                                        const token = tokens.find(t => t.canisterId === allocation.token);
                                                        const claimPercentage = Number((allocation.totalClaimed * BigInt(100)) / allocation.totalAllocated);
                                                        const symbol = token?.metadata?.symbol || 'tokens';
                                                        const isDepleted = allocation.totalClaimed === allocation.totalAllocated;
                                                        return (
                                                            <div key={index} className="token-stats">
                                                                <div>
                                                                    <span>
                                                                        {formatTokenAmount(allocation.totalClaimed, allocation.token)} / {formatTokenAmount(allocation.totalAllocated, allocation.token)} {symbol}
                                                                        {loadingUSDPrices[allocation.token] ? (
                                                                            <FiLoader className="spinner" />
                                                                        ) : tokenUSDPrices[allocation.token] && (
                                                                            <>
                                                                                <span className="separator">•</span>
                                                                                <span className="usd-value">
                                                                                    {calculateUSDValue(allocation.totalClaimed, allocation.token)} / {calculateUSDValue(allocation.totalAllocated, allocation.token)}
                                                                                </span>
                                                                            </>
                                                                        )}
                                                                    </span>
                                                                    <span>{claimPercentage}% claimed</span>
                                                                </div>
                                                                <div className={`token-stats-progress ${isDepleted ? 'depleted' : ''}`}>
                                                                    <div 
                                                                        className="token-stats-progress-bar" 
                                                                        style={{ width: `${100 - claimPercentage}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="sponsor-details-inner">
                                                <p className="sponsor-description">{sponsor.profile.description}</p>
                                                {/* Social Links Section */}
                                                {sponsor.profile.social_links.length > 0 && (
                                                    <div className="social-links">
                                                        {sponsor.profile.social_links
                                                            .filter(link => link.platform.toLowerCase() !== 'token')
                                                            .map((link, index) => (
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

                                                {/* Token Section */}
                                                {sponsor.profile.social_links.find(link => link.platform.toLowerCase() === 'token') && (
                                                    <div className="sponsor-token">
                                                        {(() => {
                                                            const tokenLink = sponsor.profile.social_links.find(
                                                                link => link.platform.toLowerCase() === 'token'
                                                            );
                                                            if (!tokenLink) return null;
                                                            
                                                            const token = tokens.find(t => t.canisterId === tokenLink.url);
                                                            if (!token) return null;

                                                            return (
                                                                <>
                                                                    <h4>Project Token</h4>
                                                                    <div className="token-info">
                                                                        <div className="token-header">
                                                                            {token.metadata?.hasLogo && (
                                                                                <img 
                                                                                    src={loadedLogos[token.canisterId] || '/generic_token.svg'}
                                                                                    alt={token.metadata?.symbol || 'Token'} 
                                                                                    className="token-logo"
                                                                                    onError={(e) => {
                                                                                        const img = e.target as HTMLImageElement;
                                                                                        img.src = token.metadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                                                                                    }}
                                                                                />
                                                                            )}
                                                                            <div className="token-title">
                                                                                <span className="token-name">{token.metadata?.name || 'Unknown Token'}</span>
                                                                                <span className="token-symbol">{token.metadata?.symbol || 'UNKNOWN'}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="token-metadata">
                                                                            <div className="metadata-row">
                                                                                <span className="metadata-label">Standard</span>
                                                                                <span className="metadata-value">{token.metadata?.standard || 'Unknown'}</span>
                                                                            </div>
                                                                            <div className="metadata-row">
                                                                                <span className="metadata-label">Decimals</span>
                                                                                <span className="metadata-value">{token.metadata?.decimals || 0}</span>
                                                                            </div>
                                                                            <div className="metadata-row">
                                                                                <span className="metadata-label">Fee</span>
                                                                                <span className="metadata-value">
                                                                                    {token.metadata?.fee ? formatTokenAmount(token.metadata.fee, token.canisterId) : '0'} {token.metadata?.symbol || 'tokens'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="metadata-row">
                                                                                <span className="metadata-label">Canister</span>
                                                                                <span className="metadata-value monospace">{token.canisterId}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                                
                                                {/* Achievement Allocations Section */}
                                                <div className="achievement-allocations">
                                                    <h4>Sponsored Achievements</h4>
                                                    {sponsor.data && Object.entries(sponsor.data.achievementAllocations).map(([achievementId, achievementState]) => {
                                                        if (achievementState.isLoading) {
                                                            return (
                                                                <div key={achievementId} className="achievement-group">
                                                                    <div className="achievement-header">
                                                                        <div className="achievement-icon-wrapper">
                                                                            <FiLoader className="spinning" />
                                                                        </div>
                                                                        <div className="achievement-info">
                                                                            <h5>Loading achievement...</h5>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        if (achievementState.error) {
                                                            return (
                                                                <div key={achievementId} className="achievement-group">
                                                                    <div className="achievement-header">
                                                                        <div className="achievement-info">
                                                                            <h5 className="error-text">{achievementState.error}</h5>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }

                                                        const allocations = achievementState.data!;
                                                        // Calculate totals for all allocations of this achievement
                                                        const totalAllocated = allocations.reduce((sum, alloc) => 
                                                            sum + Number(alloc.allocation.token.total_amount_e8s), 0
                                                        );
                                                        const totalRemaining = allocations.reduce((sum, alloc) => 
                                                            sum + Number(alloc.claims.remaining_balance), 0
                                                        );
                                                        const remainingPercentage = (totalRemaining / totalAllocated) * 100;
                                                        const isDepleted = totalRemaining === 0;
                                                        const isExpanded = expandedAchievements.has(achievementId);

                                                        // Calculate total USD values
                                                        const totalUSDAllocated = allocations.reduce((sum, alloc) => {
                                                            const tokenId = alloc.allocation.token.canister_id.toString();
                                                            const price = tokenUSDPrices[tokenId];
                                                            if (!price) return sum;
                                                            
                                                            const token = tokens.find(t => t.canisterId === tokenId);
                                                            if (!token?.metadata) return sum;
                                                            
                                                            const decimals = token.metadata.decimals ?? 8;
                                                            const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
                                                            const amountInWholeUnits = Number(alloc.allocation.token.total_amount_e8s) / Number(baseUnitMultiplier);
                                                            return sum + (amountInWholeUnits * price);
                                                        }, 0);

                                                        const totalUSDRemaining = allocations.reduce((sum, alloc) => {
                                                            const tokenId = alloc.allocation.token.canister_id.toString();
                                                            const price = tokenUSDPrices[tokenId];
                                                            if (!price) return sum;
                                                            
                                                            const token = tokens.find(t => t.canisterId === tokenId);
                                                            if (!token?.metadata) return sum;
                                                            
                                                            const decimals = token.metadata.decimals ?? 8;
                                                            const baseUnitMultiplier = BigInt(10) ** BigInt(decimals);
                                                            const amountInWholeUnits = Number(alloc.claims.remaining_balance) / Number(baseUnitMultiplier);
                                                            return sum + (amountInWholeUnits * price);
                                                        }, 0);

                                                        const isLoadingAnyUSDPrice = allocations.some(alloc => 
                                                            loadingUSDPrices[alloc.allocation.token.canister_id.toString()]
                                                        );

                                                        return (
                                                            <div key={achievementId} className="achievement-group">
                                                                <div 
                                                                    className="achievement-header"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleAchievement(achievementId);
                                                                    }}
                                                                    style={{ cursor: 'pointer' }}
                                                                >
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
                                                                    </div>
                                                                    {(() => {
                                                                        // Check for any available rewards
                                                                        const hasAvailable = allocations.some(alloc => 
                                                                            userAchievements.some(a => a.achievement_id === achievementId) && 
                                                                            !userClaims.some(claim => claim.allocation.id === alloc.allocation.id) &&
                                                                            alloc.claims.remaining_balance > BigInt(0)
                                                                        );
                                                                        
                                                                        // Check for any future rewards
                                                                        const hasFuture = allocations.some(alloc => 
                                                                            !userAchievements.some(a => a.achievement_id === achievementId) &&
                                                                            alloc.claims.remaining_balance > BigInt(0)
                                                                        );

                                                                        // Check for any claimed rewards
                                                                        const hasClaimed = allocations.some(alloc => 
                                                                            userClaims.some(claim => claim.allocation.id === alloc.allocation.id)
                                                                        );

                                                                        // Only render if there are available, future, or claimed rewards
                                                                        if (!hasAvailable && !hasFuture && !hasClaimed) {
                                                                            return null;
                                                                        }

                                                                        return (
                                                                            <FiGift 
                                                                                className={`achievement-gift ${
                                                                                    hasAvailable ? `available ${allocations.some(alloc => claiming === alloc.allocation.id) ? 'claiming' : ''}` :
                                                                                    hasFuture ? 'future' :
                                                                                    'claimed'
                                                                                }`}
                                                                                onClick={hasAvailable ? (e) => {
                                                                                    e.stopPropagation();
                                                                                    const firstAvailableAlloc = allocations.find(alloc => 
                                                                                        userAchievements.some(a => a.achievement_id === achievementId) && 
                                                                                        !userClaims.some(claim => claim.allocation.id === alloc.allocation.id) &&
                                                                                        alloc.claims.remaining_balance > BigInt(0)
                                                                                    );
                                                                                    if (firstAvailableAlloc) {
                                                                                        handleClaim(
                                                                                            firstAvailableAlloc.allocation.id,
                                                                                            firstAvailableAlloc.allocation.token.canister_id.toString(),
                                                                                            firstAvailableAlloc.achievement.name
                                                                                        );
                                                                                    }
                                                                                } : undefined}
                                                                                style={hasAvailable ? { cursor: 'pointer' } : undefined}
                                                                            />
                                                                        );
                                                                    })()}
                                                                    <button
                                                                        className="expand-button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleAchievement(achievementId);
                                                                        }}
                                                                    >
                                                                        {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                                                                    </button>
                                                                    <div className="achievement-header-progress">
                                                                        {achievementState.isLoading ? (
                                                                            <div className="progress-bar" style={{ width: '100%', opacity: '0.2' }} />
                                                                        ) : (
                                                                            <div 
                                                                                className="progress-bar" 
                                                                                style={{ 
                                                                                    width: `${allocations.reduce((sum, alloc) => 
                                                                                        sum + (Number(alloc.claims.remaining_balance) * 100) / Number(alloc.allocation.token.total_amount_e8s), 
                                                                                        0
                                                                                    ) / allocations.length}%` 
                                                                                }} 
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {isExpanded && (
                                                                    <div className="allocation-list">
                                                                        <p className="achievement-description">{allocations[0].achievement.description}</p>
                                                                        <div className="achievement-criteria">
                                                                            <strong>How to earn:</strong> {allocations[0].achievement.criteria}
                                                                        </div>
                                                                        {allocations.map((alloc, index) => {
                                                                            const token = tokens.find(t => t.canisterId === alloc.allocation.token.canister_id.toString());
                                                                            const claimPercentage = Number((alloc.claims.total_claimed * BigInt(100)) / alloc.allocation.token.total_amount_e8s);
                                                                            return (
                                                                                <div key={index} className="allocation-item">
                                                                                    <div className="allocation-details">
                                                                                        <div className="allocation-amount">
                                                                                            <span>Total Allocated:</span>
                                                                                            <span>
                                                                                                {formatTokenAmount(alloc.allocation.token.total_amount_e8s, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'}
                                                                                                {loadingUSDPrices[alloc.allocation.token.canister_id.toString()] ? (
                                                                                                    <FiLoader className="spinner" />
                                                                                                ) : tokenUSDPrices[alloc.allocation.token.canister_id.toString()] && (
                                                                                                    <>
                                                                                                        <span className="separator">•</span>
                                                                                                        <span className="usd-value">
                                                                                                            {calculateUSDValue(alloc.allocation.token.total_amount_e8s, alloc.allocation.token.canister_id.toString())}
                                                                                                        </span>
                                                                                                    </>
                                                                                                )}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="allocation-claims">
                                                                                            <span>Claims:</span>
                                                                                            <span>
                                                                                                {formatTokenAmount(alloc.claims.total_claimed, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'} ({claimPercentage}%) by {alloc.claims.claim_count} users
                                                                                                {loadingUSDPrices[alloc.allocation.token.canister_id.toString()] ? (
                                                                                                    <FiLoader className="spinner" />
                                                                                                ) : tokenUSDPrices[alloc.allocation.token.canister_id.toString()] && (
                                                                                                    <>
                                                                                                        <span className="separator">•</span>
                                                                                                        <span className="usd-value">
                                                                                                            {calculateUSDValue(alloc.claims.total_claimed, alloc.allocation.token.canister_id.toString())}
                                                                                                        </span>
                                                                                                    </>
                                                                                                )}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="allocation-remaining">
                                                                                            <span>Remaining:</span>
                                                                                            <span>
                                                                                                {formatTokenAmount(alloc.claims.remaining_balance, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'}
                                                                                                {loadingUSDPrices[alloc.allocation.token.canister_id.toString()] ? (
                                                                                                    <FiLoader className="spinner" />
                                                                                                ) : tokenUSDPrices[alloc.allocation.token.canister_id.toString()] && (
                                                                                                    <>
                                                                                                        <span className="separator">•</span>
                                                                                                        <span className="usd-value">
                                                                                                            {calculateUSDValue(alloc.claims.remaining_balance, alloc.allocation.token.canister_id.toString())}
                                                                                                        </span>
                                                                                                    </>
                                                                                                )}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="allocation-range">
                                                                                            <span>Per User Range:</span>
                                                                                            <span>
                                                                                                {formatTokenAmount(alloc.allocation.token.per_user.min_e8s, alloc.allocation.token.canister_id.toString())} - {formatTokenAmount(alloc.allocation.token.per_user.max_e8s, alloc.allocation.token.canister_id.toString())} {token?.metadata?.symbol || 'tokens'}
                                                                                                {loadingUSDPrices[alloc.allocation.token.canister_id.toString()] ? (
                                                                                                    <FiLoader className="spinner" />
                                                                                                ) : tokenUSDPrices[alloc.allocation.token.canister_id.toString()] && (
                                                                                                    <>
                                                                                                        <span className="separator">•</span>
                                                                                                        <span className="usd-value">
                                                                                                            {calculateUSDValue(alloc.allocation.token.per_user.min_e8s, alloc.allocation.token.canister_id.toString())} - {calculateUSDValue(alloc.allocation.token.per_user.max_e8s, alloc.allocation.token.canister_id.toString())}
                                                                                                        </span>
                                                                                                    </>
                                                                                                )}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="allocation-status">
                                                                                            <span>
                                                                                                {userClaims.some(claim => claim.allocation.id === alloc.allocation.id) ? 'Claimed' :
                                                                                                alloc.claims.remaining_balance === BigInt(0) ? 'Depleted' :
                                                                                                userAchievements.some(a => a.achievement_id === achievementId) ? 'Available' :
                                                                                                'You Do Not Have This Achievement Yet'}
                                                                                            </span>
                                                                                            {(() => {
                                                                                                // Don't show icon if depleted
                                                                                                if (alloc.claims.remaining_balance === BigInt(0) && 
                                                                                                    !userClaims.some(claim => claim.allocation.id === alloc.allocation.id)) {
                                                                                                    return null;
                                                                                                }

                                                                                                return (
                                                                                                    <FiGift 
                                                                                                        className={`allocation-gift ${
                                                                                                            userClaims.some(claim => claim.allocation.id === alloc.allocation.id) ? 'claimed' :
                                                                                                            userAchievements.some(a => a.achievement_id === achievementId) ? `available ${claiming === alloc.allocation.id ? 'claiming' : ''}` :
                                                                                                            'future'
                                                                                                        }`}
                                                                                                        onClick={userAchievements.some(a => a.achievement_id === achievementId) && 
                                                                                                                !userClaims.some(claim => claim.allocation.id === alloc.allocation.id) ? 
                                                                                                            () => handleClaim(
                                                                                                                alloc.allocation.id,
                                                                                                                alloc.allocation.token.canister_id.toString(),
                                                                                                                allocations[0].achievement.name
                                                                                                            ) : undefined}
                                                                                                        style={userAchievements.some(a => a.achievement_id === achievementId) && 
                                                                                                               !userClaims.some(claim => claim.allocation.id === alloc.allocation.id) ? 
                                                                                                            { cursor: 'pointer' } : undefined}
                                                                                                    />
                                                                                                );
                                                                                            })()}
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
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <div className="sponsor-footer">
                                                    <span>Joined: {formatDate(sponsor.profile.created_at)}</span>
                                                    <span>Last active: {formatDate(sponsor.profile.updated_at)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {showClaimSuccess && claimSuccessDetails && (
                <ClaimSuccessModal
                    show={showClaimSuccess}
                    onClose={() => setShowClaimSuccess(false)}
                    amount={claimSuccessDetails.amount}
                    tokenId={claimSuccessDetails.tokenId}
                    achievementName={claimSuccessDetails.achievementName}
                />
            )}

            {claimError && (
                <div className="error-message">
                    {claimError}
                </div>
            )}
        </div>
    );
}; 