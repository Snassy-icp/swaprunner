import React, { useState, useEffect } from 'react';
import { FiGift, FiRefreshCw, FiChevronDown, FiChevronUp, FiLoader, FiPlus, FiX, FiAlertCircle } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { allocationService, Allocation, AllocationStatus, AllocationWithStatus, AllocationFeeConfig, CreateAllocationArgs } from '../services/allocation';
import { CollapsibleSection } from '../pages/Me';
import { formatTokenAmount, parseTokenAmount } from '../utils/format';
import { TokenSelect } from './TokenSelect';
import '../styles/AllocationsSection.css';
import { useTokens } from '../contexts/TokenContext';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { Principal } from '@dfinity/principal';
import { tokenService } from '../services/token';

interface Achievement {
    id: string;
    name: string;
    description: string;
    logo_url?: string;
}

interface TokenMetadata {
    symbol?: string;
    decimals?: number;
    name?: string;
    fee?: bigint;
    hasLogo?: boolean;
    standard?: string;
    logo_url?: string;
}

interface AllocationFormProps {
    onSubmit: (data: CreateAllocationArgs) => Promise<void>;
    onCancel: () => void;
}

interface AllocationCardProps {
    allocationWithStatus: AllocationWithStatus;
    formatDate: (timestamp: number) => string;
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
    const { tokens: contextTokens } = useTokens();
    
    // Add balance states
    const [icpBalance, setIcpBalance] = useState<bigint>(BigInt(0));
    const [tokenBalance, setTokenBalance] = useState<bigint>(BigInt(0));
    const [isLoadingBalances, setIsLoadingBalances] = useState(false);
    const [balanceError, setBalanceError] = useState<string | null>(null);

    useEffect(() => {
        loadAchievements();
        loadFeeConfig();
        loadICPBalance();
    }, []);

    // Add effect to load token balance when token is selected
    useEffect(() => {
        if (selectedToken) {
            loadTokenBalance(selectedToken);
        }
    }, [selectedToken]);

    const loadICPBalance = async () => {
        try {
            setIsLoadingBalances(true);
            const icpSwapService = new ICPSwapExecutionService();
            const balance = await icpSwapService.getBalance('ryjl3-tyaaa-aaaaa-aaaba-cai');
            setIcpBalance(balance.balance_e8s);
            setBalanceError(null);
        } catch (err: any) {
            setBalanceError('Failed to load ICP balance');
            console.error('Failed to load ICP balance:', err);
        } finally {
            setIsLoadingBalances(false);
        }
    };

    const loadTokenBalance = async (tokenId: string) => {
        try {
            setIsLoadingBalances(true);
            const icpSwapService = new ICPSwapExecutionService();
            const balance = await icpSwapService.getBalance(tokenId);
            setTokenBalance(balance.balance_e8s);
            setBalanceError(null);
        } catch (err: any) {
            setBalanceError('Failed to load token balance');
            console.error('Failed to load token balance:', err);
        } finally {
            setIsLoadingBalances(false);
        }
    };

    // Add function to check if user has sufficient balances
    const checkBalances = (): { hasEnoughICP: boolean; hasEnoughTokens: boolean } => {
        const hasEnoughICP = feeConfig ? icpBalance >= feeConfig.icp_fee_e8s : false;
        
        let hasEnoughTokens = false;
        if (selectedToken && totalAmount) {
            try {
                const totalE8s = parseTokenAmount(totalAmount, selectedToken);
                const cutBasisPoints = feeConfig ? BigInt(feeConfig.cut_basis_points) : BigInt(0);
                const totalWithCut = totalE8s + ((totalE8s * cutBasisPoints) / BigInt(10000));
                hasEnoughTokens = tokenBalance >= totalWithCut;
            } catch {
                hasEnoughTokens = false;
            }
        }
        
        return { hasEnoughICP, hasEnoughTokens };
    };

    const loadAchievements = async () => {
        try {
            const result = await allocationService.getAllAchievements();
            setAchievements(result);
        } catch (err: any) {
            setError('Failed to load achievements: ' + (err.message || String(err)));
        }
    };

    const loadFeeConfig = async () => {
        try {
            const config = await allocationService.getFeeConfig();
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

    // Calculate potential number of users
    const calculatePotentialUsers = (): { min: number; max: number; avg: number } | null => {
        if (!totalAmount || !perUserMin || !perUserMax || !selectedToken) {
            return null;
        }

        try {
            const total = parseTokenAmount(totalAmount, selectedToken);
            const min = parseTokenAmount(perUserMin, selectedToken);
            const max = parseTokenAmount(perUserMax, selectedToken);

            if (min === BigInt(0) || max === BigInt(0) || total === BigInt(0)) {
                return null;
            }

            // Calculate platform cut
            const cutBasisPoints = feeConfig ? BigInt(feeConfig.cut_basis_points) : BigInt(0);
            const totalAfterCut = total - ((total * cutBasisPoints) / BigInt(10000));

            const maxUsers = Number(totalAfterCut / min);
            const minUsers = Number(totalAfterCut / max);
            const avgUsers = Math.floor((minUsers + maxUsers) / 2);

            return {
                min: Math.floor(minUsers),
                max: Math.floor(maxUsers),
                avg: avgUsers
            };
        } catch {
            return null;
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

            // Check balances first
            const { hasEnoughICP, hasEnoughTokens } = checkBalances();
            if (!hasEnoughICP) {
                setError(`Insufficient ICP balance for creation fee. Required: ${formatTokenAmount(feeConfig?.icp_fee_e8s || BigInt(0), 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP`);
                return;
            }
            if (!hasEnoughTokens) {
                const totalE8s = parseTokenAmount(totalAmount, selectedToken);
                const cutBasisPoints = feeConfig ? BigInt(feeConfig.cut_basis_points) : BigInt(0);
                const totalWithCut = totalE8s + ((totalE8s * cutBasisPoints) / BigInt(10000));
                setError(`Insufficient token balance. Required: ${formatTokenAmount(totalWithCut, selectedToken)} ${selectedTokenMetadata?.symbol || 'tokens'}`);
                return;
            }

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
                token_canister_id: Principal.fromText(selectedToken),
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

    // Calculate if we have sufficient balances
    const { hasEnoughICP, hasEnoughTokens } = checkBalances();

    return (
        <form onSubmit={handleSubmit} className="allocation-form">
            <div className="form-header">
                <h3>Create New Allocation</h3>
                <button type="button" className="close-button" onClick={onCancel}>
                    <FiX />
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}
            {balanceError && <div className="error-message">{balanceError}</div>}

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
                    onChange={(tokenId: string) => {
                        setSelectedToken(tokenId);
                        // Get the token metadata from the tokens list
                        const token = contextTokens.find(t => t.canisterId === tokenId);
                        if (token?.metadata) {
                            setSelectedTokenMetadata({
                                symbol: token.metadata.symbol,
                                decimals: token.metadata.decimals,
                                name: token.metadata.name,
                                fee: token.metadata.fee,
                                hasLogo: token.metadata.hasLogo,
                                standard: token.metadata.standard
                            });
                        }
                    }}
                    label=""
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

            {/* Add potential users info */}
            {(() => {
                const potentialUsers = calculatePotentialUsers();
                if (!potentialUsers) return null;

                if (perUserMin === perUserMax) {
                    return (
                        <div className="potential-users-info">
                            This allocation will be able to support exactly {potentialUsers.min} users (after platform cut)
                        </div>
                    );
                }

                return (
                    <div className="potential-users-info">
                        This allocation will be able to support between {potentialUsers.min} and {potentialUsers.max} users (after platform cut.)
                        Average: {potentialUsers.avg} users.
                    </div>
                );
            })()}

            {feeConfig && (
                <div className="fee-info">
                    <div className="fee-section">
                        <div className="fee-header">Platform Fee</div>
                        <div className="fee-content">
                            <div className="fee-row">
                                <span className="fee-label">Creation Fee</span>
                                <span className="fee-value">
                                    {formatTokenAmount(feeConfig.icp_fee_e8s, 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP
                                    {!hasEnoughICP && (
                                        <span className="balance-warning">
                                            <FiAlertCircle /> Insufficient balance
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="fee-row">
                                <span className="fee-label">Platform Cut ({Number(feeConfig.cut_basis_points) / 100}%)</span>
                                <div className="fee-value">
                                    <span>
                                        {calculateCutAmount()} {selectedTokenMetadata?.symbol || 'tokens'}
                                        {selectedToken && !hasEnoughTokens && (
                                            <span className="balance-warning">
                                                <FiAlertCircle /> Insufficient balance
                                            </span>
                                        )}
                                    </span>
                                    {selectedToken && selectedTokenMetadata?.logo_url && (
                                        <img 
                                            src={selectedTokenMetadata.logo_url} 
                                            alt={selectedTokenMetadata.symbol || 'token'} 
                                            className="token-logo"
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="fee-info-note">
                                Note: The creation fee is paid in ICP, and the platform cut is taken from the allocation amount.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="form-actions">
                <button type="submit" className="submit-button" disabled={loading || isLoadingBalances || !hasEnoughICP || !hasEnoughTokens}>
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
    const { tokens } = useTokens();
    const [tokenLogo, setTokenLogo] = useState<string | null>(null);

    // Get token metadata
    const tokenMetadata = tokens.find(t => t.canisterId === allocation.token.canister_id.toString())?.metadata;

    // Load token logo when expanded
    useEffect(() => {
        if (isExpanded && tokenMetadata?.hasLogo && !tokenLogo) {
            const loadLogo = async () => {
                try {
                    const logo = await tokenService.getTokenLogo(allocation.token.canister_id.toString());
                    if (logo) {
                        setTokenLogo(logo);
                    }
                } catch (err) {
                    console.error('Error loading token logo:', err);
                }
            };
            loadLogo();
        }
    }, [isExpanded, tokenMetadata, allocation.token.canister_id, tokenLogo]);

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

    // Convert status variant to string
    const getStatusString = (status: any): string => {
        if (typeof status === 'object' && status !== null) {
            return Object.keys(status)[0];
        }
        return String(status);
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
                    {getStatusString(status)}
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
                            <span className="detail-value token-info">
                                {(tokenMetadata?.symbol === 'ICP' || tokenLogo) && (
                                    <img 
                                        src={tokenMetadata?.symbol === 'ICP' ? '/icp_symbol.svg' : tokenLogo || '/generic_token.svg'}
                                        alt={tokenMetadata?.symbol || 'token'} 
                                        className="token-logo"
                                        onError={(e) => {
                                            const img = e.target as HTMLImageElement;
                                            img.src = tokenMetadata?.symbol === 'ICP' ? '/icp_symbol.svg' : '/generic_token.svg';
                                        }}
                                    />
                                )}
                                <span>{tokenMetadata?.symbol || 'Unknown Token'}</span>
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Total Amount:</span>
                            <span className="detail-value">
                                {formatTokenAmount(allocation.token.total_amount_e8s, allocation.token.canister_id.toString())} {tokenMetadata?.symbol}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Per User:</span>
                            <span className="detail-value">
                                {allocation.token.per_user.min_e8s === allocation.token.per_user.max_e8s ? (
                                    `${formatTokenAmount(allocation.token.per_user.min_e8s, allocation.token.canister_id.toString())} ${tokenMetadata?.symbol}`
                                ) : (
                                    `${formatTokenAmount(allocation.token.per_user.min_e8s, allocation.token.canister_id.toString())} - ${formatTokenAmount(allocation.token.per_user.max_e8s, allocation.token.canister_id.toString())} ${tokenMetadata?.symbol}`
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
            const result = await allocationService.getMyCreatedAllocations();
            setAllocations(result);
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

    const handleCreateAllocation = async (data: CreateAllocationArgs) => {
        try {
            await allocationService.createAllocation(data);
            await loadAllocations();
            setShowForm(false);
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