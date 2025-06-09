import React, { useState } from 'react';
import { FiShoppingCart } from 'react-icons/fi';
import Marketplace from './Marketplace';

const MarketplaceButton: React.FC = () => {
  const [showMarketplace, setShowMarketplace] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowMarketplace(true)}
        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
        title="Open Marketplace"
      >
        <FiShoppingCart size={16} />
        <span className='max-2xl:hidden'>Marketplace</span>
      </button>

      <Marketplace 
        isOpen={showMarketplace} 
        onClose={() => setShowMarketplace(false)} 
      />
    </>
  );
};

export default MarketplaceButton;
