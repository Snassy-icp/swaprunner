import React from 'react';
import { FiTool } from 'react-icons/fi';
import '../styles/Maintenance.css';

const Maintenance: React.FC = () => {
  return (
    <div className="maintenance-page">
      <div className="maintenance-content">
        <FiTool className="maintenance-icon" />
        <h1>Under Maintenance</h1>
        <p>SwapRunner is currently undergoing maintenance. We'll be back shortly.</p>
      </div>
    </div>
  );
};

export default Maintenance; 