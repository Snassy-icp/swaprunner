import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Principal } from '@dfinity/principal';
import { tokenService, WhitelistTokenMetadata } from '../services/token';
import { adminService } from '../services/admin';
import '../styles/AdminTokensPage.css';
import { FiLoader } from 'react-icons/fi';

interface TokenWithLogo extends WhitelistTokenMetadata {
    loadedLogo?: string;
}

interface TokenFormData {
    canisterId: string;
    name: string;
    symbol: string;
    fee: string;
    decimals: string;
    logo: string;
}

interface ImportProgress {
    last_processed: string | null;
    total_tokens: number;
    processed_count: number;
    imported_count: number;
    skipped_count: number;
    failed_count: number;
    is_running: boolean;
}

interface LogoUpdateProgress {
    total_tokens: number;
    processed_count: number;
    updated_count: number;
    skipped_count: number;
    failed_count: number;
    is_running: boolean;
    last_processed: string | null;
}

interface MetadataRefreshProgress {
    total_tokens: number;
    processed_count: number;
    updated_count: number;
    skipped_count: number;
    failed_count: number;
    is_running: boolean;
    last_processed: string | null;
}

interface TokenMetadataModalProps {
    isOpen: boolean;
    onClose: () => void;
    metadata: any | null;
    canisterId: string | null;
}

export const AdminTokensPage: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [tokens, setTokens] = useState<[Principal, TokenWithLogo][]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState<TokenFormData>({
        canisterId: '',
        name: '',
        symbol: '',
        fee: '',
        decimals: '',
        logo: '',
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoadingLogos, setIsLoadingLogos] = useState(false);
    const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const [isCopyingTokens, setIsCopyingTokens] = useState(false);
    const [isUpdatingLogos, setIsUpdatingLogos] = useState(false);
    const [copyResult, setCopyResult] = useState<string | null>(null);
    const [updateLogosResult, setUpdateLogosResult] = useState<string | null>(null);
    const [logoUpdateProgress, setLogoUpdateProgress] = useState<LogoUpdateProgress | null>(null);
    const [logoUpdateError, setLogoUpdateError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [showMetadataModal, setShowMetadataModal] = useState(false);
    const [selectedTokenMetadata, setSelectedTokenMetadata] = useState<any | null>(null);
    const [selectedCanisterId, setSelectedCanisterId] = useState<string | null>(null);
    const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
    const [metadataError, setMetadataError] = useState<string | null>(null);
    const [metadataRefreshProgress, setMetadataRefreshProgress] = useState<MetadataRefreshProgress | null>(null);
    const [metadataRefreshError, setMetadataRefreshError] = useState<string | null>(null);
    const [isRefreshingMetadata, setIsRefreshingMetadata] = useState(false);
    const [logoFormData, setLogoFormData] = useState({
        canisterId: '',
        logo: ''
    });
    const [isSettingLogo, setIsSettingLogo] = useState(false);
    const tokensPerPage = 10;
    const navigate = useNavigate();

    // Calculate pagination
    const totalPages = Math.ceil(tokens.length / tokensPerPage);
    const startIndex = (currentPage - 1) * tokensPerPage;
    const endIndex = startIndex + tokensPerPage;
    const currentTokens = tokens.slice(startIndex, endIndex);

    useEffect(() => {
        const init = async () => {
            try {
                console.log('Initializing admin tokens page...');
                setIsLoading(true);
                setError(null);
                
                console.log('Checking admin status...');
                const adminStatus = await adminService.isAdmin();
                console.log('Admin status:', adminStatus);
                setIsAdmin(adminStatus);
                
                if (adminStatus) {
                    console.log('Fetching whitelisted tokens...');
                    const tokenList = await tokenService.getWhitelistedTokens();
                    console.log('Raw token list from backend:', JSON.stringify(tokenList, (key, value) => 
                        typeof value === 'bigint' ? value.toString() : value
                    ));
                    
                    // Transform the token data to match the expected format
                    const transformedTokens = tokenList.map(([principal, rawMetadata]) => {
                        console.log('Processing token:', principal.toString());
                        console.log('Raw metadata:', rawMetadata);
                        
                        const metadata: TokenWithLogo = {
                            name: Array.isArray(rawMetadata.name) && rawMetadata.name.length > 0 ? rawMetadata.name[0] : null,
                            symbol: Array.isArray(rawMetadata.symbol) && rawMetadata.symbol.length > 0 ? rawMetadata.symbol[0] : null,
                            decimals: Array.isArray(rawMetadata.decimals) && rawMetadata.decimals.length > 0 ? Number(rawMetadata.decimals[0]) || 8 : 8,
                            fee: Array.isArray(rawMetadata.fee) && rawMetadata.fee.length > 0 ? rawMetadata.fee[0] : null,
                            hasLogo: rawMetadata.hasLogo,
                            standard: rawMetadata.standard
                        };
                        console.log('Transformed metadata:', metadata);
                        return [principal, metadata] as [Principal, TokenWithLogo];
                    });
                    
                    console.log('Final transformed tokens:', transformedTokens);
                    console.log('Setting tokens in state, length:', transformedTokens.length);
                    setTokens(transformedTokens);
                } else {
                    console.log('Not an admin, skipping token fetch');
                    setError('You must be an admin to view this page');
                }
            } catch (err) {
                console.error('Error initializing admin tokens page:', err);
                setError(err instanceof Error ? err.message : 'Failed to load token data');
            } finally {
                setIsLoading(false);
            }
        };

        init();
    }, []);

    // Load logos for visible tokens
    useEffect(() => {
        const loadLogos = async () => {
            if (isLoadingLogos) return;
            setIsLoadingLogos(true);

            try {
                let hasUpdates = false;
                const updatedTokens = [...tokens];
                for (const token of currentTokens) {
                    const [principal, metadata] = token;
                    if (metadata.hasLogo && !metadata.loadedLogo) {
                        const logo = await tokenService.getTokenLogo(principal.toString());
                        if (logo) {
                            const index = tokens.findIndex(([p]) => p.toString() === principal.toString());
                            if (index !== -1) {
                                updatedTokens[index] = [principal, { ...metadata, loadedLogo: logo }];
                                hasUpdates = true;
                            }
                        }
                    }
                }
                if (hasUpdates) {
                    setTokens(updatedTokens);
                }
            } catch (err) {
                console.error('Error loading logos:', err);
            } finally {
                setIsLoadingLogos(false);
            }
        };

        loadLogos();
    }, [currentPage, tokens, currentTokens, isLoadingLogos]);

    // Add polling for import progress
    useEffect(() => {
        let pollInterval: NodeJS.Timeout;

        const checkImportProgress = async () => {
            try {
                console.log('Checking import progress...');
                const progress = await tokenService.getImportProgress();
                console.log('Import progress:', progress);
                setImportProgress(progress);
                
                // If import completes, refresh token list
                if (progress && !progress.is_running && progress.processed_count > 0) {
                    console.log('Import completed, refreshing token list...');
                    await loadTokens();
                }
            } catch (err) {
                console.error('Error checking import progress:', err);
                setImportError('Failed to check import progress');
            }
        };

        if (importProgress?.is_running) {
            console.log('Starting import progress polling...');
            pollInterval = setInterval(checkImportProgress, 2000); // Poll every 2 seconds
            // Initial check
            checkImportProgress();
        }

        return () => {
            if (pollInterval) {
                console.log('Cleaning up import progress polling...');
                clearInterval(pollInterval);
            }
        };
    }, [importProgress?.is_running]);

    // Check initial import status
    useEffect(() => {
        const checkInitialStatus = async () => {
            try {
                const progress = await tokenService.getImportProgress();
                setImportProgress(progress);
            } catch (err) {
                console.error('Error checking initial import status:', err);
            }
        };

        if (isAdmin) {
            checkInitialStatus();
        }
    }, [isAdmin]);

    // Add polling for logo update progress
    useEffect(() => {
        let pollInterval: NodeJS.Timeout;

        const checkLogoUpdateProgress = async () => {
            try {
                console.log('Checking logo update progress...');
                const progress = await tokenService.getLogoUpdateProgress();
                console.log('Logo update progress:', progress);
                setLogoUpdateProgress(progress);
                
                // If update completes, refresh token list
                if (progress && !progress.is_running && progress.processed_count > 0) {
                    console.log('Logo update completed, refreshing token list...');
                    await loadTokens();
                }
            } catch (err) {
                console.error('Error checking logo update progress:', err);
                setLogoUpdateError('Failed to check logo update progress');
            }
        };

        if (logoUpdateProgress?.is_running) {
            console.log('Starting logo update progress polling...');
            pollInterval = setInterval(checkLogoUpdateProgress, 2000); // Poll every 2 seconds
            // Initial check
            checkLogoUpdateProgress();
        }

        return () => {
            if (pollInterval) {
                console.log('Cleaning up logo update progress polling...');
                clearInterval(pollInterval);
            }
        };
    }, [logoUpdateProgress?.is_running]);

    // Check initial logo update status
    useEffect(() => {
        const checkInitialStatus = async () => {
            try {
                const progress = await tokenService.getLogoUpdateProgress();
                setLogoUpdateProgress(progress);
            } catch (err) {
                console.error('Error checking initial logo update status:', err);
            }
        };

        if (isAdmin) {
            checkInitialStatus();
        }
    }, [isAdmin]);

    // Add polling for metadata refresh progress
    useEffect(() => {
        let pollInterval: NodeJS.Timeout;

        const checkMetadataRefreshProgress = async () => {
            try {
                console.log('Checking metadata refresh progress...');
                const progress = await tokenService.getMetadataRefreshProgress();
                console.log('Metadata refresh progress:', progress);
                setMetadataRefreshProgress(progress);
                
                // If refresh completes, reload the token list
                if (progress && !progress.is_running && progress.processed_count > 0) {
                    console.log('Metadata refresh completed, refreshing token list...');
                    await loadTokens();
                }
            } catch (err) {
                console.error('Error checking metadata refresh progress:', err);
                setMetadataRefreshError('Failed to check metadata refresh progress');
            }
        };

        if (metadataRefreshProgress?.is_running) {
            console.log('Starting metadata refresh progress polling...');
            pollInterval = setInterval(checkMetadataRefreshProgress, 5000); // Poll every 5 seconds
            checkMetadataRefreshProgress();
        }

        return () => {
            if (pollInterval) {
                console.log('Cleaning up metadata refresh progress polling...');
                clearInterval(pollInterval);
            }
        };
    }, [metadataRefreshProgress?.is_running]);

    // Check initial metadata refresh status
    useEffect(() => {
        const checkInitialStatus = async () => {
            try {
                const progress = await tokenService.getMetadataRefreshProgress();
                setMetadataRefreshProgress(progress);
            } catch (err) {
                console.error('Error checking initial metadata refresh status:', err);
            }
        };

        if (isAdmin) {
            checkInitialStatus();
        }
    }, [isAdmin]);

    const handleAddToken = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.canisterId.trim()) return;

        try {
            let principal: Principal;
            try {
                principal = Principal.fromText(formData.canisterId.trim());
            } catch {
                setError('Invalid principal ID format');
                return;
            }

            const metadata: WhitelistTokenMetadata = {
                name: formData.name.trim() || null,
                symbol: formData.symbol.trim() || null,
                decimals: formData.decimals ? Number(formData.decimals) || 8 : 8,
                fee: formData.fee ? BigInt(formData.fee) : null,
                hasLogo: Boolean(formData.logo),
                standard: "ICRC1", // Default to ICRC1 for manually added tokens
            };

            await tokenService.addToken(principal, metadata, formData.logo || undefined);
            await loadTokens();
            setFormData({
                canisterId: '',
                name: '',
                symbol: '',
                fee: '',
                decimals: '',
                logo: '',
            });
            setShowAddForm(false);
            setError(null);
        } catch (err) {
            setError('Failed to add token');
            console.error('Failed to add token:', err);
        }
    };

    const handleRemoveToken = async (principalId: Principal) => {
        try {
            await tokenService.removeToken(principalId);
            await loadTokens();
            setError(null);
        } catch (err) {
            setError('Failed to remove token');
            console.error('Failed to remove token:', err);
        }
    };

    const loadTokens = async () => {
        try {
            const tokenList = await tokenService.getWhitelistedTokens();
            setTokens(tokenList);
            setError(null);
        } catch (err) {
            setError('Failed to load token list');
            console.error('Failed to load tokens:', err);
        }
    };

    const handleStartImport = async () => {
        try {
            console.log('Starting ICPSwap import...');
            setImportError(null);
            await tokenService.startICPSwapImport(50); // Process 10 tokens at a time
            const progress = await tokenService.getImportProgress();
            console.log('Initial import progress:', progress);
            setImportProgress(progress);
        } catch (err) {
            console.error('Error starting import:', err);
            setImportError('Failed to start import');
        }
    };

    const handleStopImport = async () => {
        try {
            setImportError(null);
            await tokenService.stopICPSwapImport();
            const progress = await tokenService.getImportProgress();
            setImportProgress(progress);
        } catch (err) {
            console.error('Error stopping import:', err);
            setImportError('Failed to stop import');
        }
    };

    const handleClearWhitelist = async () => {
        if (!window.confirm('Are you sure you want to clear the entire token whitelist? This action cannot be undone.')) {
            return;
        }
        try {
            await tokenService.clearWhitelist();
            await loadTokens(); // Refresh the token list
            setError(null);
        } catch (err) {
            console.error('Error clearing whitelist:', err);
            setError('Failed to clear whitelist');
        }
    };

    const handleCopyICPSwapTokens = async () => {
        try {
            setIsLoading(true);
            const result = await tokenService.copyICPSwapTokens();
            setMessage('ICPSwap tokens copied successfully');
            await loadTokens();
        } catch (error) {
            setError('Failed to copy ICPSwap tokens');
            console.error('Failed to copy ICPSwap tokens:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClearICPSwapTokens = async () => {
        if (window.confirm('Are you sure you want to clear all ICPSwap tokens? This action cannot be undone.')) {
            try {
                setIsLoading(true);
                await tokenService.clearICPSwapTokens();
                setMessage('ICPSwap tokens cleared successfully');
                await loadTokens();
            } catch (error) {
                setError('Failed to clear ICPSwap tokens');
                console.error('Failed to clear ICPSwap tokens:', error);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleStopLogoUpdate = async () => {
        try {
            setLogoUpdateError(null);
            await tokenService.stopLogoUpdate();
            const progress = await tokenService.getLogoUpdateProgress();
            setLogoUpdateProgress(progress);
        } catch (err) {
            console.error('Error stopping logo update:', err);
            setLogoUpdateError('Failed to stop logo update');
        }
    };

    const handleUpdateICPSwapLogos = async () => {
        try {
            setIsUpdatingLogos(true);
            setUpdateLogosResult(null);
            setLogoUpdateError(null);
            await tokenService.updateICPSwapTokenLogos(5); // Process 5 logos at a time
            const progress = await tokenService.getLogoUpdateProgress();
            setLogoUpdateProgress(progress);
        } catch (err) {
            console.error('Error updating ICPSwap token logos:', err);
            setLogoUpdateError('Failed to start logo update');
        } finally {
            setIsUpdatingLogos(false);
        }
    };

    const handleClearLogoCache = async () => {
        try {
            setError(null);
            await tokenService.clearCache('logo');
            setSuccessMessage('Logo cache cleared successfully');
            setTimeout(() => setSuccessMessage(null), 3000); // Clear message after 3 seconds
        } catch (err) {
            console.error('Error clearing logo cache:', err);
            setError('Failed to clear logo cache');
        }
    };

    const handleClearWhitelistCache = async () => {
        try {
            setError(null);
            await tokenService.clearCache('all');
            setSuccessMessage('Whitelist cache cleared successfully');
            setTimeout(() => setSuccessMessage(null), 3000); // Clear message after 3 seconds
        } catch (err) {
            console.error('Error clearing whitelist cache:', err);
            setError('Failed to clear whitelist cache');
        }
    };

    const handleClearBackendLogoCache = async () => {
        if (window.confirm('Are you sure you want to clear the backend logo cache? This action cannot be undone.')) {
            try {
                setError(null);
                await adminService.clearLogoCache();
                setSuccessMessage('Backend logo cache cleared successfully');
                setTimeout(() => setSuccessMessage(null), 3000);
                await loadTokens(); // Refresh the token list to show updated logo states
            } catch (err) {
                console.error('Error clearing backend logo cache:', err);
                setError('Failed to clear backend logo cache');
            }
        }
    };

    const handleRefreshMetadata = async (canisterId: string) => {
        try {
            setMessage(null);
            setError(null);
            await tokenService.refreshTokenMetadata(canisterId);
            setSuccessMessage(`Successfully refreshed metadata for token ${canisterId}`);
            await loadTokens(); // Reload the token list to show updated metadata
        } catch (err) {
            console.error('Error refreshing token metadata:', err);
            setError(err instanceof Error ? err.message : 'Failed to refresh token metadata');
        }
    };

    const handleViewMetadata = async (canisterId: string) => {
        try {
            setError(null);
            setMessage(null);
            setMetadataError(null);
            setSelectedTokenMetadata(null);
            setIsLoadingMetadata(true);
            setShowMetadataModal(true);
            setSelectedCanisterId(canisterId);
            
            // Fetch metadata directly from backend
            const result = await tokenService.getTokenMetadata(canisterId);
            
            if (!result) {
                throw new Error(`No metadata found for token ${canisterId}`);
            }
            
            setSelectedTokenMetadata(result);
        } catch (err) {
            console.error('Error fetching token metadata:', err);
            setMetadataError(err instanceof Error ? err.message : 'Failed to fetch token metadata');
        } finally {
            setIsLoadingMetadata(false);
        }
    };

    // Add handler for starting metadata refresh
    const handleStartMetadataRefresh = async () => {
        try {
            setIsRefreshingMetadata(true);
            setMetadataRefreshProgress(null);
            setMetadataRefreshError(null);
            await tokenService.startMetadataRefresh(5); // Process 5 tokens at a time
            const progress = await tokenService.getMetadataRefreshProgress();
            setMetadataRefreshProgress(progress);
        } catch (err) {
            console.error('Error starting metadata refresh:', err);
            setMetadataRefreshError('Failed to start metadata refresh');
        } finally {
            setIsRefreshingMetadata(false);
        }
    };

    // Add handler for stopping metadata refresh
    const handleStopMetadataRefresh = async () => {
        try {
            await tokenService.stopMetadataRefresh();
            const progress = await tokenService.getMetadataRefreshProgress();
            setMetadataRefreshProgress(progress);
        } catch (err) {
            console.error('Error stopping metadata refresh:', err);
            setMetadataRefreshError('Failed to stop metadata refresh');
        }
    };

    // Add handler for resuming metadata refresh
    const handleResumeMetadataRefresh = async () => {
        try {
            setIsRefreshingMetadata(true);
            setMetadataRefreshError(null);
            await tokenService.resumeMetadataRefresh(5); // Process 5 tokens at a time
            const progress = await tokenService.getMetadataRefreshProgress();
            setMetadataRefreshProgress(progress);
        } catch (err) {
            console.error('Error resuming metadata refresh:', err);
            setMetadataRefreshError('Failed to resume metadata refresh');
        } finally {
            setIsRefreshingMetadata(false);
        }
    };

    const handleSetLogo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!logoFormData.canisterId || !logoFormData.logo) {
            setError('Both canister ID and logo URL are required');
            return;
        }

        setIsSettingLogo(true);
        setError(null);
        try {
            await adminService.setTokenLogo(logoFormData.canisterId, logoFormData.logo);
            setSuccessMessage('Logo set successfully');
            setLogoFormData({ canisterId: '', logo: '' });
            await loadTokens(); // Refresh the token list
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to set logo');
        } finally {
            setIsSettingLogo(false);
        }
    };

    const MetadataModal: React.FC<TokenMetadataModalProps> = ({ isOpen, onClose, metadata, canisterId }) => {
        if (!isOpen) return null;

        const formatValue = (key: string, value: any): string => {
            if (value === null) return 'null';
            if (value === undefined) return 'undefined';
            if (typeof value === 'bigint') return value.toString();
            if (Array.isArray(value)) {
                if (value.length === 0) return '[]';
                if (value.length === 1) {
                    const item = value[0];
                    if (typeof item === 'bigint') return item.toString();
                    return item?.toString() || 'null';
                }
                // Convert any BigInt values in the array before stringifying
                return JSON.stringify(value, (_, v) => 
                    typeof v === 'bigint' ? v.toString() : v
                );
            }
            if (typeof value === 'object') {
                // Convert any BigInt values in the object before stringifying
                return JSON.stringify(value, (_, v) =>
                    typeof v === 'bigint' ? v.toString() : v
                );
            }
            return String(value);
        };

        return (
            <div className="modal-overlay">
                <div className="modal-content">
                    <div className="modal-header">
                        <h2>Token Metadata - {canisterId}</h2>
                        <button className="close-button" onClick={onClose}>×</button>
                    </div>
                    <div className="modal-body">
                        {isLoadingMetadata ? (
                            <div className="loading">Loading metadata...</div>
                        ) : metadataError ? (
                            <div className="error-message">{metadataError}</div>
                        ) : metadata ? (
                            <div className="metadata-content">
                                {Object.entries(metadata).map(([key, value]) => (
                                    <div key={key} className="metadata-row">
                                        <span className="metadata-key">{key}:</span>
                                        <span className="metadata-value">
                                            {formatValue(key, value)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="error-message">No metadata available</div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="admin-tokens-page">
                <div className="loading">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="admin-tokens-page">
                <div className="error-message">{error}</div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="admin-tokens-page">
                <div className="error-message">You do not have admin access.</div>
            </div>
        );
    }

    return (
        <div className="admin-tokens-page">
            <h1>Token Management</h1>

            {message && (
                <div className={`result-message ${message.includes('Failed') ? 'error' : 'success'}`}>
                    {message}
                </div>
            )}

            {successMessage && (
                <div className="result-message success">
                    {successMessage}
                </div>
            )}

            <div className="token-actions">
                <div className="action-buttons">
                    <button 
                        className="add-button"
                        onClick={() => setShowAddForm(!showAddForm)}
                    >
                        {showAddForm ? 'Cancel' : 'Add Token'}
                    </button>
                    
                    <div className="button-group">
                        <h3>Cache Controls</h3>
                        <button
                            className="clear-cache-button"
                            onClick={handleClearLogoCache}
                            title="Clear client-side logo cache"
                        >
                            Clear Client Logo Cache
                        </button>
                        <button
                            className="clear-cache-button"
                            onClick={handleClearWhitelistCache}
                            title="Clear client-side whitelist cache"
                        >
                            Clear Client Whitelist Cache
                        </button>
                    </div>

                    <div className="button-group">
                        <h3>Backend Controls</h3>
                        <button 
                            className="clear-whitelist-button"
                            onClick={handleClearWhitelist}
                            title="Clear entire backend token whitelist"
                        >
                            Clear Backend Whitelist
                        </button>
                        <button 
                            className="copy-button"
                            onClick={handleCopyICPSwapTokens}
                            title="Copy tokens from ICPSwap"
                        >
                            Copy ICPSwap Whitelist
                        </button>
                        <button 
                            className="update-logos-button"
                            onClick={handleUpdateICPSwapLogos}
                            title="Update logos from ICPSwap"
                            disabled={logoUpdateProgress?.is_running}
                        >
                            Update ICPSwap Logos
                        </button>
                        <button 
                            className="clear-whitelist-button"
                            onClick={handleClearICPSwapTokens}
                            title="Clear ICPSwap token copy"
                        >
                            Clear ICPSwap Copy
                        </button>
                        <button 
                            className="clear-whitelist-button"
                            onClick={handleClearBackendLogoCache}
                            title="Clear backend logo cache"
                        >
                            Clear Backend Logo Cache
                        </button>
                    </div>
                </div>
                
                <div className="import-section">
                    {importProgress?.is_running ? (
                        <div className="import-progress">
                            <FiLoader className="spinner" />
                            <div className="import-stats">
                                <div>Processed: {importProgress.processed_count} / {importProgress.total_tokens || '?'} tokens</div>
                                <div className="import-details">
                                    <span className="stat">
                                        <span className="label">Imported:</span> {importProgress.imported_count}
                                    </span>
                                    <span className="stat">
                                        <span className="label">Skipped:</span> {importProgress.skipped_count}
                                    </span>
                                    <span className="stat">
                                        <span className="label">Failed:</span> {importProgress.failed_count}
                                    </span>
                                </div>
                            </div>
                            <button 
                                className="stop-import-button"
                                onClick={handleStopImport}
                            >
                                Stop Import
                            </button>
                        </div>
                    ) : (
                        <button 
                            className="import-button"
                            onClick={handleStartImport}
                        >
                            Import from ICPSwap
                        </button>
                    )}
                    {importError && (
                        <div className="import-error">
                            {importError}
                        </div>
                    )}
                </div>

                {logoUpdateProgress?.is_running && (
                    <div className="logo-update-progress">
                        <FiLoader className="spinner" />
                        <div className="logo-update-stats">
                            <div>Processed: {logoUpdateProgress.processed_count} / {logoUpdateProgress.total_tokens || '?'} logos</div>
                            <div className="logo-update-details">
                                <span className="stat">
                                    <span className="label">Updated:</span> {logoUpdateProgress.updated_count}
                                </span>
                                <span className="stat">
                                    <span className="label">Skipped:</span> {logoUpdateProgress.skipped_count}
                                </span>
                                <span className="stat">
                                    <span className="label">Failed:</span> {logoUpdateProgress.failed_count}
                                </span>
                            </div>
                        </div>
                        <button 
                            className="stop-logo-update-button"
                            onClick={handleStopLogoUpdate}
                        >
                            Stop Update
                        </button>
                    </div>
                )}
                {logoUpdateError && (
                    <div className="logo-update-error">
                        {logoUpdateError}
                    </div>
                )}
            </div>

            {/* Add metadata refresh section */}
            <div className="metadata-refresh-section">
                <h2>Bulk Metadata Refresh</h2>
                <div className="metadata-refresh-controls">
                    {metadataRefreshProgress?.is_running ? (
                        <>
                            <div className="progress-info">
                                <p>Progress: {metadataRefreshProgress.processed_count} / {metadataRefreshProgress.total_tokens} tokens processed</p>
                                <p>Updated: {metadataRefreshProgress.updated_count}</p>
                                <p>Failed: {metadataRefreshProgress.failed_count}</p>
                                <p>Skipped: {metadataRefreshProgress.skipped_count}</p>
                                {metadataRefreshProgress.last_processed && (
                                    <p>Last processed: {metadataRefreshProgress.last_processed}</p>
                                )}
                            </div>
                            <button
                                className="stop-button"
                                onClick={handleStopMetadataRefresh}
                                title="Stop metadata refresh"
                            >
                                Stop Refresh
                            </button>
                        </>
                    ) : (
                        <div className="refresh-buttons">
                            <button
                                className="refresh-button"
                                onClick={handleStartMetadataRefresh}
                                disabled={isRefreshingMetadata}
                                title="Start metadata refresh from beginning"
                            >
                                {isRefreshingMetadata ? (
                                    <>
                                        <FiLoader className="spinner" />
                                        Starting...
                                    </>
                                ) : (
                                    'Start New Refresh'
                                )}
                            </button>
                            {metadataRefreshProgress?.last_processed && (
                                <button
                                    className="resume-button"
                                    onClick={handleResumeMetadataRefresh}
                                    disabled={isRefreshingMetadata}
                                    title="Resume metadata refresh from last processed token"
                                >
                                    {isRefreshingMetadata ? (
                                        <>
                                            <FiLoader className="spinner" />
                                            Resuming...
                                        </>
                                    ) : (
                                        'Resume Previous'
                                    )}
                                </button>
                            )}
                        </div>
                    )}
                </div>
                {metadataRefreshError && (
                    <p className="error-message">{metadataRefreshError}</p>
                )}
            </div>

            {showAddForm && (
                <form className="add-token-form" onSubmit={handleAddToken}>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Canister ID:</label>
                            <div className="input-with-button">
                                <input
                                    type="text"
                                    value={formData.canisterId}
                                    onChange={(e) => setFormData({ ...formData, canisterId: e.target.value })}
                                    placeholder="Enter Canister ID"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Name:</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Token Name (optional)"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Symbol:</label>
                            <input
                                type="text"
                                value={formData.symbol}
                                onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                                placeholder="Token Symbol (optional)"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Fee:</label>
                            <input
                                type="text"
                                value={formData.fee}
                                onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                                placeholder="Token Fee (optional)"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Decimals:</label>
                            <input
                                type="text"
                                value={formData.decimals}
                                onChange={(e) => setFormData({ ...formData, decimals: e.target.value })}
                                placeholder="Token Decimals (optional)"
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Logo URL:</label>
                            <input
                                type="text"
                                value={formData.logo}
                                onChange={(e) => setFormData({ ...formData, logo: e.target.value })}
                                placeholder="Logo URL (optional)"
                            />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button type="submit" className="submit-button">Add Token</button>
                        <button type="button" className="cancel-button" onClick={() => setShowAddForm(false)}>
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Add new metadata lookup form */}
            <div className="metadata-lookup-section">
                <h2>Token Metadata Lookup</h2>
                <div className="metadata-lookup-form">
                    <input
                        type="text"
                        placeholder="Enter Ledger/Token ID"
                        value={selectedCanisterId || ''}
                        onChange={(e) => setSelectedCanisterId(e.target.value)}
                        className="metadata-lookup-input"
                    />
                    <div className="metadata-lookup-buttons">
                        <button
                            className="view-metadata-button"
                            onClick={() => {
                                if (selectedCanisterId) {
                                    handleViewMetadata(selectedCanisterId);
                                }
                            }}
                            disabled={!selectedCanisterId}
                            title="View token metadata"
                        >
                            View Metadata
                        </button>
                        <button
                            className="refresh-button"
                            onClick={() => {
                                if (selectedCanisterId) {
                                    handleRefreshMetadata(selectedCanisterId);
                                }
                            }}
                            disabled={!selectedCanisterId}
                            title="Refresh token metadata"
                        >
                            Refresh Metadata
                        </button>
                    </div>
                </div>
            </div>

            <div className="admin-section">
                <h3>Set Token Logo</h3>
                <form onSubmit={handleSetLogo} className="logo-form">
                    <div className="form-group">
                        <label htmlFor="logoCanisterId">Token Canister ID:</label>
                        <input
                            id="logoCanisterId"
                            type="text"
                            value={logoFormData.canisterId}
                            onChange={(e) => setLogoFormData(prev => ({ ...prev, canisterId: e.target.value }))}
                            placeholder="Enter token canister ID"
                            disabled={isSettingLogo}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="logoUrl">Logo URL:</label>
                        <input
                            id="logoUrl"
                            type="text"
                            value={logoFormData.logo}
                            onChange={(e) => setLogoFormData(prev => ({ ...prev, logo: e.target.value }))}
                            placeholder="Enter logo URL"
                            disabled={isSettingLogo}
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={isSettingLogo || !logoFormData.canisterId || !logoFormData.logo}
                        className="primary-button"
                    >
                        {isSettingLogo ? 'Setting Logo...' : 'Set Logo'}
                    </button>
                </form>
            </div>

            <div className="token-list-section">
                <div className="token-list">
                    <h2>Whitelisted Tokens</h2>
                    {currentTokens.length === 0 ? (
                        <div className="no-tokens">No tokens found</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Token</th>
                                    <th>Name</th>
                                    <th>Symbol</th>
                                    <th>Decimals</th>
                                    <th>Fee</th>
                                    <th>Standard</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentTokens.map(([principal, metadata]) => (
                                    <tr key={principal.toString()}>
                                        <td className="token-cell">
                                            <div className="token-info">
                                                {metadata.hasLogo && (
                                                    <img 
                                                        src={metadata.loadedLogo || '/generic_token.svg'}
                                                        alt={metadata.symbol || 'Token'}
                                                        className="token-logo"
                                                        onError={(e) => {
                                                            const img = e.target as HTMLImageElement;
                                                            img.src = '/generic_token.svg';
                                                        }}
                                                    />
                                                )}
                                                <span className="token-id">{principal.toString()}</span>
                                            </div>
                                        </td>
                                        <td>{metadata.name || 'Unknown'}</td>
                                        <td>{metadata.symbol || 'Unknown'}</td>
                                        <td>{metadata.decimals}</td>
                                        <td>{metadata.fee ? metadata.fee.toString() : 'Unknown'}</td>
                                        <td>{metadata.standard}</td>
                                        <td>
                                            <button
                                                className="view-metadata-button"
                                                onClick={() => handleViewMetadata(principal.toString())}
                                                title="View token metadata"
                                            >
                                                View
                                            </button>
                                            <button
                                                className="refresh-button"
                                                onClick={() => handleRefreshMetadata(principal.toString())}
                                                title="Refresh token metadata"
                                            >
                                                Refresh
                                            </button>
                                            <button
                                                className="remove-button"
                                                onClick={() => handleRemoveToken(principal)}
                                                title="Remove token"
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {totalPages > 1 && (
                        <div className="pagination">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                Previous
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={currentPage === page ? 'active' : ''}
                                >
                                    {page}
                                </button>
                            ))}
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
            
            <MetadataModal
                isOpen={showMetadataModal}
                onClose={() => {
                    setShowMetadataModal(false);
                    setSelectedTokenMetadata(null);
                    setSelectedCanisterId(null);
                }}
                metadata={selectedTokenMetadata}
                canisterId={selectedCanisterId}
            />
        </div>
    );
}; 