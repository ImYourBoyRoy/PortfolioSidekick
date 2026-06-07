// ./frontend/src/app/utils/formatters.js
/**
 * Shared UI formatters for Portfolio Sidekick.
 * Created by: Roy Dawson IV
 */

export const formatCurrency = (val) => {
  if (val === undefined || val === null || Number.isNaN(val)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
};

export const getCoachActionCutoff = (coachTimeFilter, referenceTimeMs) => {
  const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
  return referenceTimeMs - (daysMap[coachTimeFilter] || 9999) * 86400000;
};

export const formatLastSync = (lastSyncTime) => {
  if (!lastSyncTime) return 'Never';
  const elapsedSeconds = Math.floor((Date.now() - new Date(lastSyncTime).getTime()) / 1000);
  if (elapsedSeconds < 60) return 'just now';
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return new Date(lastSyncTime).toLocaleDateString();
};
