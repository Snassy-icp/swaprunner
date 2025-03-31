import React, { createContext, useContext, useState, useEffect } from 'react';
import { backendService } from '../services/backend';

const AdminContext = createContext<[boolean, boolean]>([false, true]);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkAdmin = async () => {
            try {
                const actor = await backendService.getActor();
                const result = await actor.is_admin();
                setIsAdmin(result);
            } catch (err) {
                console.error('Error checking admin status:', err);
                setIsAdmin(false);
            } finally {
                setLoading(false);
            }
        };

        checkAdmin();
    }, []);

    return (
        <AdminContext.Provider value={[isAdmin, loading]}>
            {children}
        </AdminContext.Provider>
    );
};

export const useIsAdmin = () => useContext(AdminContext); 