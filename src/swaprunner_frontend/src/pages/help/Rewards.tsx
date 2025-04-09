import React from 'react';
import { FiAward, FiGift, FiTarget } from 'react-icons/fi';
import '../../styles/Help.css';

export const Rewards: React.FC = () => {
    return (
        <div className="help-page">
            <div className="help-content">
                <h1>Rewards System</h1>
                <p className="help-intro">
                    Learn about SwapRunner's rewards system, including achievements, allocations, and how to earn tokens through sponsored achievements.
                </p>

                <section className="help-section">
                    <h2>
                        <FiAward className="section-icon" />
                        Achievements
                    </h2>
                    <p>
                        Achievements are milestones that you can earn by using SwapRunner. They track various aspects of your activity, such as:
                    </p>
                    <ul>
                        <li>Trading volume across different tokens</li>
                        <li>Number of successful swaps</li>
                        <li>Using specific features or DEXes</li>
                        <li>Participating in special events</li>
                    </ul>
                    <p>
                        When you earn an achievement, it's permanently recorded on your profile. Some achievements are sponsored,
                        meaning you can claim token rewards when you earn them.
                    </p>
                </section>

                <section className="help-section">
                    <h2>
                        <FiTarget className="section-icon" />
                        Allocations
                    </h2>
                    <p>
                        Allocations are pools of tokens that project teams can create to reward users for earning specific achievements. Here's how they work:
                    </p>
                    <ul>
                        <li>Project teams create an allocation by depositing tokens and linking it to an achievement</li>
                        <li>They specify minimum and maximum reward amounts per user</li>
                        <li>When users earn the achievement, they can claim tokens from the allocation</li>
                        <li>The exact reward amount is randomly determined within the specified range</li>
                        <li>Allocations can be topped up to continue rewarding new users</li>
                    </ul>
                    <p>
                        Allocations help projects incentivize specific user behaviors while ensuring fair distribution of rewards.
                    </p>
                </section>

                <section className="help-section">
                    <h2>
                        <FiGift className="section-icon" />
                        Claiming Rewards
                    </h2>
                    <p>
                        When you earn a sponsored achievement, you'll be able to claim your reward. Here's the process:
                    </p>
                    <ul>
                        <li>Visit your profile page to see your earned achievements</li>
                        <li>Look for achievements marked as "Claimable"</li>
                        <li>Click the claim button to receive your tokens</li>
                        <li>The tokens will be automatically transferred to your wallet</li>
                    </ul>
                    <p>
                        Note that some achievements may have multiple allocations with different tokens,
                        allowing you to choose which reward to claim.
                    </p>
                </section>

                <div className="help-note">
                    <strong>Note:</strong> The availability and size of rewards depend on the allocations created by project teams.
                    Make sure to check the achievement details to see the current reward ranges and available token balances.
                </div>
            </div>
        </div>
    );
}; 