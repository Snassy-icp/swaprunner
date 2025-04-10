import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Principal } from '@dfinity/principal';
import { adminService } from '../services/admin';
import { authService } from '../services/auth';
import { priceService } from '../services/price';
import { backendService } from '../services/backend';
import { accountService, Account } from '../services/account';
import { AccountParser, ParsedAccount } from '../utils/account';
import '../styles/AdminPage.css';
import { FiLoader } from 'react-icons/fi';

interface AllocationFeeConfig {
  icp_fee_e8s: bigint;
  cut_basis_points: bigint;
}

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
  const [feeConfig, setFeeConfig] = useState<AllocationFeeConfig | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [paymentAccount, setPaymentAccount] = useState<Account | null>(null);
  const [cutAccount, setCutAccount] = useState<Account | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [newPaymentAccount, setNewPaymentAccount] = useState('');
  const [newCutAccount, setNewCutAccount] = useState('');
  const [isPanicMode, setIsPanicMode] = useState(false);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [psaText, setPsaText] = useState('');
  const [currentPsaText, setCurrentPsaText] = useState('');
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
          await loadFeeConfig();
          await loadAccounts();
          
          // Load security settings
          const actor = await backendService.getActor();
          const [panicMode, psa] = await Promise.all([
            actor.get_panic_mode(),
            actor.get_psa_message()
          ]);
          setIsPanicMode(panicMode);
          setPsaText(psa);
          setCurrentPsaText(psa);
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

  const loadFeeConfig = async () => {
    try {
      setFeeLoading(true);
      setFeeError(null);
      const actor = await backendService.getActor();
      const config = await actor.get_allocation_fee_config();
      setFeeConfig(config);
    } catch (err) {
      setFeeError('Failed to load fee configuration: ' + (err instanceof Error ? err.message : String(err)));
      console.error('Failed to load fee config:', err);
    } finally {
      setFeeLoading(false);
    }
  };

  const handleUpdateFeeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feeConfig) return;

    try {
      setFeeLoading(true);
      setFeeError(null);
      const actor = await backendService.getActor();
      await actor.update_allocation_fee_config({
        icp_fee_e8s: feeConfig.icp_fee_e8s,
        cut_basis_points: feeConfig.cut_basis_points
      });
      await loadFeeConfig();
    } catch (err) {
      setFeeError('Failed to update fee configuration: ' + (err instanceof Error ? err.message : String(err)));
      console.error('Failed to update fee config:', err);
    } finally {
      setFeeLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      setAccountsLoading(true);
      setAccountsError(null);
      const [payment, cut] = await Promise.all([
        accountService.getPaymentAccount(),
        accountService.getCutAccount()
      ]);
      setPaymentAccount(payment);
      setCutAccount(cut);
    } catch (err) {
      setAccountsError('Failed to load accounts: ' + (err instanceof Error ? err.message : String(err)));
      console.error('Failed to load accounts:', err);
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleUpdatePaymentAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPaymentAccount.trim()) return;

    try {
      setAccountsLoading(true);
      setAccountsError(null);
      
      // Try parsing as long account string first
      const parsed = AccountParser.parseLongAccountString(newPaymentAccount.trim());
      if (parsed) {
        await accountService.updatePaymentAccount(parsed.principal, parsed.subaccount?.resolved ? Array.from(parsed.subaccount.resolved) : undefined);
      } else {
        // If not a long account string, try as principal
        const principal = Principal.fromText(newPaymentAccount.trim());
        await accountService.updatePaymentAccount(principal);
      }
      
      await loadAccounts();
      setNewPaymentAccount('');
    } catch (err) {
      setAccountsError('Failed to update payment account: ' + (err instanceof Error ? err.message : String(err)));
      console.error('Failed to update payment account:', err);
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleUpdateCutAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCutAccount.trim()) return;

    try {
      setAccountsLoading(true);
      setAccountsError(null);
      
      // Try parsing as long account string first
      const parsed = AccountParser.parseLongAccountString(newCutAccount.trim());
      if (parsed) {
        await accountService.updateCutAccount(parsed.principal, parsed.subaccount?.resolved ? Array.from(parsed.subaccount.resolved) : undefined);
      } else {
        // If not a long account string, try as principal
        const principal = Principal.fromText(newCutAccount.trim());
        await accountService.updateCutAccount(principal);
      }
      
      await loadAccounts();
      setNewCutAccount('');
    } catch (err) {
      setAccountsError('Failed to update cut account: ' + (err instanceof Error ? err.message : String(err)));
      console.error('Failed to update cut account:', err);
    } finally {
      setAccountsLoading(false);
    }
  };

  const handlePanicModeChange = async (checked: boolean) => {
    try {
      setSecurityLoading(true);
      await adminService.setPanicMode(checked);
      setIsPanicMode(checked);
    } catch (err) {
      setError('Failed to update panic mode');
      console.error('Failed to update panic mode:', err);
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleUpdatePSA = async () => {
    try {
      setSecurityLoading(true);
      await adminService.updatePSA(psaText);
      setCurrentPsaText(psaText);
    } catch (err) {
      setError('Failed to update PSA');
      console.error('Failed to update PSA:', err);
    } finally {
      setSecurityLoading(false);
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

      <div className="accounts-section">
        <h2>Account Management</h2>
        {accountsError && <div className="error-message">{accountsError}</div>}
        
        <div className="account-forms">
          <form onSubmit={handleUpdatePaymentAccount} className="account-form">
            <h3>Payment Account</h3>
            {paymentAccount ? (
              <div className="current-account">
                <strong>Current:</strong> {AccountParser.encodeLongAccount({
                  principal: paymentAccount.owner,
                  subaccount: paymentAccount.subaccount?.[0] ? {
                    type: 'bytes',
                    value: '',
                    resolved: Uint8Array.from(paymentAccount.subaccount[0])
                  } : undefined
                })}
              </div>
            ) : (
              <div className="current-account">
                <strong>Current:</strong> Not set
              </div>
            )}
            <div className="form-group">
              <input
                type="text"
                className="principal-input"
                value={newPaymentAccount}
                onChange={(e) => setNewPaymentAccount(e.target.value)}
                placeholder="Enter Principal ID or Account String"
                disabled={accountsLoading}
              />
              <button 
                type="submit" 
                className="update-button"
                disabled={accountsLoading || !newPaymentAccount.trim()}
              >
                {accountsLoading ? (
                  <>
                    <FiLoader className="spinning" />
                    Updating...
                  </>
                ) : (
                  'Update Payment Account'
                )}
              </button>
            </div>
          </form>

          <form onSubmit={handleUpdateCutAccount} className="account-form">
            <h3>Cut Account</h3>
            {cutAccount ? (
              <div className="current-account">
                <strong>Current:</strong> {AccountParser.encodeLongAccount({
                  principal: cutAccount.owner,
                  subaccount: cutAccount.subaccount?.[0] ? {
                    type: 'bytes',
                    value: '',
                    resolved: Uint8Array.from(cutAccount.subaccount[0])
                  } : undefined
                })}
              </div>
            ) : (
              <div className="current-account">
                <strong>Current:</strong> Not set
              </div>
            )}
            <div className="form-group">
              <input
                type="text"
                className="principal-input"
                value={newCutAccount}
                onChange={(e) => setNewCutAccount(e.target.value)}
                placeholder="Enter Principal ID or Account String"
                disabled={accountsLoading}
              />
              <button 
                type="submit" 
                className="update-button"
                disabled={accountsLoading || !newCutAccount.trim()}
              >
                {accountsLoading ? (
                  <>
                    <FiLoader className="spinning" />
                    Updating...
                  </>
                ) : (
                  'Update Cut Account'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="fee-config-section">
        <h2>Allocation Fee Configuration</h2>
        {feeError && <div className="error-message">{feeError}</div>}
        {feeConfig && (
          <form onSubmit={handleUpdateFeeConfig} className="fee-config-form">
            <div className="form-group">
              <label>Creation Fee (ICP)</label>
              <input
                type="number"
                step="0.01"
                value={Number(feeConfig.icp_fee_e8s) / 100_000_000}
                onChange={(e) => setFeeConfig({
                  ...feeConfig,
                  icp_fee_e8s: BigInt(Math.round(Number(e.target.value) * 100_000_000))
                })}
                min="0"
                required
              />
            </div>
            <div className="form-group">
              <label>Platform Cut (%)</label>
              <input
                type="number"
                step="0.01"
                value={Number(feeConfig.cut_basis_points) / 100}
                onChange={(e) => setFeeConfig({
                  ...feeConfig,
                  cut_basis_points: BigInt(Math.round(Number(e.target.value) * 100))
                })}
                min="0"
                max="100"
                required
              />
            </div>
            <button 
              type="submit" 
              className="update-button"
              disabled={feeLoading}
            >
              {feeLoading ? (
                <>
                  <FiLoader className="spinning" />
                  Updating...
                </>
              ) : (
                'Update Fee Configuration'
              )}
            </button>
          </form>
        )}
      </div>

      <div className="security-section">
        <h2>Security Controls</h2>
        <div className="security-controls">
          <div className="control-group">
            <label className="control-label">
              <input
                type="checkbox"
                checked={isPanicMode}
                onChange={(e) => handlePanicModeChange(e.target.checked)}
                disabled={securityLoading}
              />
              Enable Panic Mode
            </label>
            <p className="control-description">
              When enabled, all trading functionality will be disabled.
            </p>
          </div>

          <div className="control-group">
            <label className="control-label">Public Service Announcement</label>
            <textarea
              value={psaText}
              onChange={(e) => setPsaText(e.target.value)}
              placeholder="Enter PSA text to display above the swap interface..."
              disabled={securityLoading}
              className="psa-input"
              rows={3}
            />
            <button 
              onClick={handleUpdatePSA}
              disabled={securityLoading || psaText === currentPsaText}
              className="update-button"
            >
              {securityLoading ? (
                <>
                  <FiLoader className="spinning" />
                  Updating...
                </>
              ) : (
                'Update PSA'
              )}
            </button>
          </div>
        </div>
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