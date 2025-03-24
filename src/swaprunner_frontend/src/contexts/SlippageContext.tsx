import React, { createContext, useContext, useState } from 'react';

interface SlippageContextType {
  slippageTolerance: number;
  setSlippageTolerance: (value: number) => void;
}

const SlippageContext = createContext<SlippageContextType>({
  slippageTolerance: 0.5,
  setSlippageTolerance: () => {},
});

export const useSlippage = () => useContext(SlippageContext);

export const SlippageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [slippageTolerance, setSlippageTolerance] = useState(0.5); // Default 0.1%

  return (
    <SlippageContext.Provider value={{ slippageTolerance, setSlippageTolerance }}>
      {children}
    </SlippageContext.Provider>
  );
}; 