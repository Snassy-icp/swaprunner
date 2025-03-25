import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../styles/Help.css';

export const Help: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="help-page">
      <div className="help-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <FiArrowLeft /> Back to Swap
        </button>
        <h1>Help & Documentation</h1>
      </div>

      <div className="help-content">
        <section>
          <h2>Getting Started</h2>
          <p>Welcome to Swaprunner.com, the premier DEX aggregator for the Internet Computer. This platform helps you find and execute the best token swaps across multiple decentralized exchanges. Please note that this is ALPHA SOFTWARE - use at your own risk and only trade what you can afford to lose.</p>
          
          <h3>Quick Start Guide</h3>
          <ol>
            <li>Connect your Internet Identity by clicking the login button in the top right</li>
            <li>Copy your principal ID from the top right menu - this is your trading address</li>
            <li>Send the tokens you want to trade to your principal ID</li>
            <li>Select your input and output tokens from the dropdown menus</li>
            <li>Enter the amount you want to trade</li>
            <li>Compare quotes from different DEXes and trading strategies</li>
            <li>Review the transaction details and confirm your swap</li>
          </ol>
        </section>

        <section>
          <h2>Trading Features</h2>
          
          <h3>Simple Swap</h3>
          <p>Direct token swaps through either ICPSwap or Kong Swap. The interface automatically compares prices between both DEXes and highlights the best rate. Features include:</p>
          <ul>
            <li>Real-time price quotes from multiple DEXes</li>
            <li>Automatic price impact calculation</li>
            <li>Estimated output with slippage protection</li>
            <li>One-click swap execution</li>
          </ul>
          
          <h3>Split Trading</h3>
          <p>Advanced trading feature that splits your order between multiple DEXes to optimize returns. Benefits include:</p>
          <ul>
            <li>Reduced price impact on larger orders</li>
            <li>Better average execution price</li>
            <li>Automatic optimization of split ratios</li>
            <li>Parallel execution for faster settlement</li>
          </ul>
          
          <h3>Time-Distributed Trading (coming soon)</h3>
          <p>Break down large trades into smaller transactions spread over time. This feature helps:</p>
          <ul>
            <li>Minimize market impact for large orders</li>
            <li>Reduce slippage on illiquid pairs</li>
            <li>Achieve better average execution price</li>
            <li>Automate complex trading strategies</li>
          </ul>
        </section>

        <section>
          <h2>Wallet Management</h2>
          
          <h3>Token Management</h3>
          <p>The wallet interface provides comprehensive token management features:</p>
          <ul>
            <li>View all your token balances in one place</li>
            <li>Add/remove tokens from your watchlist</li>
            <li>Send tokens to other addresses</li>
            <li>View transaction history (coming soon)</li>
          </ul>

          <h3>Balance Types</h3>
          <p>Your tokens can exist in different states:</p>
          <ul>
            <li><strong>Undeposited Balance:</strong> Tokens in your principal ID, ready for trading</li>
            <li><strong>Deposited Balance:</strong> Tokens already approved for trading on a specific DEX</li>
            <li><strong>Pool Balance:</strong> Tokens currently in liquidity pools</li>
          </ul>
        </section>

        <section>
          <h2>Advanced Settings</h2>
          
          <h3>Slippage Tolerance</h3>
          <p>Protect your trades from price movements by setting an appropriate slippage tolerance:</p>
          <ul>
            <li><strong>0.1%</strong> - For stable pairs and small trades</li>
            <li><strong>0.5%</strong> - Default setting, suitable for most trades</li>
            <li><strong>1.0%</strong> - For volatile pairs or larger trades</li>
            <li><strong>Custom</strong> - Set your own tolerance based on market conditions</li>
          </ul>

          <h3>Transaction Settings</h3>
          <p>Additional settings to customize your trading experience:</p>
          <ul>
            <li>Auto-approve tokens for faster trading</li>
            <li>Set default slippage tolerance</li>
          </ul>
        </section>

        <section>
          <h2>Safety & Security</h2>
          
          <h3>Best Practices</h3>
          <ul>
            <li>Always verify token addresses before trading</li>
            <li>Start with small test transactions when trading new pairs</li>
            <li>Monitor price impact warnings carefully</li>
            <li>Keep your Internet Identity secure and never share your credentials</li>
            <li>Don't store large amounts in your principal ID - transfer only what you plan to trade</li>
            <li>After trading, withdraw funds to a secure wallet</li>
          </ul>

          <h3>Warning Signs</h3>
          <p>Be cautious if you encounter any of these situations:</p>
          <ul>
            <li>Unusually high price impact for your trade size</li>
            <li>Significant price differences between DEXes</li>
            <li>Unknown or unverified token contracts</li>
            <li>Requests to approve unusual token amounts</li>
          </ul>
        </section>

        <section>
          <h2>Troubleshooting</h2>
          
          <h3>Common Issues</h3>
          <ul>
            <li><strong>Transaction Pending:</strong> Wait for network confirmation or check your transaction status</li>
            <li><strong>Price Impact Too High:</strong> Try reducing your trade size or using split/time-distributed trading</li>
            <li><strong>Insufficient Balance:</strong> Ensure you have enough tokens plus extra for fees</li>
            <li><strong>Token Not Found:</strong> Verify the token address or add it manually</li>
          </ul>

          <h3>Error Recovery</h3>
          <ul>
            <li>Refresh the page if the interface becomes unresponsive</li>
            <li>Clear cache if you experience persistent issues</li>
            <li>Reconnect your wallet if the connection drops</li>
            <li>Contact support for unresolved issues</li>
          </ul>
        </section>

        <section>
          <h2>Support & Resources</h2>
          <p>Need additional help? Here are some resources:</p>
          <ul>
            <li><a href="https://discord.gg/JhYpRQA9" target="_blank" rel="noopener noreferrer">Join the Sneed Discord community</a> for real-time support.</li>
            <li><a href="https://x.com/swaprunner" target="_blank" rel="noopener noreferrer">Follow @swaprunner on X.com</a> for updates and announcements.</li>
            <li><a href="https://x.com/SnassyIcp" target="_blank" rel="noopener noreferrer">Follow @SnassyIcp on X.com</a> (main developer) for updates and announcements.</li>
            <li><a href="https://github.com/Snassy-icp/swaprunner" target="_blank" rel="noopener noreferrer">Swaprunner.com github</a> for open source code.</li>
          </ul>
        </section>
        
        <section>
          <h2>Verification</h2>
          <p>
            SwapRunner is a 100% on-chain dApp that can be verified for security and transparency.{' '}
            <a href="/help/verification">Learn more about verification</a>
          </p>
        </section>
      </div>
    </div>
  );
}; 