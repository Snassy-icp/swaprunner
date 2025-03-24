export const TransactionHistory = () => {
  return (
    <div className="transaction-history">
      <div className="filters">
        <select className="token-filter">
          <option value="">All Tokens</option>
          <option value="icp">ICP</option>
          <option value="dkp">DKP</option>
        </select>
        <select className="type-filter">
          <option value="">All Types</option>
          <option value="instant">Instant Swap</option>
          <option value="parallel">Parallel Swap</option>
          <option value="time">Time Distribution</option>
        </select>
        <select className="status-filter">
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="transactions-list">
        {/* Example Transaction Group */}
        <div className="transaction-group">
          <div className="group-header">
            <h3>Time Distribution: ICP → DKP</h3>
            <div className="group-details">
              <span>Total: 100 ICP</span>
              <span>Trades: 10/20</span>
              <span>Started: 2h ago</span>
            </div>
            <button className="expand-button">▼</button>
          </div>
          
          <div className="group-transactions">
            <div className="transaction-item">
              <div className="transaction-main">
                <span className="amount">5 ICP → 124.5 DKP</span>
                <span className="dex">ICPSwap</span>
                <span className="time">5 min ago</span>
                <span className="status completed">Completed</span>
              </div>
              <div className="transaction-details">
                <span>Price Impact: 0.05%</span>
                <span>Slippage: 0.5%</span>
                <a href="#" className="explorer-link">View in Explorer →</a>
              </div>
            </div>

            <div className="transaction-item">
              <div className="transaction-main">
                <span className="amount">5 ICP → 125.0 DKP</span>
                <span className="dex">Kong</span>
                <span className="time">15 min ago</span>
                <span className="status completed">Completed</span>
              </div>
              <div className="transaction-details">
                <span>Price Impact: 0.03%</span>
                <span>Slippage: 0.5%</span>
                <a href="#" className="explorer-link">View in Explorer →</a>
              </div>
            </div>
          </div>
        </div>

        {/* Example Single Transaction */}
        <div className="transaction-item standalone">
          <div className="transaction-main">
            <span className="amount">10 ICP → 249.5 DKP</span>
            <span className="dex">Parallel (50/50)</span>
            <span className="time">1h ago</span>
            <span className="status completed">Completed</span>
          </div>
          <div className="transaction-details">
            <span>ICPSwap: 5 ICP → 124.7 DKP</span>
            <span>Kong: 5 ICP → 124.8 DKP</span>
            <span>Price Impact: 0.04%</span>
            <a href="#" className="explorer-link">View in Explorer →</a>
          </div>
        </div>
      </div>
    </div>
  );
}; 