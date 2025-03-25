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
          <p>
            Verifying a dApp on the Internet Computer involves three main steps to ensure 
            what you're interacting with is exactly what's in the public source code:
          </p>

          <h3>Overview of Verification Steps</h3>
          <ol>
            <li>
              <strong>Verify Canister Code</strong>: First, we'll get the cryptographic hashes of the 
              currently running frontend and backend canisters. These hashes uniquely identify the exact 
              code that's running on the Internet Computer.
            </li>
            <li>
              <strong>Match with Source Code</strong>: Next, we'll verify these hashes match the code 
              in our public GitHub repository. This ensures the deployed code matches our open source code.
            </li>
            <li>
              <strong>Verify Domain Connection</strong>: Finally, we'll verify that swaprunner.com is 
              actually served by our verified frontend canister, ensuring you're interacting with the 
              legitimate application.
            </li>
          </ol>

          <h3>Why These Steps Matter</h3>
          <p>
            This verification process ensures:
          </p>
          <ul>
            <li>The code running on the IC matches our public source code</li>
            <li>No unauthorized changes have been made to the deployed canisters</li>
            <li>You're connecting to the legitimate SwapRunner application</li>
            <li>The website domain hasn't been compromised or redirected</li>
          </ul>

          <p>
            In the following sections, we'll walk through each step in detail, providing commands, 
            expected outputs, and alternative methods for verification. Whether you're using the IC's 
            command-line tools or web interfaces, we'll guide you through the entire process.
          </p>
        </section>

        <section>
          <h2>Step 1: Verifying Canister Code</h2>
          <p>Coming soon...</p>
        </section>

        <section>
          <h2>Step 2: Matching Source Code</h2>
          <p>Coming soon...</p>
        </section>

        <section>
          <h2>Step 3: Domain Verification</h2>
          <p>Coming soon...</p>
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