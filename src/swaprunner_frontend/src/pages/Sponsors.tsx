import React, { useState, useEffect } from 'react';
import { backendService } from '../services/backend';
import { allocationService } from '../services/allocation';
import { FiChevronDown, FiChevronUp, FiCheck } from 'react-icons/fi';
import '../styles/Sponsors.css';

interface UserProfile {
    principal: string;
    name: string;
    description: string;
    logo_url?: string;
    social_links: {
        platform: string;
        url: string;
    }[];
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
}

export const Sponsors: React.FC = () => {
    const [sponsors, setSponsors] = useState<SponsorWithClaims[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSponsor, setExpandedSponsor] = useState<string | null>(null);

    useEffect(() => {
        const loadSponsors = async () => {
            try {
                setLoading(true);
                setError(null);

                // Get all user profiles
                const actor = await backendService.getActor();
                const profiles = await actor.listUserProfiles(0, 1000);
                const claims = await actor.get_all_allocation_claims();

                // Calculate claims per sponsor
                const sponsorClaims = new Map<string, { count: number, amount: bigint }>();
                claims.forEach((claim: AllocationClaim) => {
                    const sponsorId = claim.user.toString();
                    const current = sponsorClaims.get(sponsorId) || { count: 0, amount: BigInt(0) };
                    sponsorClaims.set(sponsorId, {
                        count: current.count + 1,
                        amount: current.amount + claim.amount_e8s
                    });
                });

                // Combine profiles with their claims
                const sponsorsWithClaims: SponsorWithClaims[] = profiles
                    .map((profile: UserProfile) => ({
                        profile,
                        totalClaims: sponsorClaims.get(profile.principal.toString())?.count || 0,
                        totalAmountE8s: sponsorClaims.get(profile.principal.toString())?.amount || BigInt(0)
                    }))
                    .filter((sponsor: SponsorWithClaims) => sponsor.totalClaims > 0) // Only show sponsors with claims
                    .sort((a: SponsorWithClaims, b: SponsorWithClaims) => b.totalClaims - a.totalClaims); // Sort by number of claims

                setSponsors(sponsorsWithClaims);
            } catch (err) {
                console.error('Error loading sponsors:', err);
                setError('Failed to load sponsors');
            } finally {
                setLoading(false);
            }
        };

        loadSponsors();
    }, []);

    const formatDate = (timestamp: bigint) => {
        // Convert from nanoseconds to milliseconds
        const milliseconds = Number(timestamp) / 1_000_000;
        return new Date(milliseconds).toLocaleString();
    };

    const toggleSponsor = (principalId: string) => {
        setExpandedSponsor(expandedSponsor === principalId ? null : principalId);
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
                <h1>Our Sponsors</h1>
                <div className="sponsors-list">
                    {sponsors.map(({ profile, totalClaims, totalAmountE8s }) => (
                        <div key={profile.principal} className="sponsor-card">
                            <div 
                                className="sponsor-header" 
                                onClick={() => toggleSponsor(profile.principal)}
                            >
                                <div className="sponsor-info">
                                    <div className="sponsor-name">
                                        {profile.name}
                                        {profile.verified && (
                                            <span className="verified-badge" title="Verified Sponsor">
                                                <FiCheck />
                                            </span>
                                        )}
                                    </div>
                                    <div className="sponsor-stats">
                                        <span>{totalClaims} claims</span>
                                        <span>{totalAmountE8s.toString()} tokens distributed</span>
                                    </div>
                                </div>
                                <button className="expand-button">
                                    {expandedSponsor === profile.principal ? <FiChevronUp /> : <FiChevronDown />}
                                </button>
                            </div>
                            {expandedSponsor === profile.principal && (
                                <div className="sponsor-details">
                                    <p className="sponsor-description">{profile.description}</p>
                                    {profile.social_links.length > 0 && (
                                        <div className="social-links">
                                            {profile.social_links.map((link, index) => (
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
                                        <span>Joined: {formatDate(profile.created_at)}</span>
                                        <span>Last active: {formatDate(profile.updated_at)}</span>
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