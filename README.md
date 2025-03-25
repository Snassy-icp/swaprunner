# swaprunner
On-Chain DEX Aggregator

https://swaprunner.com
https://x.com/swaprunner

## Development

```bash
npm install
cd src/swaprunner_frontend
npm install @remix-run/router
cd ../..
dfx start --clean --background
dfx deploy
```

Check the canister hashes:

```bash
dfx canister status swaprunner_frontend
dfx canister status swaprunner_backend
```


