import React, { useState, useEffect } from 'react';
import { FiGift, FiRefreshCw, FiChevronDown, FiChevronUp, FiLoader, FiPlus, FiX, FiAlertCircle, FiCheck } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { allocationService, Allocation, AllocationStatus, AllocationWithStatus, AllocationFeeConfig, CreateAllocationArgs, PaymentStatus } from '../services/allocation';
import { CollapsibleSection } from '../pages/Me';
import { formatTokenAmount, parseTokenAmount } from '../utils/format';
import { TokenSelect } from './TokenSelect';
import '../styles/AllocationsSection.css';
import { useTokens } from '../contexts/TokenContext';
import { ICPSwapExecutionService } from '../services/icpswap_execution';
import { Principal } from '@dfinity/principal';
import { tokenService } from '../services/token';
import { backendService } from '../services/backend';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmationModal } from './ConfirmationModal';
import { adminService } from '../services/admin';

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
    onStatusChange?: () => void;
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
    const [addCutOnTop, setAddCutOnTop] = useState(false);
    const [hasEnoughICP, setHasEnoughICP] = useState(false);
    const [hasEnoughTokens, setHasEnoughTokens] = useState(false);

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

    const checkBalances = async (): Promise<{ hasEnoughICP: boolean; hasEnoughTokens: boolean }> => {
        if (!selectedToken || !totalAmount || !feeConfig) {
            return { hasEnoughICP: false, hasEnoughTokens: false };
        }
        setIsLoadingBalances(true);
        setBalanceError(null);

        try {
            const [currentIcpBalance, currentTokenBalance] = await Promise.all([
                icpBalance,
                selectedToken === 'ryjl3-tyaaa-aaaaa-aaaba-cai' ? icpBalance : tokenBalance
            ]);

            const isICP = selectedToken === 'ryjl3-tyaaa-aaaaa-aaaba-cai';
            const totalE8s = parseTokenAmount(totalAmount, selectedToken);
            const icpTxFee = BigInt(10000); // Standard ICP tx fee is 10000 e8s
            const tokenTxFee = selectedTokenMetadata?.fee || BigInt(0);
            
            let hasEnoughICP, hasEnoughTokens;
            let requiredTokens = totalE8s;
            if (addCutOnTop) {
                requiredTokens += calculateCutOnTop();
            }

            if (isICP) {
                // For ICP allocations, check if they have enough for fee + allocation + two tx fees
                hasEnoughICP = currentIcpBalance >= (feeConfig.icp_fee_e8s || BigInt(0)) + requiredTokens + icpTxFee + icpTxFee;
                hasEnoughTokens = hasEnoughICP; // We use hasEnoughICP for the total check
            } else {
                // For other tokens:
                // - Check if they have enough ICP for fee + tx fee
                hasEnoughICP = currentIcpBalance >= (feeConfig.icp_fee_e8s || BigInt(0)) + icpTxFee;
                // - Check if they have enough tokens for allocation + two tx fees
                hasEnoughTokens = currentTokenBalance >= requiredTokens + tokenTxFee + tokenTxFee;
            }

            if (!hasEnoughICP) {
                setBalanceError(`Insufficient ICP balance. Required: ${formatTokenAmount(feeConfig.icp_fee_e8s + icpTxFee, 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP`);
            } else if (!hasEnoughTokens) {
                const requiredTotal = isICP ? 
                    requiredTokens + icpTxFee + icpTxFee :
                    requiredTokens + tokenTxFee + tokenTxFee;
                setBalanceError(`Insufficient ${isICP ? 'ICP' : 'token'} balance. Required: ${formatTokenAmount(requiredTotal, selectedToken)}`);
            }

            return { hasEnoughICP, hasEnoughTokens };
        } catch (err: any) {
            setBalanceError(err.message || 'Failed to check balances');
            return { hasEnoughICP: false, hasEnoughTokens: false };
        } finally {
            setIsLoadingBalances(false);
        }
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

            // Withdraw the cut from the total amount, unless the cut is put on top
            const totalAfterCut = addCutOnTop ? total : total - ((total * cutBasisPoints) / BigInt(10000));

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

    const calculateCutOnTop = (): bigint => {
        if (!totalAmount || !selectedToken || !feeConfig) return BigInt(0);
        try {
            const totalE8s = parseTokenAmount(totalAmount, selectedToken);
            // Calculate total amount needed such that after taking the cut, the user gets their desired amount
            // Formula: desired_amount = total_amount * (1 - cut_percentage)
            // Therefore: total_amount = desired_amount / (1 - cut_percentage)
            // Since cut_basis_points is in basis points (1/100th of a percent), we divide by 10000
            const cutPercentage = BigInt(feeConfig.cut_basis_points);
            const denominator = BigInt(10000) - cutPercentage;
            const totalNeeded = (totalE8s * BigInt(10000)) / denominator;
            return totalNeeded - totalE8s; // Return just the extra amount needed
        } catch (err: any) {
            console.error('Error calculating cut on top', err);
            return BigInt(0);
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
            const balances = await checkBalances();
            const isICP = selectedToken === 'ryjl3-tyaaa-aaaaa-aaaba-cai';
            const icpTxFee = BigInt(10000);
            const tokenTxFee = selectedTokenMetadata?.fee || BigInt(0);

            if (!balances.hasEnoughICP) {
                if (isICP) {
                    const totalE8s = parseTokenAmount(totalAmount, selectedToken);
                    const totalRequired = (feeConfig?.icp_fee_e8s || BigInt(0)) + totalE8s + icpTxFee;
                    setError(`Insufficient ICP balance. Required: ${formatTokenAmount(totalRequired, 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP (includes creation fee, allocation amount, and transaction fee)`);
                } else {
                    const totalRequired = (feeConfig?.icp_fee_e8s || BigInt(0)) + icpTxFee;
                    setError(`Insufficient ICP balance for creation fee. Required: ${formatTokenAmount(totalRequired, 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP (includes fee and transaction fee)`);
                }
                return;
            }

            if (!balances.hasEnoughTokens && !isICP) {
                const totalE8s = parseTokenAmount(totalAmount, selectedToken);
                const totalRequired = totalE8s + tokenTxFee;
                setError(`Insufficient token balance. Required: ${formatTokenAmount(totalRequired, selectedToken)} ${selectedTokenMetadata?.symbol || 'tokens'} (includes allocation amount and transaction fee)`);
                return;
            }

            // Parse amounts using token metadata for proper decimal handling
            let total = parseTokenAmount(totalAmount, selectedToken);
            const min = parseTokenAmount(perUserMin, selectedToken);
            const max = parseTokenAmount(perUserMax, selectedToken);

            // If addCutOnTop is true, increase the total amount to include the cut
            if (addCutOnTop) {
                const cutAmount = calculateCutOnTop();
                total += cutAmount;
            }

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

    useEffect(() => {
        const checkUserBalances = async () => {
            const balances = await checkBalances();
            setHasEnoughICP(balances.hasEnoughICP);
            setHasEnoughTokens(balances.hasEnoughTokens);
        };
        void checkUserBalances();
    }, [totalAmount, selectedToken, feeConfig]);

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
                        <div className="fee-header">Fee Information</div>
                        <div className="fee-content">
                            <div className="fee-row">
                                <span className="fee-label">Platform Fee</span>
                                <span className="fee-value">
                                    {feeConfig ? formatTokenAmount(feeConfig.icp_fee_e8s, 'ryjl3-tyaaa-aaaaa-aaaba-cai') : '0'} ICP
                                </span>
                            </div>
                            <div className="fee-row">
                                <span className="fee-label">Platform Cut</span>
                                <span className="fee-value">{feeConfig ? (Number(feeConfig.cut_basis_points) / 100).toFixed(2) : '0'}%</span>
                            </div>
                            <div className="fee-row">
                                <span className="fee-label">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={addCutOnTop}
                                            onChange={(e) => setAddCutOnTop(e.target.checked)}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                        Add cut on top
                                    </label>
                                    <div style={{ color: '#666', fontSize: '12px', fontStyle: 'italic', marginTop: '4px' }}>
                                        When checked, the cut will be added to your specified amount instead of being taken from it
                                    </div>
                                </span>
                            </div>
                            <div className="fee-row">
                                <span className="fee-label">Platform Cut ({Number(feeConfig.cut_basis_points) / 100}%)</span>
                                <div className="fee-value">
                                    <span>
                                        {addCutOnTop ? formatTokenAmount(calculateCutOnTop(), selectedToken || '') : calculateCutAmount()} {selectedTokenMetadata?.symbol || 'tokens'}
                                        {selectedToken && !hasEnoughTokens && selectedToken !== 'ryjl3-tyaaa-aaaaa-aaaba-cai' && (
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
                            {selectedToken === 'ryjl3-tyaaa-aaaaa-aaaba-cai' && totalAmount && (
                                <div className="fee-row total-required">
                                    <span className="fee-label">Total ICP Required</span>
                                    <span className="fee-value">
                                        {(() => {
                                            try {
                                                const totalE8s = parseTokenAmount(totalAmount, selectedToken);
                                                const icpTxFee = BigInt(10000);
                                                let requiredAmount = totalE8s;
                                                if (addCutOnTop) {
                                                    requiredAmount += calculateCutOnTop();
                                                }
                                                // For ICP allocations, we need fee + total amount + two tx fees
                                                const totalRequired = (feeConfig.icp_fee_e8s || BigInt(0)) + requiredAmount + icpTxFee + icpTxFee;
                                                return formatTokenAmount(totalRequired, 'ryjl3-tyaaa-aaaaa-aaaba-cai');
                                            } catch {
                                                return '0';
                                            }
                                        })()} ICP
                                    </span>
                                </div>
                            )}
                            {selectedToken !== 'ryjl3-tyaaa-aaaaa-aaaba-cai' && totalAmount && (
                                <>
                                    <div className="fee-row total-required">
                                        <span className="fee-label">Total ICP Required</span>
                                        <span className="fee-value">
                                            {(() => {
                                                try {
                                                    const icpTxFee = BigInt(10000);
                                                    // For non-ICP allocations, we need fee + one tx fee
                                                    const totalRequired = (feeConfig.icp_fee_e8s || BigInt(0)) + icpTxFee;
                                                    return formatTokenAmount(totalRequired, 'ryjl3-tyaaa-aaaaa-aaaba-cai');
                                                } catch {
                                                    return '0';
                                                }
                                            })()} ICP
                                        </span>
                                    </div>
                                    <div className="fee-row total-required">
                                        <span className="fee-label">Total {selectedTokenMetadata?.symbol || 'Token'} Required</span>
                                        <span className="fee-value">
                                            {(() => {
                                                try {
                                                    const totalE8s = parseTokenAmount(totalAmount, selectedToken);
                                                    const tokenTxFee = selectedTokenMetadata?.fee || BigInt(0);
                                                    let requiredAmount = totalE8s;
                                                    if (addCutOnTop) {
                                                        requiredAmount += calculateCutOnTop();
                                                    }
                                                    // For token allocations, we need allocation amount + two tx fees
                                                    const totalRequired = requiredAmount + tokenTxFee + tokenTxFee;
                                                    return formatTokenAmount(totalRequired, selectedToken);
                                                } catch {
                                                    return '0';
                                                }
                                            })()} {selectedTokenMetadata?.symbol || 'tokens'}
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="fee-info-note">
                                {selectedToken === 'ryjl3-tyaaa-aaaaa-aaaba-cai' 
                                    ? "Note: When creating an ICP allocation, you need sufficient ICP to cover both the creation fee and the allocation amount."
                                    : "Note: The creation fee is paid in ICP, and the platform cut is taken from the allocation amount."
                                }
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

const AllocationCard: React.FC<AllocationCardProps> = ({ allocationWithStatus, formatDate, onStatusChange }) => {
    const [expanded, setExpanded] = useState(false);
    const [tokenLogo, setTokenLogo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [achievement, setAchievement] = useState<Achievement | null>(null);
    const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
    const [fundingBalance, setFundingBalance] = useState<bigint>(BigInt(0));
    const [allocationBalance, setAllocationBalance] = useState<bigint>(BigInt(0));
    const [isCancelling, setIsCancelling] = useState(false);
    const { isAdmin } = useAuth();
    const { tokens } = useTokens();
    const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
    const [allocationToCancel, setAllocationToCancel] = useState<string | null>(null);
    const [showActivateConfirmation, setShowActivateConfirmation] = useState(false);
    const [feeConfig, setFeeConfig] = useState<AllocationFeeConfig | null>(null);

    // Get token metadata
    const tokenMetadata = tokens.find(t => t.canisterId === allocationWithStatus.allocation.token.canister_id.toString())?.metadata;

    // Calculate platform cut
    const calculatePlatformCut = (): bigint => {
        if (!feeConfig || !allocationWithStatus.allocation.token.total_amount_e8s) return BigInt(0);
        const cutBasisPoints = BigInt(feeConfig.cut_basis_points);
        return (allocationWithStatus.allocation.token.total_amount_e8s * cutBasisPoints) / BigInt(10000);
    };

    // Calculate potential number of users
    const calculatePotentialUsers = (): { min: number; max: number; avg: number } | null => {
        const total = allocationWithStatus.allocation.token.total_amount_e8s;
        const min = allocationWithStatus.allocation.token.per_user.min_e8s;
        const max = allocationWithStatus.allocation.token.per_user.max_e8s;

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
    };

    // Load achievement details, token logo, payment status, and fee config
    useEffect(() => {
        // Load achievement details
        const loadAchievementDetails = async () => {
            try {
                const actor = await backendService.getActor();
                const result = await actor.get_achievement_details(allocationWithStatus.allocation.achievement_id);
                if ('ok' in result) {
                    setAchievement(result.ok);
                }
            } catch (err) {
                console.error('Error loading achievement details:', err);
            }
        };

        // Load token logo if available and expanded
        const loadLogo = async () => {
            if (expanded && tokenMetadata?.hasLogo && !tokenLogo) {
                try {
                    const logo = await tokenService.getTokenLogo(allocationWithStatus.allocation.token.canister_id.toString());
                    if (logo) {
                        setTokenLogo(logo);
                    }
                } catch (err) {
                    console.error('Error loading token logo:', err);
                }
            }
        };

        // Load payment status
        const loadPaymentStatus = async () => {
            if (expanded && allocationWithStatus.status === 'Draft') {
                try {
                    const status = await allocationService.getPaymentStatus(allocationWithStatus.allocation.id);
                    setPaymentStatus(status);
                } catch (err) {
                    console.error('Error loading payment status:', err);
                }
            }
        };

        // Load fee config
        const loadFeeConfig = async () => {
            try {
                const config = await allocationService.getFeeConfig();
                setFeeConfig(config);
            } catch (err) {
                console.error('Error loading fee config:', err);
            }
        };

        // Load funding balance
        const loadFundingBalance = async () => {
            if (expanded && allocationWithStatus.status === 'Draft' && paymentStatus?.is_paid) {
                try {
                    const balance = await allocationService.getFundingBalance(allocationWithStatus.allocation.id);
                    setFundingBalance(balance);
                } catch (err) {
                    console.error('Error loading funding balance:', err);
                }
            }
        };

        // Load allocation balance for non-draft allocations
        const loadAllocationBalance = async () => {
            if (expanded && allocationWithStatus.status !== 'Draft') {
                try {
                    const balance = await allocationService.getAllocationBalance(allocationWithStatus.allocation.id);
                    setAllocationBalance(balance);
                } catch (err) {
                    console.error('Error loading allocation balance:', err);
                }
            }
        };

        loadAchievementDetails();
        loadFeeConfig();
        if (expanded) {
            loadLogo();
            loadPaymentStatus();
            loadFundingBalance();
            loadAllocationBalance();
        }
    }, [allocationWithStatus.allocation.achievement_id, expanded, tokenMetadata, allocationWithStatus.allocation.token.canister_id, fundingBalance, allocationWithStatus.allocation.id, allocationWithStatus.status, paymentStatus?.is_paid]);

    const handlePay = async () => {
        if (!paymentStatus || paymentStatus.is_paid) return;

        try {
            setLoading(true);
            await allocationService.payForAllocation(allocationWithStatus.allocation.id);
            // Reload payment status after successful payment
            const newStatus = await allocationService.getPaymentStatus(allocationWithStatus.allocation.id);
            setPaymentStatus(newStatus);
        } catch (err) {
            console.error('Error making payment:', err);
            // You might want to show an error message to the user here
        } finally {
            setLoading(false);
        }
    };

    const handleFund = async () => {
        if (!paymentStatus?.is_paid) return;

        try {
            setLoading(true);
            await allocationService.fundAllocation(allocationWithStatus.allocation.id);
            // Reload funding status after successful funding
            const newBalance = await allocationService.getFundingBalance(allocationWithStatus.allocation.id);
            setFundingBalance(newBalance);
        } catch (err) {
            console.error('Error funding allocation:', err);
            // You might want to show an error message to the user here
        } finally {
            setLoading(false);
        }
    };

    const handlePayAndFund = async () => {
        try {
            setLoading(true);
            await allocationService.payAndFundAllocation(allocationWithStatus.allocation.id);
            // Reload both payment and funding status
            const newPaymentStatus = await allocationService.getPaymentStatus(allocationWithStatus.allocation.id);
            const newFundingBalance = await allocationService.getFundingBalance(allocationWithStatus.allocation.id);
            setPaymentStatus(newPaymentStatus);
            setFundingBalance(newFundingBalance);
        } catch (err: any) {
            console.error('Error paying and funding allocation:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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

    const handleActivate = async () => {
        if (!paymentStatus || !allocationWithStatus.allocation.token.total_amount_e8s || !fundingBalance || fundingBalance < allocationWithStatus.allocation.token.total_amount_e8s) {
            console.error('Invalid activation conditions');
            return;
        }

        try {
            setIsActivating(true);
            await allocationService.activateAllocation(allocationWithStatus.allocation.id);
            // Notify parent component to refresh the allocations list
            if (onStatusChange) {
                onStatusChange();
            }
        } catch (err) {
            console.error('Error activating allocation:', err);
            // You might want to show an error message to the user here
        } finally {
            setIsActivating(false);
        }
    };

    const handleCancel = async (allocationId: string) => {
        setAllocationToCancel(allocationId);
        setShowCancelConfirmation(true);
    };

    const confirmCancel = async () => {
        if (!allocationToCancel) return;

        setLoading(true);
        try {
            await allocationService.cancelAllocation(allocationToCancel);
            // Refresh allocations after cancellation
            if (onStatusChange) {
                onStatusChange();
            }
        } catch (error) {
            console.error('Error cancelling allocation:', error);
            setError('Failed to cancel allocation');
        } finally {
            setLoading(false);
            setShowCancelConfirmation(false);
            setAllocationToCancel(null);
        }
    };

    const showCancelButton = isAdmin || allocationWithStatus.status === 'Draft';

    return (
        <div className="allocation-card">
            <div 
                className="allocation-header"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="allocation-icon-wrapper">
                    <FiGift size={32} className="allocation-icon" />
                </div>
                <div className="allocation-info">
                    <h3>{achievement?.name || `Loading Achievement...`}</h3>
                    <div className="allocation-date">
                        {formatTokenAmount(allocationWithStatus.allocation.token.total_amount_e8s, allocationWithStatus.allocation.token.canister_id.toString())} {tokenMetadata?.symbol || 'tokens'}
                    </div>
                </div>
                <div className="allocation-status" style={{ color: getStatusColor(allocationWithStatus.status) }}>
                    {getStatusString(allocationWithStatus.status)}
                </div>
                <div className="allocation-expand">
                    {expanded ? <FiChevronUp /> : <FiChevronDown />}
                </div>
            </div>
            {expanded && (
                <div className="allocation-details">
                    <div className="allocation-details-content">
                        {allocationWithStatus.status === 'Draft' && (
                            <div className="detail-section">
                                <h4>Payment Status</h4>
                                {paymentStatus ? (
                                    <div className="detail-content">
                                        <div className="detail-row">
                                            <span className="detail-label">Required Fee:</span>
                                            <span className="detail-value">
                                                {formatTokenAmount(paymentStatus.required_fee_e8s, 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP
                                            </span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Current Balance:</span>
                                            <span className="detail-value">
                                                {formatTokenAmount(paymentStatus.current_balance_e8s, 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP
                                            </span>
                                        </div>
                                        {!paymentStatus.is_paid && (
                                            <div className="detail-row">
                                                <span className="detail-label">Remaining:</span>
                                                <span className="detail-value">
                                                    {formatTokenAmount(
                                                        paymentStatus.required_fee_e8s - paymentStatus.current_balance_e8s,
                                                        'ryjl3-tyaaa-aaaaa-aaaba-cai'
                                                    )} ICP
                                                </span>
                                            </div>
                                        )}
                                        {!paymentStatus.is_paid && allocationWithStatus.allocation.token.canister_id.toString() !== 'ryjl3-tyaaa-aaaaa-aaaba-cai' && (
                                            <div className="detail-actions">
                                                <button 
                                                    className="action-button primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePay();
                                                    }}
                                                    disabled={loading}
                                                >
                                                    {loading ? (
                                                        <>
                                                            <FiLoader className="spinning" />
                                                            Paying...
                                                        </>
                                                    ) : (
                                                        'Pay Now'
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                        {paymentStatus.is_paid && (
                                            <div className="detail-row payment-complete">
                                                <span className="detail-label">Status:</span>
                                                <span className="detail-value">
                                                    <FiCheck className="check-icon" /> Payment Complete
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="detail-loading">Loading payment status...</div>
                                )}
                            </div>
                        )}
                        {allocationWithStatus.status === 'Draft' && (
                            <div className="detail-section">
                                <h4>Funding Status</h4>
                                <div className="detail-content">
                                    <div className="detail-row">
                                        <span className="detail-label">Required Amount:</span>
                                        <span className="detail-value">
                                            {formatTokenAmount(allocationWithStatus.allocation.token.total_amount_e8s, allocationWithStatus.allocation.token.canister_id.toString())} {tokenMetadata?.symbol || 'tokens'}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Current Balance:</span>
                                        <span className="detail-value">
                                            {formatTokenAmount(fundingBalance || BigInt(0), allocationWithStatus.allocation.token.canister_id.toString())} {tokenMetadata?.symbol || 'tokens'}
                                        </span>
                                    </div>
                                    {fundingBalance < allocationWithStatus.allocation.token.total_amount_e8s ? (
                                        <>
                                            <div className="detail-row">
                                                <span className="detail-label">Remaining:</span>
                                                <span className="detail-value">
                                                    {formatTokenAmount(allocationWithStatus.allocation.token.total_amount_e8s - (fundingBalance || BigInt(0)), allocationWithStatus.allocation.token.canister_id.toString())} {tokenMetadata?.symbol || 'tokens'}
                                                </span>
                                            </div>
                                            <div className="detail-actions">
                                                <button
                                                    className="action-button primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        allocationWithStatus.allocation.token.canister_id.toString() === 'ryjl3-tyaaa-aaaaa-aaaba-cai' 
                                                            ? handlePayAndFund() 
                                                            : handleFund();
                                                    }}
                                                    disabled={loading}
                                                >
                                                    {loading ? (
                                                        <>
                                                            <FiLoader className="spinning" />
                                                            {allocationWithStatus.allocation.token.canister_id.toString() === 'ryjl3-tyaaa-aaaaa-aaaba-cai' 
                                                                ? 'Processing...' 
                                                                : 'Funding...'}
                                                        </>
                                                    ) : (
                                                        allocationWithStatus.allocation.token.canister_id.toString() === 'ryjl3-tyaaa-aaaaa-aaaba-cai' 
                                                            ? 'Pay & Fund Now' 
                                                            : 'Fund Now'
                                                    )}
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="detail-row payment-complete">
                                            <span className="detail-label">Status:</span>
                                            <span className="detail-value">
                                                <FiCheck className="check-icon" />
                                                Funding Complete
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="detail-section">
                            <h4>Status</h4>
                            <div className="detail-content">
                                <div className="detail-row">
                                    <span className="detail-label">Current Status:</span>
                                    <span className="detail-value" style={{ color: getStatusColor(allocationWithStatus.status) }}>
                                        {getStatusString(allocationWithStatus.status)}
                                    </span>
                                </div>
                                {allocationWithStatus.status === 'Draft' && (
                                    <>
                                        <div className="status-requirements">
                                            <ul>
                                                <li className={paymentStatus?.is_paid ? 'completed' : ''}>
                                                    {paymentStatus?.is_paid ? <FiCheck /> : <FiAlertCircle />}
                                                    Payment required before activation
                                                </li>
                                                <li className={fundingBalance >= allocationWithStatus.allocation.token.total_amount_e8s ? 'completed' : ''}>
                                                    {fundingBalance >= allocationWithStatus.allocation.token.total_amount_e8s ? <FiCheck /> : <FiAlertCircle />}
                                                    Full funding required before activation
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="detail-actions">
                                            <button
                                                className="action-button primary"
                                                onClick={() => setShowActivateConfirmation(true)}
                                                disabled={!paymentStatus?.is_paid || fundingBalance < allocationWithStatus.allocation.token.total_amount_e8s || isActivating}
                                            >
                                                {isActivating ? (
                                                    <>
                                                        <FiLoader className="spinning" />
                                                        Activating...
                                                    </>
                                                ) : (
                                                    'Activate Allocation'
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Achievement:</span>
                            <span className="detail-value">{achievement?.name || 'Loading...'}</span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Total Amount:</span>
                            <span className="detail-value">
                                {formatTokenAmount(allocationWithStatus.allocation.token.total_amount_e8s, allocationWithStatus.allocation.token.canister_id.toString())} {tokenMetadata?.symbol}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Per User:</span>
                            <span className="detail-value">
                                {allocationWithStatus.allocation.token.per_user.min_e8s === allocationWithStatus.allocation.token.per_user.max_e8s ? (
                                    `${formatTokenAmount(allocationWithStatus.allocation.token.per_user.min_e8s, allocationWithStatus.allocation.token.canister_id.toString())} ${tokenMetadata?.symbol}`
                                ) : (
                                    `${formatTokenAmount(allocationWithStatus.allocation.token.per_user.min_e8s, allocationWithStatus.allocation.token.canister_id.toString())} - ${formatTokenAmount(allocationWithStatus.allocation.token.per_user.max_e8s, allocationWithStatus.allocation.token.canister_id.toString())} ${tokenMetadata?.symbol}`
                                )}
                            </span>
                        </div>
                        <div className="detail-row">
                            <span className="detail-label">Created:</span>
                            <span className="detail-value">{formatDate(allocationWithStatus.allocation.created_at)}</span>
                        </div>

                        {showCancelButton && allocationWithStatus.status !== 'Cancelled' && (
                            <div className="detail-actions">
                                <button
                                    className="action-button danger"
                                    onClick={() => handleCancel(allocationWithStatus.allocation.id.toString())}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <FiLoader className="spinning" />
                                            Cancelling...
                                        </>
                                    ) : (
                                        'Cancel Allocation'
                                    )}
                                </button>
                            </div>
                        )}

                        {allocationWithStatus.status !== 'Draft' && (
                            <div className="detail-section">
                                <h4>Allocation Balance</h4>
                                <div className="detail-content">
                                    <div className="detail-row">
                                        <span className="detail-label">Remaining Balance:</span>
                                        <span className="detail-value">
                                            {formatTokenAmount(allocationBalance, allocationWithStatus.allocation.token.canister_id.toString())} {tokenMetadata?.symbol || 'tokens'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && <div className="error-message">{error}</div>}
                    </div>
                </div>
            )}
            <ConfirmationModal
                isOpen={showCancelConfirmation}
                onClose={() => {
                    setShowCancelConfirmation(false);
                    setAllocationToCancel(null);
                }}
                onConfirm={confirmCancel}
                title="Cancel Allocation"
                message="Are you sure you want to cancel this allocation? Your ICP payment fee and any funded tokens will be returned to your wallet. This action cannot be undone."
                confirmText="Cancel Allocation"
                isDanger={true}
            />
            <ConfirmationModal
                isOpen={showActivateConfirmation}
                onClose={() => setShowActivateConfirmation(false)}
                onConfirm={handleActivate}
                title="Activate Allocation"
                message={`Are you sure you want to activate this allocation? This action cannot be undone.

Payment Fee: ${formatTokenAmount(paymentStatus?.required_fee_e8s || BigInt(0), 'ryjl3-tyaaa-aaaaa-aaaba-cai')} ICP
Total Fund Amount: ${formatTokenAmount(allocationWithStatus.allocation.token.total_amount_e8s, allocationWithStatus.allocation.token.canister_id)} ${tokenMetadata?.symbol}
Platform Cut (${Number(feeConfig?.cut_basis_points || 0) / 100}%): ${formatTokenAmount(calculatePlatformCut(), allocationWithStatus.allocation.token.canister_id)} ${tokenMetadata?.symbol}
${calculatePotentialUsers() ? `User Capacity: ${calculatePotentialUsers()?.min === calculatePotentialUsers()?.max ? 
    `${calculatePotentialUsers()?.min} users` : 
    `${calculatePotentialUsers()?.min} to ${calculatePotentialUsers()?.max} users (avg: ${calculatePotentialUsers()?.avg})`}` : ''}

Warning: Once activated, the payment fee will be drawn and funds will be transferred.`}
                confirmText="Activate"
                isDanger={false}
            />
        </div>
    );
};

export const AllocationsSection: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [allocations, setAllocations] = useState<AllocationWithStatus[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
    const [allocationToCancel, setAllocationToCancel] = useState<string | null>(null);
    const [isAdminUser, setIsAdminUser] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                setLoading(true);
                const adminStatus = await adminService.isAdmin();
                setIsAdminUser(adminStatus);
                if (adminStatus) {
                    await loadAllocations();
                }
            } catch (error) {
                console.error('Error checking admin status:', error);
                setError('Failed to check admin status');
            } finally {
                setLoading(false);
            }
        };

        init();
    }, []);

    const loadAllocations = async () => {
        setLoading(true);
        try {
            const allocations = await allocationService.getMyCreatedAllocations();
            setAllocations(allocations);
            setError(null);
        } catch (error) {
            console.error('Error loading allocations:', error);
            setError('Failed to load allocations');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(Number(timestamp) / 1000000).toLocaleString();
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
/*
    const handleCancel = async (allocationId: string) => {
        setAllocationToCancel(allocationId);
        setShowCancelConfirmation(true);
    };

    const confirmCancel = async () => {
        if (!allocationToCancel) return;

        setLoading(true);
        try {
            await allocationService.cancelAllocation(allocationToCancel);
            // Refresh allocations after cancellation
            await loadAllocations();
        } catch (error) {
            console.error('Error cancelling allocation:', error);
            setError('Failed to cancel allocation');
        } finally {
            setLoading(false);
            setShowCancelConfirmation(false);
            setAllocationToCancel(null);
        }
    };
*/
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
                                onStatusChange={loadAllocations}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="allocations-section">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="allocations-section">
                <div className="error">{error}</div>
            </div>
        );
    }

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