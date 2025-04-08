import React, { createContext, useContext, useState, useEffect } from 'react';
import { backendService } from '../services/backend';

interface TokenPriceContextType {
    getTokenPrice: (tokenId: string) => Promise<number | null>;
}

const TokenPriceContext = createContext<TokenPriceContextType | undefined>(undefined);

export const useTokenPrices = () => {
    const context = useContext(TokenPriceContext);
    if (!context) {
        throw new Error('useTokenPrices must be used within a TokenPriceProvider');
    }
    return context;
};

export const TokenPriceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [priceCache, setPriceCache] = useState<Record<string, { price: number; timestamp: number }>>({});
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    const getTokenPrice = async (tokenId: string): Promise<number | null> => {
        const now = Date.now();
        const cached = priceCache[tokenId];

        if (cached && (now - cached.timestamp) < CACHE_DURATION) {
            return cached.price;
        }

        try {
            const actor = await backendService.getActor();
            const price = await actor.get_token_price(tokenId);
            if ('ok' in price) {
                const priceValue = Number(price.ok) / 1e8;
                setPriceCache(prev => ({
                    ...prev,
                    [tokenId]: { price: priceValue, timestamp: now }
                }));
                return priceValue;
            }
            return null;
        } catch (error) {
            console.error('Error fetching token price:', error);
            return null;
        }
    };

    return (
        <TokenPriceContext.Provider value={{ getTokenPrice }}>
            {children}
        </TokenPriceContext.Provider>
    );
}; 