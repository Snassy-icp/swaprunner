import React from 'react';

interface SearchRangeProgressProps {
    left: number;
    right: number;
    m1?: number;
    m2?: number;
    isSearching: boolean;
    mode?: 'search' | 'progress';
}

export const SearchRangeProgress: React.FC<SearchRangeProgressProps> = ({
    left,
    right,
    m1,
    m2,
    isSearching,
    mode = 'search'
}) => {
    // Convert range values to percentages for positioning
    const leftPercent = left;
    const rightPercent = right;
    const m1Percent = m1 || -1;
    const m2Percent = m2 || -1;

    return (
        <div 
            className={`search-range-progress ${mode}`}
            style={{ 
                opacity: isSearching ? 1 : 0.5,
                transition: 'opacity 0.2s ease'
            }}
        >
            <div className="search-range-bar">
                {/* Background bar */}
                <div className="search-range-background" />
                
                {/* Active search range or progress bar */}
                <div 
                    className="search-range-active"
                    style={{
                        left: mode === 'progress' ? '0%' : `${leftPercent}%`,
                        width: mode === 'progress' ? `${m1Percent}%` : `${rightPercent - leftPercent}%`,
                        transition: 'all 0.3s ease'
                    }}
                />

                {/* Test points markers - only show in search mode */}
                {mode === 'search' && m1 !== undefined && m2 !== undefined && (
                    <>
                        <div 
                            className="search-range-test-point"
                            style={{
                                left: `${m1Percent}%`,
                                transition: 'left 0.3s ease'
                            }}
                        />
                        <div 
                            className="search-range-test-point"
                            style={{
                                left: `${m2Percent}%`,
                                transition: 'left 0.3s ease'
                            }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}; 