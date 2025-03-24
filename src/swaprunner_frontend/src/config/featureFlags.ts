// Feature flags configuration
// Set to true to enable features, false to disable

export const FEATURE_FLAGS = {
  // UI Features
  SHOW_TRANSACTIONS_TAB: true,     // Show/hide the transactions tab in navigation
  SHOW_CACHE_CONTROLS: false,       // Show/hide cache control buttons in token selector
  SHOW_SETTINGS_MENU: false,        // Show/hide settings option in logged-in menu
  SHOW_TIME_SPLIT_SWAP: false,      // Show/hide the time split swap feature
  FETCH_ALL_TOKEN_BALANCES: false,  // Enable/disable fetching all token balances in token selector
  SHOW_REFRESH_CACHE: false,        // Show/hide the refresh cache button in header
} as const;

// Type for feature flag keys
export type FeatureFlag = keyof typeof FEATURE_FLAGS;

// Simple hook to check if a feature is enabled
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
} 