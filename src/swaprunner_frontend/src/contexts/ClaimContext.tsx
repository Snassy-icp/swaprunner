import React, { createContext, useContext, useState, useEffect } from 'react';
import { allocationService } from '../services/allocation';

interface ClaimableReward {
    achievement_id: string;
    allocation_id: string;
    token_canister_id: string;
    claimable_amount: {
        min_e8s: bigint;
        max_e8s: bigint;
    };
    sponsor: {
        principal: string;
        name: string;
        logo_url: string | null;
    };
}

interface ClaimContextType {
    availableClaims: ClaimableReward[];
    loadClaims: () => Promise<void>;
}

const ClaimContext = createContext<ClaimContextType | null>(null);

export const useClaims = () => {
    const context = useContext(ClaimContext);
    if (!context) {
        throw new Error('useClaims must be used within a ClaimProvider');
    }
    return context;
};

export const ClaimProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [availableClaims, setAvailableClaims] = useState<ClaimableReward[]>([]);

    const loadClaims = async () => {
        try {
            const claims = await allocationService.getAvailableClaimsWithSponsors();
            setAvailableClaims(claims);
        } catch (error) {
            console.error('Error loading claims:', error);
        }
    };

    useEffect(() => {
        loadClaims();
        
        // Refresh claims every minute
        const interval = setInterval(loadClaims, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <ClaimContext.Provider value={{ availableClaims, loadClaims }}>
            {children}
        </ClaimContext.Provider>
    );
}; 