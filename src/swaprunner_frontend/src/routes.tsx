import React, { useEffect, useState } from 'react';
import { Routes, Route, useSearchParams, Navigate } from 'react-router-dom';
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
import { Sponsors } from './pages/Sponsors';
import Maintenance from './pages/Maintenance';
import AdminAchievementsPage from './components/AdminAchievementsPage';
import AdminUsersPage from './components/AdminUsersPage';
import { backendService } from './services/backend';

// Wrapper component to handle URL parameters and maintenance mode
const SwapInterfaceWithParams: React.FC = () => {
    const { slippageTolerance, setSlippageTolerance } = useSlippage();
    const [searchParams] = useSearchParams();
    const [isPanicMode, setIsPanicMode] = useState(false);

    useEffect(() => {
        const checkPanicMode = async () => {
            try {
                const actor = await backendService.getActor();
                const panicMode = await actor.get_panic_mode();
                setIsPanicMode(panicMode);
            } catch (error) {
                console.error('Error checking panic mode:', error);
            }
        };
        checkPanicMode();
    }, []);

    // Read slip parameter from URL (in basis points) and convert to percentage
    const slipParam = searchParams.get('slip');
    const slippageFromUrl = slipParam ? Number(slipParam) / 100 : undefined;

    // Update context if URL parameter is present
    React.useEffect(() => {
        if (slippageFromUrl !== undefined) {
            const cappedSlippage = Math.min(slippageFromUrl, 5);
            setSlippageTolerance(cappedSlippage);
        }
    }, [slippageFromUrl, setSlippageTolerance]);

    if (isPanicMode) {
        return <Navigate to="/maintenance" replace />;
    }

    return (
        <SwapInterface
            slippageTolerance={slippageFromUrl ?? slippageTolerance}
            fromTokenParam={searchParams.get('input')}
            toTokenParam={searchParams.get('output')}
        />
    );
};

// Wrapper component to handle maintenance mode for regular pages
const MaintenanceWrapper: React.FC<{ component: React.ComponentType }> = ({ component: Component }) => {
    const [isPanicMode, setIsPanicMode] = useState(false);

    useEffect(() => {
        const checkPanicMode = async () => {
            try {
                const actor = await backendService.getActor();
                const panicMode = await actor.get_panic_mode();
                setIsPanicMode(panicMode);
            } catch (error) {
                console.error('Error checking panic mode:', error);
            }
        };
        checkPanicMode();
    }, []);

    if (isPanicMode) {
        return <Navigate to="/maintenance" replace />;
    }

    return <Component />;
};

export const AppRoutes: React.FC = () => {
    return (
        <Routes>
            <Route path="/" element={<SwapInterfaceWithParams />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/help" element={<MaintenanceWrapper component={Help} />} />
            <Route path="/wallet" element={<MaintenanceWrapper component={WalletPage} />} />
            <Route path="/pools" element={<MaintenanceWrapper component={PoolsPage} />} />
            <Route path="/transactions" element={<MaintenanceWrapper component={Transactions} />} />
            <Route path="/me" element={<MaintenanceWrapper component={Me} />} />
            <Route path="/statistics" element={<MaintenanceWrapper component={Statistics} />} />
            <Route path="/sponsors" element={<MaintenanceWrapper component={Sponsors} />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/tokens" element={<AdminTokensPage />} />
            <Route path="/admin/prices" element={<AdminPricesPage />} />
            <Route path="/admin/achievements" element={<AdminAchievementsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/stats" element={<Stats />} />
            <Route path="/help/verification" element={<MaintenanceWrapper component={Verification} />} />
            <Route path="/help/rewards" element={<MaintenanceWrapper component={Rewards} />} />
        </Routes>
    );
}; 