import React, { useState, useEffect } from 'react';
import { FiHeart, FiLoader } from 'react-icons/fi';
import { donationService, DonationEvent } from '../services/donation';
import { CollapsibleSection } from '../pages/Me';
import { formatTokenAmount } from '../utils/format';
import { tokenService } from '../services/token';
import { TokenMetadata } from '../types/token';
import '../styles/DonationsSection.css';

export const DonationsSection: React.FC = () => {
  const [donations, setDonations] = useState<DonationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, TokenMetadata>>({});

  useEffect(() => {
    loadDonations();
  }, []);

  const loadDonations = async () => {
    try {
      setLoading(true);
      setError(null);
      const userDonations = await donationService.getUserDonations();
      setDonations(userDonations);

      // Load token metadata for all unique tokens
      const uniqueTokens = [...new Set(userDonations.map(d => d.token_ledger_id))];
      const metadata: Record<string, TokenMetadata> = {};
      for (const tokenId of uniqueTokens) {
        try {
          const tokenMeta = await tokenService.getTokenMetadata(tokenId);
          metadata[tokenId] = tokenMeta;
        } catch (err) {
          console.error(`Failed to load metadata for token ${tokenId}:`, err);
        }
      }
      setTokenMetadata(metadata);
    } catch (err) {
      console.error('Failed to load donations:', err);
      setError('Failed to load donations. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: bigint) => {
    return new Date(Number(timestamp) / 1_000_000).toLocaleString();
  };

  const donationsContent = (
    <div className="donations-content">
      {loading ? (
        <div className="donations-loading">
          <FiLoader className="spinner" /> Loading donations...
        </div>
      ) : error ? (
        <div className="donations-error">{error}</div>
      ) : donations.length === 0 ? (
        <div className="no-donations">
          <p>You haven't made any donations yet.</p>
          <p className="support-text">Support SwapRunner by making a donation to help maintain and improve the platform.</p>
        </div>
      ) : (
        <div className="donations-list">
          {donations.map((donation, index) => {
            const metadata = tokenMetadata[donation.token_ledger_id];
            return (
              <div key={`${donation.tx_id}-${index}`} className="donation-item">
                <div className="donation-amount">
                  {formatTokenAmount(donation.amount_e8s, donation.token_ledger_id)} {metadata?.symbol || donation.token_ledger_id}
                </div>
                <div className="donation-details">
                  <div className="donation-date">{formatDate(donation.timestamp)}</div>
                  <div className="donation-value">${donation.usd_value.toFixed(2)} USD</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <CollapsibleSection 
      title="My Donations" 
      icon={<FiHeart />}
      defaultExpanded={false}
    >
      {donationsContent}
    </CollapsibleSection>
  );
}; 