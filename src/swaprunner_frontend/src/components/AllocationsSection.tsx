import React, { useState, useEffect } from 'react';
import { FiGift, FiRefreshCw, FiChevronDown, FiChevronUp, FiLoader, FiPlus, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { backendService } from '../services/backend';
import { CollapsibleSection } from '../pages/Me';
import { formatTokenAmount, parseTokenAmount } from '../utils/format';
import { TokenSelect } from './TokenSelect';
import '../styles/AllocationsSection.css';

interface Allocation {
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
}

type AllocationStatus = 'Draft' | 'Funded' | 'Active' | 'Depleted' | 'Cancelled';

interface AllocationWithStatus {
    allocation: Allocation;
    status: AllocationStatus;
}

interface AllocationCardProps {
    allocationWithStatus: AllocationWithStatus;
    formatDate: (timestamp: number) => string;
}

interface Achievement {
    id: string;
    name: string;
    description: string;
    logo_url?: string;
}

interface AllocationFeeConfig {
    icp_fee_e8s: bigint;
    cut_basis_points: number;
}

interface TokenMetadata {
    symbol?: string;
    decimals?: number;
    name?: string;
}

interface AllocationFormProps {
    onSubmit: (data: {
        achievement_id: string;
        token_canister_id: string;
        total_amount_e8s: bigint;
        per_user_min_e8s: bigint;
        per_user_max_e8s: bigint;
    }) => Promise<void>;
    onCancel: () => void;
}

const AllocationForm: React.FC<AllocationFormProps> = ({ onSubmit, onCancel }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [selectedAchievement, setSelectedAchievement] = useState<string>('');
    const [selectedToken, setSelectedToken] = useState<string>('');
    const [selectedTokenMetadata, setSelectedTokenMetadata] = useState<TokenMetadata | null>(null);
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [perUserMin, setPerUserMin] = useState<string>('');
    const [perUserMax, setPerUserMax] = useState<string>('');
    const [feeConfig, setFeeConfig] = useState<AllocationFeeConfig | null>(null);

    useEffect(() => {
        loadAchievements();
        loadFeeConfig();
    }, []);

    const loadAchievements = async () => {
        try {
            const actor = await backendService.getActor();
            const result = await actor.get_all_achievements();
            setAchievements(result);
        } catch (err: any) {
            setError('Failed to load achievements: ' + (err.message || String(err)));
        }
    };

    const loadFeeConfig = async () => {
        try {
            const actor = await backendService.getActor();
            const config = await actor.get_allocation_fee_config();
            setFeeConfig(config);
        } catch (err: any) {
            setError('Failed to load fee configuration: ' + (err.message || String(err)));
        }
    };

    // Calculate the cut amount based on total amount and fee config
    const calculateCutAmount = (): string => {
        if (!feeConfig || !totalAmount || !selectedToken) return '0';
        try {
            const totalE8s = parseTokenAmount(totalAmount, selectedToken);
            const cutBasisPoints = BigInt(feeConfig.cut_basis_points);
            const cutAmount = (totalE8s * cutBasisPoints) / BigInt(10000);
            return formatTokenAmount(cutAmount, selectedToken);
        } catch {
            return '0';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAchievement || !selectedToken || !totalAmount || !perUserMin || !perUserMax) {
            setError('Please fill in all fields');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Parse amounts using token metadata for proper decimal handling
            const total = parseTokenAmount(totalAmount, selectedToken);
            const min = parseTokenAmount(perUserMin, selectedToken);
            const max = parseTokenAmount(perUserMax, selectedToken);

            if (total === BigInt(0) || min === BigInt(0) || max === BigInt(0)) {
                setError('All amounts must be greater than 0');
                return;
            }

            if (min > max) {
                setError('Minimum amount cannot be greater than maximum amount');
                return;
            }

            if (max > total) {
                setError('Per-user maximum cannot exceed total amount');
                return;
            }

            await onSubmit({
                achievement_id: selectedAchievement,
                token_canister_id: selectedToken,
                total_amount_e8s: total,
                per_user_min_e8s: min,
                per_user_max_e8s: max
            });
        } catch (err: any) {
            setError('Failed to create allocation: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="allocation-form">
            <div className="form-header">
                <h3>Create New Allocation</h3>
                <button type="button" className="close-button" onClick={onCancel}>
                    <FiX />
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
                <label>Achievement</label>
                <select 
                    value={selectedAchievement}
                    onChange={(e) => setSelectedAchievement(e.target.value)}
                    required
                >
                    <option value="">Select an achievement</option>
                    {achievements.map(achievement => (
                        <option key={achievement.id} value={achievement.id}>
                            {achievement.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>Token</label>
                <TokenSelect
                    value={selectedToken}
                    onChange={(tokenId: string, metadata?: TokenMetadata) => {
                        setSelectedToken(tokenId);
                        setSelectedTokenMetadata(metadata || null);
                    }}
                    label="Token"
                    mode="swap"
                    isLoading={false}
                />
            </div>

            <div className="form-group">
                <label>Total Amount</label>
                <input
                    type="text"
                    value={totalAmount}
                    onChange={(e) => {
                        // Only allow numbers and one decimal point
                        const value = e.target.value.replace(/[^0-9.]/g, '');
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                            setTotalAmount(value);
                        }
                    }}
                    placeholder="Total allocation amount"
                    required
                />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>Per User Min</label>
                    <input
                        type="text"
                        value={perUserMin}
                        onChange={(e) => {
                            // Only allow numbers and one decimal point
                            const value = e.target.value.replace(/[^0-9.]/g, '');
                            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                setPerUserMin(value);
                            }
                        }}
                        placeholder="Minimum per user"
                        required
                    />
                </div>

                <div className="form-group">
                    <label>Per User Max</label>
                    <input
                        type="text"
                        value={perUserMax}
                        onChange={(e) => {
                            // Only allow numbers and one decimal point
                            const value = e.target.value.replace(/[^0-9.]/g, '');
                            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                setPerUserMax(value);
                            }
                        }}
                        placeholder="Maximum per user"
                        required
                    />
                </div>
            </div>

            {feeConfig && (
                <div className="fee-info">
                    <div className="fee-section">
                        <div className="fee-header">Platform Fee</div>
                        <div className="fee-content">
                            <div className="fee-row">
                                <span className="fee-label">Creation Fee</span>
                                <span className="fee-value">
                                    {formatTokenAmount(feeConfig.icp_fee_e8s, 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP
                                </span>
                            </div>
                            <div className="fee-row">
                                <span className="fee-label">Platform Cut ({Number(feeConfig.cut_basis_points) / 100}%)</span>
                                <span className="fee-value">
                                    {calculateCutAmount()} {selectedTokenMetadata?.symbol || 'tokens'}
                                </span>
                            </div>
                            <div className="fee-info-note">
                                Note: The creation fee is paid in ICP, and the platform cut is taken from the allocation amount.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="form-actions">
                <button type="submit" className="submit-button" disabled={loading}>
                    {loading ? (
                        <>
                            <FiLoader className="spinning" />
                            Creating...
                        </>
                    ) : (
                        'Create Allocation'
                    )}
                </button>
                <button type="button" className="cancel-button" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
};

const AllocationCard: React.FC<AllocationCardProps> = ({ allocationWithStatus, formatDate }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { allocation, status } = allocationWithStatus;

    const getStatusColor = (status: AllocationStatus): string => {
        switch (status) {
            case 'Draft': return '#6c757d';     // Gray
            case 'Funded': return '#ffc107';    // Yellow
            case 'Active': return '#28a745';    // Green
            case 'Depleted': return '#dc3545';  // Red
            case 'Cancelled': return '#dc3545'; // Red
            default: return '#6c757d';
        }
    };

    return (
        <div className="allocation-card">
            <div 
                className="allocation-header"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="allocation-icon-wrapper">
                    <FiGift size={32} className="allocation-icon" />
                </div>
                <div className="allocation-info">
                    <h3>Achievement Allocation {allocation.id}</h3>
                    <div className="allocation-date">
                        Created {formatDate(allocation.created_at)}
                    </div>
                </div>
                <div className="allocation-status" style={{ color: getStatusColor(status) }}>
                    {status}
                </div>
                <div className="allocation-expand">
                    {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
                </div>
            </div>
            {isExpanded && (
                <div className="allocation-details">
                    <div className="allocation-details-content">
                        <div className="detail-row">
                            <span className="detail-label">Achievement ID:</span>
                            <span className="detail-value">{allocation.achievement_id}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Token:</span>
                            <span className="detail-value">{allocation.token.canister_id}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Total Amount:</span>
                            <span className="detail-value">
                                {formatTokenAmount(allocation.token.total_amount_e8s, allocation.token.canister_id)}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Per User:</span>
                            <span className="detail-value">
                                {allocation.token.per_user.min_e8s === allocation.token.per_user.max_e8s ? (
                                    formatTokenAmount(allocation.token.per_user.min_e8s, allocation.token.canister_id)
                                ) : (
                                    `${formatTokenAmount(allocation.token.per_user.min_e8s, allocation.token.canister_id)} - ${formatTokenAmount(allocation.token.per_user.max_e8s, allocation.token.canister_id)}`
                                )}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Created:</span>
                            <span className="detail-value">{formatDate(allocation.created_at)}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const AllocationsSection: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [allocations, setAllocations] = useState<AllocationWithStatus[]>([]);
    const [showForm, setShowForm] = useState(false);
    const navigate = useNavigate();

    const loadAllocations = async () => {
        try {
            setLoading(true);
            setError(null);
            const actor = await backendService.getActor();
            
            const result = await actor.get_my_created_allocations();
            console.log('Loaded allocations:', result);
            
            if ('ok' in result) {
                setAllocations(result.ok);
            } else {
                setError(result.err);
            }
        } catch (err: any) {
            setError('Failed to load allocations: ' + (err.message || String(err)));
            console.error('Load error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllocations();
    }, []);

    const formatDate = (timestamp: number) => {
        return new Date(Number(timestamp) / 1_000_000).toLocaleString();
    };

    const handleCreateAllocation = async (data: {
        achievement_id: string;
        token_canister_id: string;
        total_amount_e8s: bigint;
        per_user_min_e8s: bigint;
        per_user_max_e8s: bigint;
    }) => {
        try {
            const actor = await backendService.getActor();
            const result = await actor.create_allocation(data);
            
            if ('ok' in result) {
                await loadAllocations();
                setShowForm(false);
            } else {
                throw new Error(result.err);
            }
        } catch (err: any) {
            throw err;
        }
    };

    const allocationsContent = (
        <div className="allocations-content">
            <div className="allocations-actions">
                <button 
                    className="create-button" 
                    onClick={() => setShowForm(true)}
                >
                    <FiPlus />
                    Create Allocation
                </button>
                <button 
                    className="refresh-button" 
                    onClick={loadAllocations}
                    disabled={loading}
                >
                    <FiRefreshCw className={loading ? 'spinning' : ''} />
                    {loading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {showForm && (
                <AllocationForm
                    onSubmit={handleCreateAllocation}
                    onCancel={() => setShowForm(false)}
                />
            )}

            {loading ? (
                <div className="allocations-loading">Loading allocations...</div>
            ) : (
                <div className="allocations-list">
                    {allocations.length === 0 && !showForm ? (
                        <div className="no-allocations">
                            You haven't created any allocations yet.
                            <button 
                                className="create-first-button"
                                onClick={() => setShowForm(true)}
                            >
                                <FiPlus />
                                Create Your First Allocation
                            </button>
                        </div>
                    ) : (
                        allocations.map(allocation => (
                            <AllocationCard
                                key={allocation.allocation.id}
                                allocationWithStatus={allocation}
                                formatDate={formatDate}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );

    return (
        <CollapsibleSection 
            title="My Allocations" 
            icon={<FiGift size={24} />}
            defaultExpanded={false}
        >
            {allocationsContent}
        </CollapsibleSection>
    );
}; 