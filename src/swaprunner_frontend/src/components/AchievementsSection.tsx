import React, { useState, useEffect } from 'react';
import { FiAward, FiRefreshCw, FiChevronDown, FiChevronUp, FiLoader, FiGift, FiX, FiCheck, FiPackage } from 'react-icons/fi';
import { backendService } from '../services/backend';
import { CollapsibleSection } from '../pages/Me';
import '../styles/AchievementsSection.css';
import '../styles/ClaimSuccessModal.css';
import { allocationService } from '../services/allocation';
import { Allocation } from '../services/allocation';
import { formatTokenAmount } from '../utils/format';
import { useTokens } from '../contexts/TokenContext';
import { tokenService } from '../services/token';
import { useClaims } from '../contexts/ClaimContext';
import { useAchievements } from '../contexts/AchievementContext';

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

interface ClaimableReward {
    achievement_id: string;
    allocation_id: string;
    token_canister_id: string;
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
    defaultExpanded: boolean;
}

interface ClaimSuccessModalProps {
    show: boolean;
    onClose: () => void;
    amount: bigint;
    tokenId: string;
    achievementName: string;
}

// Add this array near the top of the file, after imports
const CELEBRATION_WORDS = [
    "Awesome",
    "Amazing",
    "Fantastic",
    "Excellent",
    "Wonderful",
    "Brilliant",
    "Incredible",
    "Superb",
    "Outstanding",
    "Magnificent",
    "Splendid",
    "Epic",
    "Stellar",
    "Phenomenal",
    "Marvelous",
    "Spectacular",
    "Terrific",
    "Rad",
    "Sweet",
    "Perfect",
    "Legendary",
    "Glorious",
    "Divine",
    "Sublime",
    "Remarkable"
];

// Add these color constants after the CELEBRATION_WORDS array
const CONFETTI_COLORS = [
    '#ffd700', // Gold
    '#ff3e41', // Red
    '#3498db', // Blue
    '#2ecc71', // Green
    '#e67e22', // Orange
    '#9b59b6', // Purple
    '#f1c40f', // Yellow
    '#e056fd', // Pink
    '#686de0', // Indigo
    '#badc58', // Lime
];

const CONFETTI_SHAPES = ['square', 'circle', 'triangle'] as const;

// Add this constant after the CONFETTI_SHAPES array
const GLITTER_PROBABILITY = 1; //0.5; // 50% chance of glitter appearing

// Add these glitter-related constants
const GLITTER_COLORS = [
    'rgba(255, 215, 0, 0.8)',  // Gold
    'rgba(255, 255, 255, 0.8)', // White
    'rgba(255, 192, 203, 0.8)', // Pink
    'rgba(135, 206, 235, 0.8)', // Sky Blue
];

const GLITTER_COUNT = 30; // Number of glitter particles

// Add after GLITTER_COUNT constant
const BALLOON_PROBABILITY = 1; //0.5; // 50% chance of balloons appearing
const BALLOON_COUNT = 12; // Number of balloons
const BALLOON_COLORS = [
    '#ff6b6b', // Red
    '#4ecdc4', // Teal
    '#45b7d1', // Light Blue
    '#96ceb4', // Mint
    '#ffeead', // Light Yellow
    '#ff9999', // Pink
    '#87ceeb', // Sky Blue
    '#d4a5a5', // Mauve
];

// Add fireworks constants
const FIREWORK_PROBABILITY = 1; //0.5; // 50% chance of fireworks appearing
const FIREWORK_COLORS = [
    '#ff0000', // Red
    '#ffd700', // Gold
    '#00ff00', // Green
    '#0000ff', // Blue
    '#ff00ff', // Magenta
    '#00ffff', // Cyan
    '#ff8c00', // Dark Orange
    '#ff1493', // Deep Pink
];

interface ConfettiProps {
    count?: number;
}

const Confetti: React.FC<ConfettiProps> = ({ count = 50 }) => {
    const [confetti, setConfetti] = useState<Array<{
        id: number;
        color: string;
        shape: typeof CONFETTI_SHAPES[number];
        x: number;
        fallDuration: number;
        shakeDistance: number;
        delay: number;
    }>>([]);

    useEffect(() => {
        let batchCount = 0;
        const maxBatches = 20; // More batches for smoother reduction
        const batchInterval = 500; // Half second between batches
        
        const createConfettiBatch = (batchId: number) => {
            // Exponential decay of particle count
            const progress = batchId / maxBatches;
            const batchSize = Math.max(
                1, // Ensure at least 1 piece
                Math.floor(count * Math.pow(0.85, batchId)) // Reduce by 15% each batch
            );
            
            const pieces = Array.from({ length: batchSize }, (_, i) => ({
                id: batchId * count + i,
                color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
                shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
                x: Math.random() * 100,
                fallDuration: 2 + Math.random() * 2,
                shakeDistance: 15 + Math.random() * 30,
                delay: Math.random() * 0.5,
            }));

            setConfetti(prev => [...prev, ...pieces]);
        };

        // Create initial batch
        createConfettiBatch(0);

        // Create subsequent batches
        const intervalId = setInterval(() => {
            batchCount++;
            if (batchCount < maxBatches) {
                createConfettiBatch(batchCount);
            } else {
                clearInterval(intervalId);
            }
        }, batchInterval);

        // Clean up after all batches have fallen
        const cleanupTimer = setTimeout(() => {
            setConfetti([]);
        }, (maxBatches * batchInterval) + 4000);

        return () => {
            clearInterval(intervalId);
            clearTimeout(cleanupTimer);
        };
    }, [count]);

    return (
        <div className="confetti-container">
            {confetti.map((piece) => {
                let shape;
                switch (piece.shape) {
                    case 'circle':
                        shape = <div style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            background: piece.color
                        }} />;
                        break;
                    case 'triangle':
                        shape = <div style={{
                            width: 0,
                            height: 0,
                            borderLeft: '5px solid transparent',
                            borderRight: '5px solid transparent',
                            borderBottom: `10px solid ${piece.color}`
                        }} />;
                        break;
                    default: // square
                        shape = <div style={{
                            width: '100%',
                            height: '100%',
                            background: piece.color
                        }} />;
                }

                return (
                    <div
                        key={piece.id}
                        className="confetti"
                        style={{
                            left: `${piece.x}%`,
                            '--fall-duration': `${piece.fallDuration}s`,
                            '--shake-distance': `${piece.shakeDistance}px`,
                            animationDelay: `${piece.delay}s`
                        } as React.CSSProperties}
                    >
                        {shape}
                    </div>
                );
            })}
        </div>
    );
};

interface GlitterProps {
    count?: number;
}

const Glitter: React.FC<GlitterProps> = ({ count = GLITTER_COUNT }) => {
    const [particles] = useState(() => 
        Array.from({ length: count }, () => ({
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 2 + Math.random() * 4,
            color: GLITTER_COLORS[Math.floor(Math.random() * GLITTER_COLORS.length)],
            duration: 1 + Math.random() * 2,
            delay: Math.random() * 2
        }))
    );

    return (
        <div className="glitter-container">
            {particles.map((particle, i) => (
                <div
                    key={i}
                    className="glitter-particle"
                    style={{
                        left: `${particle.x}%`,
                        top: `${particle.y}%`,
                        width: `${particle.size}px`,
                        height: `${particle.size}px`,
                        backgroundColor: particle.color,
                        animation: `glitter ${particle.duration}s ${particle.delay}s infinite`
                    }}
                />
            ))}
        </div>
    );
};

interface BalloonState {
    x: number;
    y: number;
    delay: number;
    duration: number;
    size: number;
    color: string;
    swayAmount: number;
    isPopped: boolean;
    popScale: number;
    depth: number;
    depthOffset: number;
}

interface FireworkParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    alpha: number;
}

interface FireworksProps {
    count?: number;
}

const Fireworks: React.FC<FireworksProps> = ({ count = 8 }) => {
    const [fireworks, setFireworks] = useState<{
        id: number;
        particles: FireworkParticle[];
        x: number;
        targetY: number;
        launched: boolean;
    }[]>([]);

    useEffect(() => {
        // Create initial fireworks
        const initialFireworks = Array.from({ length: count }, (_, i) => ({
            id: i,
            particles: [],
            x: 20 + Math.random() * 60, // Random x position (20-80%)
            targetY: 30 + Math.random() * 40, // Random target height (30-70%)
            launched: false
        }));
        setFireworks(initialFireworks);

        // Launch fireworks sequence
        const launchInterval = setInterval(() => {
            setFireworks(prev => {
                const nextFirework = prev.findIndex(f => !f.launched);
                if (nextFirework === -1) return prev;

                return prev.map((firework, i) => {
                    if (i !== nextFirework) return firework;

                    // Create explosion particles
                    const particles: FireworkParticle[] = Array.from({ length: 45 }, () => {
                        const angle = Math.random() * Math.PI * 2;
                        const velocity = 1 + Math.random() * 1.5; // Reduced velocity for slower movement
                        return {
                            x: firework.x,
                            y: firework.targetY,
                            vx: Math.cos(angle) * velocity,
                            vy: Math.sin(angle) * velocity,
                            color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
                            size: 4 + Math.random() * 4, // Increased particle size
                            alpha: 1
                        };
                    });

                    return { ...firework, particles, launched: true };
                });
            });
        }, 400); // Slightly longer delay between launches

        // Animate particles
        const animationFrame = setInterval(() => {
            setFireworks(prev => prev.map(firework => ({
                ...firework,
                particles: firework.particles.map(particle => ({
                    ...particle,
                    x: particle.x + particle.vx * 0.7, // Slowed down horizontal movement
                    y: particle.y + particle.vy * 0.7, // Slowed down vertical movement
                    vy: particle.vy + 0.05, // Reduced gravity effect
                    alpha: particle.alpha * 0.99 // Slower fade out
                })).filter(p => p.alpha > 0.15) // Keep particles visible longer
            })));
        }, 1000 / 60); // 60fps

        // Cleanup
        return () => {
            clearInterval(launchInterval);
            clearInterval(animationFrame);
        };
    }, [count]);

    return (
        <div className="fireworks-container">
            {fireworks.map(firework => (
                <div key={firework.id} className="firework">
                    {/* Trail effect */}
                    {!firework.launched && (
                        <div 
                            className="firework-trail"
                            style={{
                                left: `${firework.x}%`,
                                height: `${firework.targetY}%`,
                                animation: `launch 0.4s ease-out forwards`
                            }}
                        />
                    )}
                    {/* Explosion particles */}
                    {firework.particles.map((particle, i) => (
                        <div
                            key={i}
                            className="firework-particle"
                            style={{
                                left: `${particle.x}%`,
                                top: `${particle.y}%`,
                                width: `${particle.size}px`,
                                height: `${particle.size}px`,
                                backgroundColor: particle.color,
                                opacity: particle.alpha
                            }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
};

export const ClaimSuccessModal: React.FC<ClaimSuccessModalProps> = ({ show, onClose, amount, tokenId, achievementName }) => {
    const { tokens } = useTokens();
    const tokenMetadata = tokens.find(t => t.canisterId === tokenId)?.metadata;
    const [isOpen, setIsOpen] = useState(false);
    const [celebrationWord] = useState(() => 
        CELEBRATION_WORDS[Math.floor(Math.random() * CELEBRATION_WORDS.length)]
    );
    const [showGlitter] = useState(() => Math.random() < GLITTER_PROBABILITY);
    const [showBalloons] = useState(() => Math.random() < BALLOON_PROBABILITY);
    const [showFireworks] = useState(() => Math.random() < FIREWORK_PROBABILITY);
    const [balloons, setBalloons] = useState<BalloonState[]>([]);
    const [tokenLogo, setTokenLogo] = useState<string | null>(null);

    useEffect(() => {
        if (tokenId) {
            if (tokenId === 'ryjl3-tyaaa-aaaaa-aaaba-cai' || tokenMetadata?.symbol === 'ICP') {
                setTokenLogo('/icp_symbol.svg');
            } else if (tokenMetadata?.hasLogo) {
                tokenService.getTokenLogo(tokenId).then(logo => {
                    if (logo) {
                        setTokenLogo(logo);
                    }
                }).catch(console.error);
            }
        }
    }, [tokenId, tokenMetadata]);

    const handlePop = (index: number) => {
        console.log('Modal handlePop called with index:', index);
        setBalloons(prev => {
            console.log('Current modal balloons state:', prev);
            const newBalloons = prev.map((balloon, i) => {
                if (i === index) {
                    console.log('Popping modal balloon:', i);
                    return { ...balloon, isPopped: true };
                }
                return balloon;
            });
            console.log('New modal balloons state:', newBalloons);
            return newBalloons;
        });
    };

    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => setIsOpen(true), 1000);
            return () => clearTimeout(timer);
        }
    }, [show]);

    useEffect(() => {
        if (!showBalloons) return;

        let batchCount = 0;
        const maxBatches = 15;
        const batchInterval = 800;
        
        const createBalloonBatch = (batchId: number) => {
            const batchSize = Math.max(
                1,
                Math.floor(BALLOON_COUNT * Math.pow(0.85, batchId))
            );
            
            const newBalloons = Array.from({ length: batchSize }, () => {
                const depth = Math.random();
                const baseSize = 15 + (depth * 65);
                
                return {
                    x: 10 + Math.random() * 80,
                    y: 0,
                    delay: batchId * (batchInterval / 1000) + Math.random() * 0.5,
                    duration: 12 - (depth * 6), // Larger balloons (higher depth) move faster
                    size: baseSize,
                    color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
                    swayAmount: 15 + (depth * 35),
                    isPopped: false,
                    popScale: 1,
                    depth,
                    depthOffset: depth * 200 - 100
                };
            });

            setBalloons(prev => [...prev, ...newBalloons]);
        };

        createBalloonBatch(0);

        const intervalId = setInterval(() => {
            batchCount++;
            if (batchCount < maxBatches) {
                createBalloonBatch(batchCount);
            } else {
                clearInterval(intervalId);
            }
        }, batchInterval);

        const cleanupTimer = setTimeout(() => {
            setBalloons([]);
        }, (maxBatches * batchInterval) + 15000);

        return () => {
            clearInterval(intervalId);
            clearTimeout(cleanupTimer);
        };
    }, [showBalloons]);

    if (!show) return null;

    // Create sparkle elements
    const sparkles = Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * 360;
        const delay = (i / 12) * 1.5;
        return (
            <div
                key={i}
                className="sparkle"
                style={{
                    left: `${50 + 40 * Math.cos(angle * Math.PI / 180)}%`,
                    top: `${50 + 40 * Math.sin(angle * Math.PI / 180)}%`,
                    animationDelay: `${delay}s`
                }}
            />
        );
    });

    return (
        <div className="claim-success-overlay" onClick={(e) => e.stopPropagation()}>
            <Confetti />
            {showGlitter && <Glitter />}
            {/* Small balloons container (before modal) */}
            {showBalloons && (
                <div className="balloon-container">
                    {balloons
                        .filter(balloon => balloon.size <= 47.5)
                        .map((balloon, i) => {
                            const zIndex = 995 + Math.floor((balloon.size - 15) / 6.5);
                            const shadowIntensity = 0.1 + (balloon.size / 160);
                            
                            return (
                                <div
                                    key={`small-${i}`}
                                    className={`balloon ${balloon.isPopped ? 'popped' : ''}`}
                                    style={{
                                        position: 'absolute',
                                        left: `${balloon.x}%`,
                                        bottom: '-100px',
                                        width: `${balloon.size}px`,
                                        height: `${balloon.size * 1.2}px`,
                                        backgroundColor: balloon.color,
                                        '--delay': `${balloon.delay}s`,
                                        '--duration': `${balloon.duration}s`,
                                        '--depth-offset': `${balloon.depthOffset}px`,
                                        zIndex,
                                        boxShadow: `inset -${2 + balloon.size/20}px -${2 + balloon.size/20}px ${5 + balloon.size/8}px rgba(0,0,0,${shadowIntensity})`
                                    } as React.CSSProperties}
                                    onClick={() => handlePop(i)}
                                >
                                    <div 
                                        className="balloon-string"
                                        style={{
                                            height: `${balloon.size * 1.5}px`,
                                            opacity: 0.3 + (balloon.size / 160)
                                        }}
                                    />
                                </div>
                            );
                        })}
                </div>
            )}
            <div className="claim-success-modal" onClick={e => e.stopPropagation()}>
                <div className="claim-success-content">
                    <div className="claim-success-icon-wrapper">
                        <div className="sparkles">{sparkles}</div>
                        <div className={`claim-success-icon ${isOpen ? 'open' : 'closed'}`}>
                            <FiGift style={{ opacity: isOpen ? 0 : 1 }} />
                        </div>
                        <div className={`claim-success-icon ${isOpen ? 'closed' : 'open'}`}>
                            {tokenLogo ? (
                                <img 
                                    src={tokenLogo} 
                                    alt={tokenMetadata?.symbol || 'Token'} 
                                    className="token-logo"
                                    onError={(e) => {
                                        const img = e.target as HTMLImageElement;
                                        img.src = tokenMetadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                                    }}
                                />
                            ) : (
                                <div className="token-symbol">
                                    {tokenMetadata?.symbol || '?'}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="claim-success-text">
                        <div className="claim-success-title">Congratulations!</div>
                        <div className="claim-success-amount">
                            You received {formatTokenAmount(amount, tokenId)} {tokenMetadata?.symbol || 'tokens'} for achieving "{achievementName}"!
                        </div>
                    </div>
                    <button className="claim-success-close-button" onClick={onClose}>
                        {celebrationWord}!
                    </button>
                </div>
            </div>
            {/* Large balloons container (after modal) */}
            {showBalloons && (
                <div className="balloon-container">
                    {balloons
                        .filter(balloon => balloon.size > 47.5)
                        .map((balloon, i) => {
                            const zIndex = 1100 + Math.floor((balloon.size - 47.5) / 3.25);
                            const shadowIntensity = 0.1 + (balloon.size / 160);
                            
                            return (
                                <div
                                    key={`large-${i}`}
                                    className={`balloon ${balloon.isPopped ? 'popped' : ''}`}
                                    style={{
                                        position: 'absolute',
                                        left: `${balloon.x}%`,
                                        bottom: '-100px',
                                        width: `${balloon.size}px`,
                                        height: `${balloon.size * 1.2}px`,
                                        backgroundColor: balloon.color,
                                        '--delay': `${balloon.delay}s`,
                                        '--duration': `${balloon.duration}s`,
                                        '--depth-offset': `${balloon.depthOffset}px`,
                                        zIndex,
                                        boxShadow: `inset -${2 + balloon.size/20}px -${2 + balloon.size/20}px ${5 + balloon.size/8}px rgba(0,0,0,${shadowIntensity})`
                                    } as React.CSSProperties}
                                    onClick={() => handlePop(i + balloons.filter(b => b.size <= 47.5).length)}
                                >
                                    <div 
                                        className="balloon-string"
                                        style={{
                                            height: `${balloon.size * 1.5}px`,
                                            opacity: 0.3 + (balloon.size / 160)
                                        }}
                                    />
                                </div>
                            );
                        })}
                </div>
            )}
            {showFireworks && <Fireworks />}
        </div>
    );
};

interface ClaimSuccess {
    amount: bigint;
    tokenId: string;
    achievementName: string;
}

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, details, formatDate, onClaimSuccess, defaultExpanded }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [availableClaims, setAvailableClaims] = useState<ClaimableReward[]>([]);
    const [claimedRewards, setClaimedRewards] = useState<{
        allocation: Allocation;
        claim: {
            allocation_id: string;
            user: string;
            amount_e8s: bigint;
            claimed_at: bigint;
        };
    }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claimSuccess, setClaimSuccess] = useState<ClaimSuccess | null>(null);
    const [claiming, setClaiming] = useState<string | null>(null);
    const { tokens } = useTokens();

    // Load rewards data when component mounts
    useEffect(() => {
        loadRewards();
    }, []);

    // Refresh rewards when expanded
    useEffect(() => {
        if (isExpanded) {
            loadRewards();
        }
    }, [isExpanded]);

    const loadRewards = async () => {
        try {
            setLoading(true);
            console.log('Loading rewards for achievement:', achievement.achievement_id);
            
            // Load both available and claimed rewards in parallel
            const [claims, userClaims] = await Promise.all([
                allocationService.getAvailableClaims(),
                allocationService.getUserClaims()
            ]);
            
            // Filter available claims for this achievement
            const filteredClaims = claims.filter(claim => claim.achievement_id === achievement.achievement_id);
            setAvailableClaims(filteredClaims);
            
            // Filter claimed rewards for this achievement
            const filteredClaimedRewards = userClaims.filter(claim => claim.allocation.achievement_id === achievement.achievement_id);
            setClaimedRewards(filteredClaimedRewards);
            
            console.log('Filtered available claims:', filteredClaims);
            console.log('Filtered claimed rewards:', filteredClaimedRewards);
        } catch (err: any) {
            console.error('Error in loadRewards:', err);
            setError('Failed to load rewards: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleClaim = async (allocationId: string, tokenId: string) => {
        try {
            if (claiming) return; // Prevent multiple claims at once
            setClaiming(allocationId);
            setError(null);
            
            const claimedAmount = await allocationService.claimAndWithdrawAllocation(allocationId);
            
            // Show success modal
            setClaimSuccess({
                amount: claimedAmount,
                tokenId: tokenId,
                achievementName: details.name
            });
        } catch (err: any) {
            setError('Failed to claim reward: ' + (err.message || String(err)));
            console.error('Error claiming reward:', err);
        } finally {
            setClaiming(null);
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
                    <h3>
                        {details.name}
                        {availableClaims.length > 0 && (
                            <FiGift 
                                className={`small-gift ${claiming === availableClaims[0].allocation_id ? 'claiming' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const firstClaim = availableClaims[0];
                                    handleClaim(firstClaim.allocation_id, firstClaim.token_canister_id.toString());
                                }}
                                role="button"
                                title="Click to claim first available reward"
                            />
                        )}
                    </h3>
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
                        <div className="achievement-criteria">
                            <h5>How to Earn</h5>
                            <p>{details.criteria}</p>
                        </div>
                        <div className="achievement-details-date">
                            Earned on {formatDate(achievement.discovered_at)}
                        </div>

                        {/* Claimed Rewards Section */}
                        {claimedRewards.length > 0 && (
                            <div className="achievement-rewards claimed">
                                <h4>Claimed Rewards</h4>
                                {claimedRewards.map((reward, index) => {
                                    const token = tokens.find(t => t.canisterId === reward.allocation.token.canister_id.toString());
                                    return (
                                        <div key={`claimed-${index}`} className="reward-item claimed">
                                            <div className="reward-amount">
                                                {formatTokenAmount(reward.claim.amount_e8s, token?.canisterId || '')} {token?.metadata?.symbol || 'tokens'}
                                            </div>
                                            <div className="reward-date">
                                                Claimed on {formatDate(Number(reward.claim.claimed_at))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        
                        {/* Available Rewards Section */}
                        {availableClaims.length > 0 && (
                            <div className="achievement-rewards available">
                                <h4>Available Rewards</h4>
                                {loading ? (
                                    <div className="rewards-loading">
                                        <FiLoader className="spinning" /> Loading rewards...
                                    </div>
                                ) : error ? (
                                    <div className="error-message">{error}</div>
                                ) : (
                                    <div className="rewards-list">
                                        {availableClaims.map((claim) => {
                                            const allocation = tokens.find(t => t.canisterId === claim.token_canister_id.toString());
                                            return (
                                                <div key={claim.allocation_id} className="reward-item">
                                                    <div className="reward-info">
                                                        <div 
                                                            className={`reward-icon has-reward ${claiming === claim.allocation_id ? 'claiming' : ''}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleClaim(claim.allocation_id, claim.token_canister_id.toString());
                                                            }}
                                                            role="button"
                                                            title="Click to claim reward"
                                                        >
                                                            <FiGift />
                                                        </div>
                                                        <div className="reward-details">
                                                            <span className="reward-amount">
                                                                {claim.claimable_amount.min_e8s === claim.claimable_amount.max_e8s ? (
                                                                    formatTokenAmount(claim.claimable_amount.min_e8s, claim.token_canister_id.toString())
                                                                ) : (
                                                                    `${formatTokenAmount(claim.claimable_amount.min_e8s, claim.token_canister_id.toString())} - ${formatTokenAmount(claim.claimable_amount.max_e8s, claim.token_canister_id.toString())}`
                                                                )} {allocation?.metadata?.symbol || ' tokens'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="claim-button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleClaim(claim.allocation_id, claim.token_canister_id.toString());
                                                        }}
                                                        disabled={claiming !== null}
                                                    >
                                                        {claiming === claim.allocation_id ? (
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
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
            {claimSuccess && (
                <ClaimSuccessModal
                    show={true}
                    onClose={() => {
                        setClaimSuccess(null);
                        // Reload rewards after modal is closed
                        loadRewards();
                        if (onClaimSuccess) {
                            onClaimSuccess();
                        }
                    }}
                    amount={claimSuccess.amount}
                    tokenId={claimSuccess.tokenId}
                    achievementName={claimSuccess.achievementName}
                />
            )}
        </div>
    );
};

export const AchievementsSection: React.FC = () => {
    const [achievements, setAchievements] = useState<UserAchievement[]>([]);
    const [achievementDetails, setAchievementDetails] = useState<Record<string, Achievement>>({});
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claiming, setClaiming] = useState<string | null>(null);
    const { availableClaims } = useClaims();
    const { refreshAchievements } = useAchievements();

    const loadAchievements = async () => {
        try {
            setLoading(true);
            setError(null);
            const actor = await backendService.getActor();
            
            // Get user's achievements and available claims in parallel
            const [achievements, claims] = await Promise.all([
                actor.get_user_achievements(),
                allocationService.getAvailableClaims()
            ]);
            
            console.log('Loaded achievements:', achievements);
            setAchievements(achievements);

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

    // Update useEffect to use refreshAchievements
    useEffect(() => {
        const init = async () => {
            await refreshAchievements();
            await loadAchievements();
        };
        init();
    }, [refreshAchievements]);

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

    const handleClaim = async (allocationId: string, tokenId: string) => {
        if (claiming) return; // Prevent multiple claims at once
        
        try {
            setClaiming(allocationId);
            const result = await allocationService.claimAndWithdrawAllocation(allocationId);
            
            if (result) {
                // Refresh the achievements and available claims
                await loadAchievements();
            }
        } catch (error) {
            console.error('Failed to claim reward:', error);
        } finally {
            setClaiming(null);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(Number(timestamp) / 1_000_000).toLocaleString();
    };

    const achievementsContent = (
        <div className="achievements-content">
            <div className="achievements-actions">
                <button 
                    className="refresh-button" 
                    onClick={loadAchievements}
                    disabled={loading}
                >
                    <FiRefreshCw className={loading ? 'spinning' : ''} />
                    {loading ? 'Refreshing...' : 'Refresh List'}
                </button>
                <button 
                    className="refresh-button" 
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
                    {achievements.length === 0 ? (
                        <div className="no-achievements">
                            No achievements yet. Keep trading to earn some!
                        </div>
                    ) : (
                        achievements.map(achievement => {
                            const details = achievementDetails[achievement.achievement_id];
                            if (!details) return null;
                            
                            // Check if this achievement has any available claims
                            const hasRewards = availableClaims.some(
                                claim => claim.achievement_id === achievement.achievement_id
                            );
                            
                            return (
                                <AchievementCard
                                    key={achievement.achievement_id}
                                    achievement={achievement}
                                    details={details}
                                    formatDate={formatDate}
                                    onClaimSuccess={loadAchievements}
                                    defaultExpanded={hasRewards} // Auto-expand if has rewards
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
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Achievements
                    {availableClaims.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <FiGift 
                                className={`small-gift ${claiming ? 'claiming' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (availableClaims.length > 0) {
                                        const firstClaim = availableClaims[0];
                                        handleClaim(firstClaim.allocation_id, firstClaim.token_canister_id.toString());
                                    }
                                }}
                                role="button"
                                title="Click to claim first available reward"
                            />
                            <span style={{ 
                                fontSize: '0.85em', 
                                opacity: 0.9,
                                color: '#FFD700'
                            }}>
                                × {availableClaims.length}
                            </span>
                        </div>
                    )}
                </div>
            }
            icon={<FiAward />} 
            defaultExpanded={availableClaims.length > 0}
        >
            {achievementsContent}
        </CollapsibleSection>
    );
}; 