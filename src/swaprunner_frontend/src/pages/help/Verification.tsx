import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../../styles/Help.css';

export const Verification: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="help-page">
      <div className="help-header">
        <button className="back-button" onClick={() => navigate('/help')}>
          <FiArrowLeft /> Back to Help
        </button>
        <h1>Verifying SwapRunner</h1>
      </div>

      <div className="help-content">
        <section>
          <h2>What is an On-Chain dApp?</h2>
          <p>
            SwapRunner is a 100% on-chain distributed application (dApp) running on the Internet Computer blockchain. 
            This means that all of our code, both frontend and backend, is stored and executed directly on the blockchain, 
            making it fully transparent and verifiable.
          </p>
        </section>

        <section>
          <h2>How to Verify the Code</h2>
          <p>You can verify SwapRunner's code in several ways:</p>
          <ul>
            <li>Visit our GitHub repository to review the source code directly</li>
            <li>Check the canister ID on the IC Dashboard to verify the deployed code</li>
            <li>Use the IC Scanner to inspect our canisters and verify they match the public source code</li>
          </ul>
        </section>

        <section>
          <h2>Canister IDs</h2>
          <p>Our main canisters can be verified at these addresses:</p>
          <ul>
            <li>Frontend Canister: {process.env.CANISTER_ID_SWAPRUNNER_FRONTEND}</li>
            <li>Backend Canister: {process.env.CANISTER_ID_SWAPRUNNER_BACKEND}</li>
          </ul>
        </section>

        <section>
          <h2>Why This Matters</h2>
          <p>
            On-chain verification ensures that what you see is what you get. Unlike traditional web applications, 
            our code cannot be modified without being recorded on the blockchain. This provides an unprecedented 
            level of security and transparency for our users.
          </p>
          <p>
            The Internet Computer's architecture ensures that the code you interact with is exactly what has been 
            deployed to the blockchain, making it impossible for malicious actors to serve modified or compromised 
            versions of our application.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Verification; 