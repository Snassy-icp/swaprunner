import React, { useState, useEffect } from 'react';
import { FiX, FiPlus, FiMinus, FiArrowUp } from 'react-icons/fi';
import { allocationService } from '../services/allocation';
import { icrc1Service } from '../services/icrc1_service';
import { formatTokenAmount, parseTokenAmount } from '../utils/format';
import { Principal } from '@dfinity/principal';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import '../styles/TopUpAllocationModal.css';

interface TopUpAllocationModalProps {
    show: boolean;
    onClose: () => void;
    allocationId: string;
    tokenId: string;
    onSuccess?: () => void;
}

export const TopUpAllocationModal: React.FC<TopUpAllocationModalProps> = ({
    show,
    onClose,
    allocationId,
    tokenId,
    onSuccess
}) => {
    const [fundingBalance, setFundingBalance] = useState<bigint>(BigInt(0));
    const [walletBalance, setWalletBalance] = useState<bigint>(BigInt(0));
    const [allocationBalance, setAllocationBalance] = useState<bigint>(BigInt(0));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);
    const [allocation, setAllocation] = useState<any>(null);
    const [potentialUsers, setPotentialUsers] = useState<{ min: number; max: number; avg: number } | null>(null);

    useEffect(() => {
        if (show) {
            loadAllData();
        }
    }, [show, allocationId, tokenId]);

    const loadAllData = async () => {
        try {
            setLoading(true);
            await Promise.all([
                loadFundingBalance(),
                loadTokenMetadata(),
                loadWalletBalance(),
                loadAllocationBalance(),
                loadAllocation()
            ]);
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const loadAllocation = async () => {
        try {
            const allocations = await allocationService.getMyCreatedAllocations();
            const currentAllocation = allocations.find(a => a.allocation.id === allocationId)?.allocation;
            if (currentAllocation) {
                setAllocation(currentAllocation);
                calculatePotentialUsers(currentAllocation, fundingBalance);
            }
        } catch (err) {
            console.error('Error loading allocation:', err);
            setError('Failed to load allocation details');
        }
    };

    const calculatePotentialUsers = (alloc: any, balance: bigint) => {
        if (!alloc) return;
        
        const min_e8s = alloc.token.per_user.min_e8s;
        const max_e8s = alloc.token.per_user.max_e8s;
        
        if (balance <= BigInt(0) || min_e8s <= BigInt(0)) {
            setPotentialUsers({ min: 0, max: 0, avg: 0 });
            return;
        }

        const maxUsers = Number(balance / min_e8s);
        const minUsers = Number(balance / max_e8s);
        const avgUsers = Math.floor((maxUsers + minUsers) / 2);

        setPotentialUsers({
            min: Math.floor(minUsers),
            max: Math.floor(maxUsers),
            avg: avgUsers
        });
    };

    const loadAllocationBalance = async () => {
        try {
            const balance = await allocationService.getAllocationBalance(allocationId);
            setAllocationBalance(balance);
        } catch (err) {
            console.error('Error loading allocation balance:', err);
            setError('Failed to load allocation balance');
        }
    };

    const loadTokenMetadata = async () => {
        try {
            const metadata = await tokenService.getMetadataWithLogo(tokenId);
            if (metadata) {
                setTokenMetadata(metadata);
            }
        } catch (err) {
            console.error('Error loading token metadata:', err);
            setError('Failed to load token metadata');
        }
    };

    const loadFundingBalance = async () => {
        try {
            const balance = await allocationService.getFundingBalance(allocationId, true);
            setFundingBalance(balance);
        } catch (err) {
            console.error('Error loading funding balance:', err);
            setError('Failed to load funding balance');
        }
    };

    const loadWalletBalance = async () => {
        try {
            const balance = await icrc1Service.getBalance(tokenId);
            setWalletBalance(BigInt(balance.balance_e8s));
        } catch (err) {
            console.error('Error loading wallet balance:', err);
            setError('Failed to load wallet balance');
        }
    };

    const handleDeposit = async () => {
        try {
            setLoading(true);
            setError(null);
            const amount = parseTokenAmount(depositAmount, tokenId);
            await icrc1Service.transfer({
                tokenId,
                to: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
                amount_e8s: amount.toString(),
                subaccount: allocationService.deriveBackendSubaccount(Principal.fromText(tokenId), allocationId)
            });
            await loadAllData();
            setDepositAmount('');
        } catch (err) {
            console.error('Error depositing:', err);
            setError('Failed to deposit funds');
        } finally {
            setLoading(false);
        }
    };

    const handleWithdraw = async () => {
        try {
            setLoading(true);
            setError(null);
            const amount = parseTokenAmount(withdrawAmount, tokenId);
            await icrc1Service.transfer({
                tokenId,
                to: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
                amount_e8s: amount.toString(),
                subaccount: await allocationService.deriveBackendSubaccount(Principal.fromText(tokenId), allocationId)
            });
            await loadAllData();
            setWithdrawAmount('');
        } catch (err) {
            console.error('Error withdrawing:', err);
            setError('Failed to withdraw funds');
        } finally {
            setLoading(false);
        }
    };

    const handleTopUp = async () => {
        try {
            setLoading(true);
            setError(null);
            await allocationService.topUpAllocation(allocationId, fundingBalance);
            await loadAllData();
            if (onSuccess) {
                onSuccess();
            }
        } catch (err) {
            console.error('Error topping up:', err);
            setError('Failed to top up allocation');
        } finally {
            setLoading(false);
        }
    };

    if (!show) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h3>Top Up Allocation</h3>
                    <button className="close-button" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="balances-container">
                        <div className="funding-balance">
                            <h4>Current Funding Balance</h4>
                            <p>{formatTokenAmount(fundingBalance, tokenId)}</p>
                            {potentialUsers && (
                                <div className="potential-users">
                                    <span>Could fund {potentialUsers.min === potentialUsers.max ? 
                                        potentialUsers.max : 
                                        `${potentialUsers.min}-${potentialUsers.max}`} users</span>
                                </div>
                            )}
                        </div>
                        <div className="wallet-balance">
                            <h4>Wallet Balance</h4>
                            <p>{formatTokenAmount(walletBalance, tokenId)}</p>
                        </div>
                    </div>

                    <div className="allocation-balance">
                        <h4>Allocation Balance</h4>
                        <p>{formatTokenAmount(allocationBalance, tokenId)}</p>
                    </div>

                    <div className="funding-actions">
                        <div className="action-group">
                            <div className="input-wrapper">
                                <label className="input-label">Deposit Amount {tokenMetadata?.symbol ? `(${tokenMetadata.symbol})` : ''}</label>
                                <input
                                    type="text"
                                    value={depositAmount}
                                    onChange={(e) => {
                                        if (/^\d*\.?\d*$/.test(e.target.value) || e.target.value === '') {
                                            setDepositAmount(e.target.value);
                                        }
                                    }}
                                    placeholder="Enter amount"
                                    disabled={loading}
                                />
                            </div>
                            <button
                                className="action-button"
                                onClick={handleDeposit}
                                disabled={loading || !depositAmount || !/^\d*\.?\d*$/.test(depositAmount) || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0 || parseTokenAmount(depositAmount, tokenId) > walletBalance}
                            >
                                <FiPlus /> Deposit
                            </button>
                        </div>

                        <div className="action-group">
                            <div className="input-wrapper">
                                <label className="input-label">Withdraw Amount {tokenMetadata?.symbol ? `(${tokenMetadata.symbol})` : ''}</label>
                                <input
                                    type="text"
                                    value={withdrawAmount}
                                    onChange={(e) => {
                                        if (/^\d*\.?\d*$/.test(e.target.value) || e.target.value === '') {
                                            setWithdrawAmount(e.target.value);
                                        }
                                    }}
                                    placeholder="Enter amount"
                                    disabled={loading}
                                />
                            </div>
                            <button
                                className="action-button"
                                onClick={handleWithdraw}
                                disabled={loading || !withdrawAmount || !/^\d*\.?\d*$/.test(withdrawAmount) || isNaN(Number(withdrawAmount)) || Number(withdrawAmount) <= 0 || parseTokenAmount(withdrawAmount, tokenId) > fundingBalance}
                            >
                                <FiMinus /> Withdraw
                            </button>
                        </div>
                    </div>

                    <button
                        className="top-up-button"
                        onClick={handleTopUp}
                        disabled={loading || fundingBalance <= BigInt(0)}
                    >
                        <FiArrowUp /> Top Up Allocation with {formatTokenAmount(fundingBalance, tokenId)}
                    </button>

                    {error && <div className="error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}; 