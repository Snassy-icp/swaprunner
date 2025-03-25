import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../../styles/Help.css';
import { CanisterStatus, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { Path, SubnetStatus } from '@dfinity/agent/lib/cjs/canisterStatus';

export const Verification: React.FC = () => {
  const navigate = useNavigate();
  const [frontendHash, setFrontendHash] = React.useState<string | null>(null);
  const [backendHash, setBackendHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchModuleHash = async (canisterId: string) => {
    try {
      const paths: Path[] = ['controllers', 'subnet', 'module_hash'];
      const request = await CanisterStatus.request({
          canisterId: Principal.fromText(canisterId),
          agent: HttpAgent.createSync({ host: 'https://icp0.io' }),
          paths
      });

      const controllers = request.get('controllers') as Principal[];
      const subnet = request.get('subnet') as SubnetStatus;
      const moduleHash = request.get('module_hash') as string;

      return {
          controllers,
          subnet,
          moduleHash
      };

/*
      const agent = new HttpAgent({
        host: 'https://ic0.app'
      });

      await agent.fetchRootKey();

      const request = await CanisterStatus.request({
        canisterId: Principal.fromText(canisterId),
        agent,
        paths: ['module_hash']
      });

      const moduleHash = request.get('module_hash') as string;
      return moduleHash;
      */

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
        setFrontendHash(frontend.moduleHash);
        setBackendHash(backend.moduleHash);
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
          <h2>Source Code</h2>
          <p>Our source code can be found and verified on <a href="https://github.com/Snassy-Icp/swaprunner" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
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

          <p>
            The following hashes are the current hashes of the canisters.
          </p>

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

          <h3>Method 1: Using IC Dashboard</h3>
          <p>
            You can use the IC Dashboard website:
          </p>
          <ol>
            <li>Visit the frontend canister at:<br/>
              <a href={`https://dashboard.internetcomputer.org/canister/${process.env.CANISTER_ID_SWAPRUNNER_FRONTEND}`}
                 target="_blank" rel="noopener noreferrer">
                dashboard.internetcomputer.org/canister/{process.env.CANISTER_ID_SWAPRUNNER_FRONTEND}
              </a>
            </li>
            <li>Visit the backend canister at:<br/>
              <a href={`https://dashboard.internetcomputer.org/canister/${process.env.CANISTER_ID_SWAPRUNNER_BACKEND}`}
                 target="_blank" rel="noopener noreferrer">
                dashboard.internetcomputer.org/canister/{process.env.CANISTER_ID_SWAPRUNNER_BACKEND}
              </a>
            </li>
            <li>Look for the "Module hash" field on each page</li>
          </ol>

          <h3>Method 2: Using DFX Command Line</h3>
          <p>
            If you have the IC SDK installed, you can use the dfx command line tool. Run these commands:
          </p>
          <div className="code-block">
            <p>For the frontend canister:</p>
            <pre>
              <code>
{`$ dfx canister --network ic info ${process.env.CANISTER_ID_SWAPRUNNER_FRONTEND}
Please enter the passphrase for your identity: [hidden]
Decryption complete.
Controllers: d7zib-qo5mr-qzmpb-dtyof-l7yiu-pu52k-wk7ng-cbm3n-ffmys-crbkz-nae
Module hash: ${frontendHash}`}
              </code>
            </pre>

            <p>For the backend canister:</p>
            <pre>
              <code>
{`$ dfx canister --network ic info ${process.env.CANISTER_ID_SWAPRUNNER_BACKEND}
Please enter the passphrase for your identity: [hidden]
Decryption complete.
Controllers: d7zib-qo5mr-qzmpb-dtyof-l7yiu-pu52k-wk7ng-cbm3n-ffmys-crbkz-nae
Module hash: ${backendHash}`}
              </code>
            </pre>
          </div>

        </section>

        <section>
          <h2>Step 2: Matching Source Code</h2>
          <p>
            To verify that the deployed code matches our source code, you'll need to:
            1. Get the source code
            2. Build it locally
            3. Check the canister hashes
          </p>

          <h3>Getting and Building the Source</h3>
          <div className="code-block">
          <pre>
            <code>
{`# Clone the repository
git clone https://github.com/Snassy-Icp/swaprunner.git
cd swaprunner

# Install dependencies
npm install
cd src/swaprunner_frontend
npm install @remix-run/router
cd ../..

# Start local IC replica
dfx start --clean --background

# Build and deploy locally
dfx deploy`}
            </code>
          </pre>
          </div>

          <h3>Checking the Hashes</h3>
          <p>Check the canister hashes:</p>
          <div className="code-block">
          <pre>
            <code>
{`dfx canister status swaprunner_frontend
dfx canister status swaprunner_backend`}
            </code>
          </pre>
          </div>

          <p>These hashes should match the live canister hashes shown above.</p>
        </section>

        <section>
          <h2>Step 3: Domain Verification</h2>
          <p>Coming soon...</p>
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