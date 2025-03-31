import React, { useState, useEffect } from 'react';
import { FiAward, FiRefreshCw, FiChevronDown, FiChevronUp, FiLoader, FiGift, FiX, FiCheck, FiPackage } from 'react-icons/fi';
import { backendService } from '../services/backend';
import { CollapsibleSection } from '../pages/Me';
import '../styles/AchievementsSection.css';
import '../styles/ClaimSuccessModal.css';
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

interface ConfettiProps {
    count?: number;
}

const Confetti: React.FC<ConfettiProps> = ({ count = 150 }) => {
    const [confetti, setConfetti] = useState<Array<{
        id: number;
        color: string;
        shape: typeof CONFETTI_SHAPES[number];
        x: number;
        fallDuration: number;
        shakeDistance: number;
    }>>([]);

    useEffect(() => {
        // Create confetti pieces
        const pieces = Array.from({ length: count }, (_, i) => ({
            id: i,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            shape: CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)],
            x: Math.random() * 100, // Random starting X position (0-100%)
            fallDuration: 2 + Math.random() * 2, // Random fall duration (2-4s)
            shakeDistance: 15 + Math.random() * 30, // Random shake distance (15-45px)
        }));
        setConfetti(pieces);

        // Clean up after longest possible animation
        const timer = setTimeout(() => {
            setConfetti([]);
        }, 4000);

        return () => clearTimeout(timer);
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
                            '--shake-distance': `${piece.shakeDistance}px`
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

// Add this interface before the Balloon component
interface BalloonState {
    x: number;
    delay: number;
    duration: number;
    size: number;
    color: string;
    swayAmount: number;
    isPopped: boolean;
    popScale: number;
}

interface BalloonProps {
    count?: number;
}

const Balloon: React.FC<BalloonProps> = ({ count = BALLOON_COUNT }) => {
    const [balloons, setBalloons] = useState<BalloonState[]>(() => 
        Array.from({ length: count }, () => ({
            x: 10 + Math.random() * 80,
            delay: Math.random() * 1,
            duration: 6 + Math.random() * 2,
            size: 30 + Math.random() * 20,
            color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
            swayAmount: 30 + Math.random() * 40,
            isPopped: false,
            popScale: 1
        }))
    );

    const popBalloon = (index: number) => {
        console.log('Popping balloon:', index);
        if (balloons[index].isPopped) return;
        console.log('Popping balloon found:', index);

        // Play pop sound
        //const audio = new Audio('/pop.mp3');
        //audio.volume = 0.4;
        //audio.play().catch(() => {}); // Ignore errors if sound can't play

        // Create mini confetti burst
        const confettiCount = 10;
        const confettiColors = [balloons[index].color, '#ffffff'];
        
        // Update balloon state
        setBalloons(prev => prev.map((balloon, i) => 
            i === index ? { ...balloon, isPopped: true } : balloon
        ));

        // Create particles at balloon position
        const balloon = document.querySelector(`[data-balloon-index="${index}"]`);
        if (balloon) {
            const rect = balloon.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Create particle elements
            for (let i = 0; i < 12; i++) {
                const particle = document.createElement('div');
                const angle = (i / 12) * Math.PI * 2;
                const velocity = 2 + Math.random() * 2;
                const size = 4 + Math.random() * 4;

                particle.className = 'balloon-particle';
                particle.style.backgroundColor = confettiColors[Math.floor(Math.random() * confettiColors.length)];
                particle.style.width = `${size}px`;
                particle.style.height = `${size}px`;
                particle.style.left = `${centerX}px`;
                particle.style.top = `${centerY}px`;
                particle.style.transform = `translate(-50%, -50%)`;

                document.body.appendChild(particle);

                // Animate particle
                const animation = particle.animate([
                    { 
                        transform: 'translate(-50%, -50%) scale(1)',
                        opacity: 1 
                    },
                    { 
                        transform: `translate(
                            calc(-50% + ${Math.cos(angle) * 100 * velocity}px), 
                            calc(-50% + ${Math.sin(angle) * 100 * velocity}px)
                        ) scale(0)`,
                        opacity: 0 
                    }
                ], {
                    duration: 500,
                    easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
                });

                // Clean up particle after animation
                animation.onfinish = () => particle.remove();
            }
        }
    };

    return (
        <div className="balloon-container" onClick={e => e.stopPropagation()}>
            {balloons.map((balloon, i) => {
                const stringLength = balloon.size * 1.5;
                return (
                    <div
                        key={i}
                        data-balloon-index={i}
                        className={`balloon ${balloon.isPopped ? 'popped' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            popBalloon(i);
                        }}
                        style={{
                            left: `${balloon.x}%`,
                            width: `${balloon.size}px`,
                            height: `${balloon.size * 1.2}px`,
                            backgroundColor: balloon.color,
                            animation: balloon.isPopped ? 'none' : 
                                `float ${balloon.duration}s ${balloon.delay}s ease-out forwards, 
                                 sway ${balloon.duration * 0.5}s ${balloon.delay}s ease-in-out infinite`,
                            '--sway-amount': `${balloon.swayAmount}px`,
                            cursor: balloon.isPopped ? 'default' : 'pointer',
                            pointerEvents: 'auto'
                        } as React.CSSProperties}
                    >
                        {!balloon.isPopped && (
                            <div 
                                className="balloon-string"
                                style={{
                                    height: `${stringLength}px`
                                }}
                                onClick={e => e.stopPropagation()}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const ClaimSuccessModal: React.FC<ClaimSuccessModalProps> = ({ show, onClose, amount, tokenId, achievementName }) => {
    const { tokens } = useTokens();
    const tokenMetadata = tokens.find(t => t.canisterId === tokenId)?.metadata;
    const [isOpen, setIsOpen] = useState(false);
    const [celebrationWord] = useState(() => 
        CELEBRATION_WORDS[Math.floor(Math.random() * CELEBRATION_WORDS.length)]
    );
    const [showGlitter] = useState(() => Math.random() < GLITTER_PROBABILITY);
    const [showBalloons] = useState(() => Math.random() < BALLOON_PROBABILITY);

    useEffect(() => {
        if (show) {
            const timer = setTimeout(() => setIsOpen(true), 1000);
            return () => clearTimeout(timer);
        }
    }, [show]);

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
            {showBalloons && <Balloon />}
            <div className="claim-success-modal" onClick={e => e.stopPropagation()}>
                <div className="claim-success-content">
                    <div className="claim-success-icon-wrapper">
                        <div className="sparkles">{sparkles}</div>
                        <div className={`claim-success-icon ${isOpen ? 'open' : 'closed'}`}>
                            <FiGift style={{ opacity: isOpen ? 0 : 1 }} />
                        </div>
                        <div className={`claim-success-icon ${isOpen ? 'closed' : 'open'}`}>
                            <FiPackage style={{ opacity: isOpen ? 1 : 0 }} />
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
        </div>
    );
};

interface ClaimSuccess {
    amount: bigint;
    tokenId: string;
    achievementName: string;
}

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, details, formatDate, onClaimSuccess }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [availableClaims, setAvailableClaims] = useState<ClaimableReward[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [claimSuccess, setClaimSuccess] = useState<ClaimSuccess | null>(null);
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

    const handleClaim = async (allocationId: string, tokenId: string) => {
        try {
            setLoading(true);
            const claimedAmount = await allocationService.claimAllocation(achievement.achievement_id, allocationId);
            
            // Show success modal
            setClaimSuccess({
                amount: claimedAmount,
                tokenId: tokenId,
                achievementName: details.name
            });

            // Don't reload immediately - wait for modal to be closed
            setLoading(false);
        } catch (err: any) {
            setError('Failed to claim reward: ' + (err.message || String(err)));
            console.error('Error claiming reward:', err);
            setLoading(false);
        }
    };

    return (
        <>
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
                                            const allocation = tokens.find(t => t.canisterId === claim.token_canister_id.toString());
                                            return (
                                                <div key={claim.allocation_id} className="reward-item">
                                                    <div className="reward-info">
                                                        <FiGift className="reward-icon" />
                                                        <div className="reward-details">
                                                            <span className="reward-amount">
                                                                {claim.claimable_amount.min_e8s === claim.claimable_amount.max_e8s ? (
                                                                    formatTokenAmount(claim.claimable_amount.min_e8s, claim.token_canister_id.toString())
                                                                ) : (
                                                                    `${formatTokenAmount(claim.claimable_amount.min_e8s, claim.token_canister_id.toString())} - ${formatTokenAmount(claim.claimable_amount.max_e8s, claim.token_canister_id.toString())}`
                                                                )}
                                                                {allocation?.metadata?.symbol || ' tokens'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="claim-button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleClaim(claim.allocation_id, claim.token_canister_id.toString());
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
            {claimSuccess && (
                <ClaimSuccessModal
                    show={true}
                    onClose={() => {
                        setClaimSuccess(null);
                        // Reload claims after modal is closed
                        loadAvailableClaims();
                        if (onClaimSuccess) {
                            onClaimSuccess();
                        }
                    }}
                    amount={claimSuccess.amount}
                    tokenId={claimSuccess.tokenId}
                    achievementName={claimSuccess.achievementName}
                />
            )}
        </>
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