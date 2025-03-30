import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Principal } from '@dfinity/principal';
import { adminService } from '../services/admin';
import { authService } from '../services/auth';
import { priceService } from '../services/price';
import '../styles/AdminPage.css';

export const AdminPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [admins, setAdmins] = useState<Principal[]>([]);
  const [newAdmin, setNewAdmin] = useState('');
  const [removeAdminId, setRemoveAdminId] = useState('');
  const [icpPrice, setIcpPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const adminStatus = await adminService.isAdmin();
        setIsAdmin(adminStatus);
        
        if (adminStatus) {
          const adminList = await adminService.getAdmins();
          setAdmins(adminList);
        }
      } catch (err) {
        console.error('Error initializing admin page:', err);
        setError(err instanceof Error ? err.message : 'Failed to load admin data');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdmin.trim()) return;

    try {
      let principal: Principal;
      try {
        principal = Principal.fromText(newAdmin.trim());
      } catch {
        setError('Invalid principal ID format');
        return;
      }

      await adminService.addAdmin(principal);
      await loadAdmins();
      setNewAdmin('');
      setError(null);
    } catch (err) {
      setError('Failed to add admin');
      console.error('Failed to add admin:', err);
    }
  };

  const handleRemoveAdmin = async (principalId: string) => {
    try {
      const principal = Principal.fromText(principalId);
      await adminService.removeAdmin(principal);
      await loadAdmins();
      setError(null);
    } catch (err) {
      setError('Failed to remove admin');
      console.error('Failed to remove admin:', err);
    }
  };

  const loadAdmins = async () => {
    try {
      const adminList = await adminService.getAdmins();
      setAdmins(adminList);
      setError(null);
    } catch (err) {
      setError('Failed to load admin list');
      console.error('Failed to load admins:', err);
    }
  };

  const handleGetICPPrice = async () => {
    try {
      setPriceLoading(true);
      setPriceError(null);
      const price = await priceService.getICPUSDPrice();
      setIcpPrice(price);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Failed to fetch ICP price');
      console.error('Failed to get ICP price:', err);
    } finally {
      setPriceLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="admin-page">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <div className="error-message">You do not have admin access.</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Admin Management</h1>

      <div className="admin-nav">
        <button 
          className="nav-button"
          onClick={() => navigate('/admin/tokens')}
        >
          Token Management
        </button>
        <button 
          className="nav-button"
          onClick={() => navigate('/admin/prices')}
        >
          Price Testing
        </button>
        <button 
          className="nav-button"
          onClick={() => navigate('/admin/achievements')}
        >
          Achievement Management
        </button>
      </div>

      <div className="price-test-section">
        <h2>Price Testing</h2>
        <div className="price-display">
          {icpPrice !== null && (
            <div>Current ICP Price: ${icpPrice.toFixed(2)}</div>
          )}
          {priceError && (
            <div className="error-message">{priceError}</div>
          )}
          <button 
            onClick={handleGetICPPrice}
            disabled={priceLoading}
            className="price-button"
          >
            {priceLoading ? 'Loading...' : 'Get ICP Price'}
          </button>
        </div>
      </div>

      <div className="admin-list">
        <h2>Current Admins</h2>
        {admins.length === 0 ? (
          <div className="no-admins">No admins found</div>
        ) : (
          admins.map((admin) => (
            <div key={admin.toString()} className="admin-item">
              <span className="admin-principal">{admin.toString()}</span>
              <button
                className="remove-button"
                onClick={() => handleRemoveAdmin(admin.toString())}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <form className="add-admin-form" onSubmit={handleAddAdmin}>
        <input
          type="text"
          className="principal-input"
          value={newAdmin}
          onChange={(e) => setNewAdmin(e.target.value)}
          placeholder="Enter Principal ID"
        />
        <button type="submit" className="add-button">Add Admin</button>
      </form>
    </div>
  );
}; 