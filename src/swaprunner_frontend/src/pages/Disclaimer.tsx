import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../styles/Help.css';

export const Disclaimer: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="help-page">
      <div className="help-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <FiArrowLeft /> Back to Swap
        </button>
        <h1>Disclaimer</h1>
      </div>

      <div className="disclaimer-help-content">
        <section>
          <h2>Risk Disclosure</h2>
          <p>
            SwapRunner is a decentralized exchange (DEX) aggregator platform. By using our services, you acknowledge and agree to the following:
          </p>

          <h3>Non-Liability Statement</h3>
          <p style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
            SWAPRUNNER, ITS DEVELOPERS, OWNERS, OPERATORS, CONTRIBUTORS, AND ANY PARTIES INVOLVED WITH SWAPRUNNER ARE NOT RESPONSIBLE OR LIABLE FOR ANY LOSS OF TOKENS OR FUNDS UNDER ANY CIRCUMSTANCES. THIS INCLUDES BUT IS NOT LIMITED TO:
          </p>
          <ul>
            <li>Loss of tokens due to user error or mistakes</li>
            <li>Loss of tokens due to smart contract bugs or technical issues</li>
            <li>Loss of tokens due to network issues or congestion</li>
            <li>Loss of tokens due to hacks, exploits, or security breaches</li>
            <li>Loss of tokens due to market volatility or price movements</li>
            <li>Loss of tokens due to regulatory changes or compliance issues</li>
            <li>Any other circumstances resulting in loss of tokens or funds</li>
          </ul>
          
          <h3>Trading Risks</h3>
          <ul>
            <li>Cryptocurrency trading involves substantial risk and may result in the loss of your invested capital.</li>
            <li>Prices of digital assets are highly volatile and can change significantly in a short period.</li>
            <li>Past performance is not indicative of future results.</li>
            <li>You should only trade with funds you can afford to lose.</li>
          </ul>

          <h3>Platform Usage</h3>
          <ul>
            <li>SwapRunner is provided "as is" without any warranties.</li>
            <li>We do not guarantee the accuracy of price feeds, trading data, or other information.</li>
            <li>Technical issues, network congestion, or smart contract bugs may affect trading operations.</li>
            <li>You are responsible for verifying all transaction details before confirming.</li>
          </ul>

          <h3>Regulatory Compliance</h3>
          <ul>
            <li>You are responsible for complying with all applicable laws and regulations in your jurisdiction.</li>
            <li>Access to certain features may be restricted based on your location.</li>
            <li>SwapRunner reserves the right to modify or discontinue services at any time.</li>
          </ul>

          <p className="disclaimer-footer">
            By using SwapRunner, you explicitly acknowledge that you understand and accept all risks involved, including the potential for complete loss of funds. You agree that you are using this platform entirely at your own risk, and that no party associated with SwapRunner bears any responsibility for any losses you may incur. If you do not agree to these terms, please do not use our services.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Disclaimer;