import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../styles/Help.css'; // We'll reuse the Help page styles

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

      <div className="help-content">
        <section>
          <h2>Risk Disclosure</h2>
          <p>
            SwapRunner is a decentralized exchange (DEX) aggregator platform. By using our services, you acknowledge and agree to the following:
          </p>
          
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
            By using SwapRunner, you acknowledge that you have read, understood, and agree to these terms. If you do not agree, please do not use our services.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Disclaimer; 