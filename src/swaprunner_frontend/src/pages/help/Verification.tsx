import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../../styles/Help.css';

export const Verification: React.FC = () => {
  const navigate = useNavigate();
  const [frontendHash, setFrontendHash] = React.useState<string | null>(null);
  const [backendHash, setBackendHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchModuleHash = async (canisterId: string) => {
    try {
      const response = await fetch(
        `https://dashboard.internetcomputer.org/canister/${canisterId}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch canister data');
      }

      const data = await response.json();
      return data.moduleHash;

    } catch (err) {
      console.error('Error fetching hash:', err);
      throw err;
    }
  };

  React.useEffect(() => {
    const fetchHashes = async () => {
      try {
        setIsLoading(true);
        const [frontend, backend] = await Promise.all([
          fetchModuleHash(process.env.CANISTER_ID_SWAPRUNNER_FRONTEND!),
          fetchModuleHash(process.env.CANISTER_ID_SWAPRUNNER_BACKEND!)
        ]);
        setFrontendHash(frontend);
        setBackendHash(backend);
      } catch (err) {
        setError('Failed to fetch current hashes');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHashes();
  }, []);

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
          <p>
            There are several ways to obtain the cryptographic hashes of our canisters. We'll show all available methods 
            so you can choose the one that works best for you.
          </p>

          <h3>Method 1: Using DFX Command Line</h3>
          <p>
            If you have the IC SDK installed, you can use the dfx command line tool. Run these commands:
          </p>
          <div className="code-block">
            <p>For the frontend canister:</p>
            <pre>
              <code>
{`$ dfx canister --network ic info tu64e-uiaaa-aaaaj-az4vq-cai
Please enter the passphrase for your identity: [hidden]
Decryption complete.
Controllers: d7zib-qo5mr-qzmpb-dtyof-l7yiu-pu52k-wk7ng-cbm3n-ffmys-crbkz-nae
Module hash: 0x865eb25df5a6d857147e078bb33c727797957247f7af2635846d65c5397b36a6`}
              </code>
            </pre>

            <p>For the backend canister:</p>
            <pre>
              <code>
{`$ dfx canister --network ic info tt72q-zqaaa-aaaaj-az4va-cai
Please enter the passphrase for your identity: [hidden]
Decryption complete.
Controllers: d7zib-qo5mr-qzmpb-dtyof-l7yiu-pu52k-wk7ng-cbm3n-ffmys-crbkz-nae
Module hash: 0x1af31e2ccc2a7efd03b8c06bd0d23421fff7e87bad090bde4a7157f316cd8e18`}
              </code>
            </pre>
          </div>

          <h3>Method 2: Using IC Dashboard</h3>
          <p>
            For a more user-friendly approach, you can use the IC Dashboard website:
          </p>
          <ol>
            <li>Visit the frontend canister at:<br/>
              <a href="https://dashboard.internetcomputer.org/canister/tu64e-uiaaa-aaaaj-az4vq-cai" 
                 target="_blank" rel="noopener noreferrer">
                dashboard.internetcomputer.org/canister/tu64e-uiaaa-aaaaj-az4vq-cai
              </a>
            </li>
            <li>Visit the backend canister at:<br/>
              <a href="https://dashboard.internetcomputer.org/canister/tt72q-zqaaa-aaaaj-az4va-cai" 
                 target="_blank" rel="noopener noreferrer">
                dashboard.internetcomputer.org/canister/tt72q-zqaaa-aaaaj-az4va-cai
              </a>
            </li>
            <li>Look for the "Module hash" field on each page</li>
          </ol>
          <p>Expected output: Coming soon... (we'll add screenshots or exact output)</p>

          <h3>Method 3: Using ic.rocks Explorer</h3>
          <p>
            The ic.rocks explorer provides another way to verify the canisters:
          </p>
          <ol>
            <li>Visit the frontend canister at:<br/>
              <a href="https://ic.rocks/principal/tu64e-uiaaa-aaaaj-az4vq-cai" 
                 target="_blank" rel="noopener noreferrer">
                ic.rocks/principal/tu64e-uiaaa-aaaaj-az4vq-cai
              </a>
            </li>
            <li>Visit the backend canister at:<br/>
              <a href="https://ic.rocks/principal/tt72q-zqaaa-aaaaj-az4va-cai" 
                 target="_blank" rel="noopener noreferrer">
                ic.rocks/principal/tt72q-zqaaa-aaaaj-az4va-cai
              </a>
            </li>
            <li>Look under the "Canister" tab for the module hash</li>
          </ol>
          <p>Expected output: Coming soon... (we'll add screenshots or exact output)</p>

          <h3>Method 4: Using IC API Directly</h3>
          <p>
            For the technically inclined, you can query the IC API directly:
          </p>
          <div className="code-block">
            <pre>
              <code>
{`curl -X POST -H 'Content-Type: application/json' \\
  -d '{"request_type": "read_state","sender": "...","paths": [[["canister",{"canister_id": "CANISTER_ID"},"module_hash"]]}' \\
  'https://ic0.app/api/v2/canister/CANISTER_ID/read_state'`}
              </code>
            </pre>
          </div>
          <p>Expected output: Coming soon... (we'll add exact output)</p>

          <h3>Live Canister Verification</h3>
          <div className="code-block">
            {isLoading ? (
              <p>Fetching current canister hashes...</p>
            ) : error ? (
              <p className="error">{error}</p>
            ) : (
              <>
                <p>Current frontend hash:</p>
                <pre>
                  <code>{frontendHash}</code>
                </pre>
                <p>Current backend hash:</p>
                <pre>
                  <code>{backendHash}</code>
                </pre>
              </>
            )}
          </div>
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