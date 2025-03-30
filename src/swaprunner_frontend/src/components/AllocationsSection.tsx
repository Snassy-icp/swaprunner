import React, { useState, useEffect } from 'react';
import { FiGift, FiRefreshCw, FiChevronDown, FiChevronUp, FiLoader, FiPlus } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { backendService } from '../services/backend';
import { CollapsibleSection } from '../pages/Me';
import { formatTokenAmount } from '../utils/format';
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

    const handleCreateAllocation = () => {
        navigate('/admin/achievements?action=create_allocation');
    };

    const allocationsContent = (
        <div className="allocations-content">
            <div className="allocations-actions">
                <button 
                    className="create-button" 
                    onClick={handleCreateAllocation}
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

            {loading ? (
                <div className="allocations-loading">Loading allocations...</div>
            ) : (
                <div className="allocations-list">
                    {allocations.length === 0 ? (
                        <div className="no-allocations">
                            You haven't created any allocations yet.
                            <button 
                                className="create-first-button"
                                onClick={handleCreateAllocation}
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