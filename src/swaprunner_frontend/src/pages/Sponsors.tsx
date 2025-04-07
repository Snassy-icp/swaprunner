import React, { useEffect, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiCheck, FiExternalLink } from 'react-icons/fi';
import { userProfileService } from '../services/userProfile';
import { allocationService } from '../services/allocation';
import { tokenService } from '../services/token';
import { formatTokenAmount } from '../utils/format';
import { TokenMetadata } from '../types/token';
import '../styles/Sponsors.css';
interface UserProfile {
    principal: string;
    name: string;
    description: string;
    logo_url: [string] | [];
    social_links: Array<{
        platform: string;
        url: string;
    }>;
    created_at: bigint;
    updated_at: bigint;
    created_by: string;
    verified: boolean;
}

interface AllocationClaim {
    allocation_id: string;
    user: string;
    amount_e8s: bigint;
    claimed_at: bigint;
}

interface SponsorWithClaims {
    profile: UserProfile;
    totalClaims: number;
    totalAmountE8s: bigint;
    tokenMetadata?: TokenMetadata;
}

export const Sponsors: React.FC = () => {
    const [sponsors, setSponsors] = useState<SponsorWithClaims[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSponsors, setExpandedSponsors] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadSponsors();
    }, []);

    const loadSponsors = async () => {
        try {
            setLoading(true);
            setError(null);
            const profiles = await userProfileService.getVerifiedProfiles();
            
            const sponsorsWithClaims = await Promise.all(profiles.map(async (profile: UserProfile) => {
                const claims = await allocationService.getSponsorClaims(profile.principal);
                const totalClaims = claims.length;
                const totalAmountE8s = claims.reduce((sum: bigint, claim: AllocationClaim) => sum + claim.amount_e8s, BigInt(0));

                // Find token link if it exists
                const tokenLink = profile.social_links.find((link: { platform: string; url: string }) => link.platform === 'token');
                let tokenMetadata: TokenMetadata | undefined;

                if (tokenLink) {
                    try {
                        tokenMetadata = await tokenService.getMetadataWithLogo(tokenLink.url);
                    } catch (err) {
                        console.warn(`Failed to fetch token metadata for ${tokenLink.url}:`, err);
                    }
                }

                return {
                    profile,
                    totalClaims,
                    totalAmountE8s,
                    tokenMetadata
                };
            }));

            setSponsors(sponsorsWithClaims);
        } catch (err) {
            console.error('Error loading sponsors:', err);
            setError('Failed to load sponsors');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (timestamp: bigint): string => {
        return new Date(Number(timestamp)).toLocaleString();
    };

    const toggleSponsor = (principalId: string) => {
        const newExpandedSponsors = new Set(expandedSponsors);
        if (newExpandedSponsors.has(principalId)) {
            newExpandedSponsors.delete(principalId);
        } else {
            newExpandedSponsors.add(principalId);
        }
        setExpandedSponsors(newExpandedSponsors);
    };

    if (loading) {
        return (
            <div className="sponsors-page">
                <div className="swap-box">
                    <div className="loading">Loading sponsors...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="sponsors-page">
                <div className="swap-box">
                    <div className="error-message">{error}</div>
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
                        <div key={sponsor.profile.principal} className="sponsor-card">
                            <div 
                                className="sponsor-header"
                                onClick={() => toggleSponsor(sponsor.profile.principal)}
                            >
                                <div className="sponsor-logo-cell">
                                    <img 
                                        className="sponsor-logo"
                                        src={sponsor.tokenMetadata?.logo_url || sponsor.profile.logo_url[0] || '/default-logo.png'}
                                        alt={`${sponsor.profile.name} logo`}
                                        onError={(e) => {
                                            const img = e.target as HTMLImageElement;
                                            img.src = '/default-logo.png';
                                        }}
                                    />
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
                                    </div>
                                    <div className="sponsor-stats">
                                        <span>{sponsor.totalClaims} claims</span>
                                        <span>•</span>
                                        <span>{formatTokenAmount(sponsor.totalAmountE8s, sponsor.tokenId || '')} {sponsor.tokenMetadata?.symbol || 'tokens'} distributed</span>
                                    </div>
                                </div>
                                <button className="expand-button">
                                    {expandedSponsors.has(sponsor.profile.principal) ? <FiChevronUp /> : <FiChevronDown />}
                                </button>
                            </div>
                            {expandedSponsors.has(sponsor.profile.principal) && (
                                <div className="sponsor-details">
                                    <p className="sponsor-description">{sponsor.profile.description}</p>
                                    {sponsor.profile.social_links.length > 0 && (
                                        <div className="social-links">
                                            {sponsor.profile.social_links.map((link, index) => (
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
                                    <div className="sponsor-footer">
                                        <span>Joined: {formatDate(sponsor.profile.created_at)}</span>
                                        <span>Last active: {formatDate(sponsor.profile.updated_at)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}; 