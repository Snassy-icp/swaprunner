import React from 'react';
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { SwapInterface } from './components/SwapInterface';
import { AdminPage } from './components/AdminPage';
import { AdminTokensPage } from './components/AdminTokensPage';
import { AdminPricesPage } from './components/AdminPricesPage';
import { Stats } from './pages/Stats';
import { Help } from './pages/Help';
import { WalletPage } from './pages/Wallet';
import { Transactions } from './pages/Transactions';
import { useSlippage } from './contexts/SlippageContext';
import { PoolsPage } from './pages/Pools';
import { Statistics } from './pages/Statistics';
import { Verification } from './pages/help/Verification';
import { Rewards } from './pages/help/Rewards';
import { Me } from './pages/Me';
import AdminAchievementsPage from './components/AdminAchievementsPage';
import AdminUsersPage from './components/AdminUsersPage';

// Wrapper component to handle URL parameters
const SwapInterfaceWithParams: React.FC = () => {
    const { slippageTolerance, setSlippageTolerance } = useSlippage();
    const [searchParams] = useSearchParams();

    // Read slip parameter from URL (in basis points) and convert to percentage
    const slipParam = searchParams.get('slip');
    const slippageFromUrl = slipParam ? Number(slipParam) / 100 : undefined;

    // Update context if URL parameter is present
    React.useEffect(() => {
        if (slippageFromUrl !== undefined) {
            // Ensure a cap of 5% slippage from url parameter.
            const cappedSlippage = Math.min(slippageFromUrl, 5);
            setSlippageTolerance(cappedSlippage);
        }
    }, [slippageFromUrl, setSlippageTolerance]);

    return (
        <SwapInterface
            slippageTolerance={slippageFromUrl ?? slippageTolerance}
            fromTokenParam={searchParams.get('input')}
            toTokenParam={searchParams.get('output')}
        />
    );
};

export const AppRoutes: React.FC = () => {
    return (
        <Routes>
            <Route path="/" element={<SwapInterfaceWithParams />} />
            <Route path="/help" element={<Help />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/pools" element={<PoolsPage />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/me" element={<Me />} />
            <Route path="/statistics" element={<Statistics />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/tokens" element={<AdminTokensPage />} />
            <Route path="/admin/prices" element={<AdminPricesPage />} />
            <Route path="/admin/achievements" element={<AdminAchievementsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/stats" element={<Stats />} />
            <Route path="/help/verification" element={<Verification />} />
            <Route path="/help/rewards" element={<Rewards />} />
        </Routes>
    );
}; 