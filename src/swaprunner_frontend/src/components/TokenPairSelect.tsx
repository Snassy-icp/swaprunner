import { TokenSelect } from './TokenSelect';

interface TokenPairSelectProps {
  fromToken: string;
  toToken: string;
  onFromTokenChange: (canisterId: string) => void;
  onToTokenChange: (canisterId: string) => void;
}

export const TokenPairSelect = ({
  fromToken,
  toToken,
  onFromTokenChange,
  onToTokenChange
}: TokenPairSelectProps) => {
  const handleFromTokenChange = (tokenId: string) => {
    console.log('[TokenPairSelect] handleFromTokenChange called with tokenId:', tokenId);
    console.log('[TokenPairSelect] Current fromToken:', fromToken);
    onFromTokenChange(tokenId);
    console.log('[TokenPairSelect] onFromTokenChange called');
  };

  const handleToTokenChange = (tokenId: string) => {
    console.log('[TokenPairSelect] handleToTokenChange called with tokenId:', tokenId);
    console.log('[TokenPairSelect] Current toToken:', toToken);
    onToTokenChange(tokenId);
    console.log('[TokenPairSelect] onToTokenChange called');
  };

  const handleSwapDirection = () => {
    console.log('[TokenPairSelect] handleSwapDirection called');
    console.log('[TokenPairSelect] Current fromToken:', fromToken);
    console.log('[TokenPairSelect] Current toToken:', toToken);
    const tempFrom = fromToken;
    onFromTokenChange(toToken);
    onToTokenChange(tempFrom);
    console.log('[TokenPairSelect] Tokens swapped');
  };

  return (
    <div className="token-pair-select">
      <TokenSelect
        label="From Token"
        value={fromToken}
        onChange={handleFromTokenChange}
      />
      <button 
        className="swap-direction-button"
        onClick={handleSwapDirection}
        title="Swap direction"
      >
        ↕️
      </button>
      <TokenSelect
        label="To Token"
        value={toToken}
        onChange={handleToTokenChange}
      />
    </div>
  );
}; 