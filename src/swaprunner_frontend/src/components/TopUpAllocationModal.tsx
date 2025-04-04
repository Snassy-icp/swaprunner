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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [tokenMetadata, setTokenMetadata] = useState<TokenMetadata | null>(null);

    useEffect(() => {
        if (show) {
            loadFundingBalance();
            loadTokenMetadata();
        }
    }, [show, allocationId, tokenId]);

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
            const balance = await allocationService.getFundingBalance(allocationId);
            setFundingBalance(balance);
        } catch (err) {
            console.error('Error loading funding balance:', err);
            setError('Failed to load funding balance');
        }
    };

    const handleDeposit = async () => {
        try {
            setLoading(true);
            setError(null);
            // Convert decimal amount to e8s using token metadata
            const amount = parseTokenAmount(depositAmount, tokenId);
            await icrc1Service.transfer({
                tokenId,
                to: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
                amount_e8s: amount.toString(),
                subaccount: allocationService.deriveBackendSubaccount(Principal.fromText(tokenId), allocationId)
            });
            await loadFundingBalance();
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
            // Convert decimal amount to e8s using token metadata
            const amount = parseTokenAmount(withdrawAmount, tokenId);
            await icrc1Service.transfer({
                tokenId,
                to: process.env.CANISTER_ID_SWAPRUNNER_BACKEND!,
                amount_e8s: amount.toString(),
                subaccount: await allocationService.deriveBackendSubaccount(Principal.fromText(tokenId), allocationId)
            });
            await loadFundingBalance();
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
            await loadFundingBalance();
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
                    <div className="funding-balance">
                        <h4>Current Funding Balance</h4>
                        <p>{formatTokenAmount(fundingBalance, tokenId)}</p>
                    </div>

                    <div className="funding-actions">
                        <div className="action-group">
                            <div className="input-wrapper">
                                <label className="input-label">Deposit Amount {tokenMetadata?.symbol ? `(${tokenMetadata.symbol})` : ''}</label>
                                <input
                                    type="text"
                                    value={depositAmount}
                                    onChange={(e) => {
                                        // Only allow numbers and decimal points
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
                                disabled={loading || !depositAmount || !/^\d*\.?\d*$/.test(depositAmount) || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0}
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
                                        // Only allow numbers and decimal points
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