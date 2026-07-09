// Shared constants. Keep everything tunable in ONE place.
const path = require('path');

module.exports = {
  PORT: Number(process.env.PORT || 5173),
  // Approximate EUR→USD rate for Google Flights prices (scraper is EUR-locked).
  // Honest, fixed, and clearly labeled as approximate in the UI.
  EUR_TO_USD: Number(process.env.EUR_TO_USD || 1.08),
  // Route-scaled travel-time ceiling (hours). Coarse single tier for v1.
  MAXH: Number(process.env.MAXH || 24),
  // Where our search output lives (in OUR folder — never the read-only backend).
  CAPTURES_DIR: path.join(__dirname, '.captures'),
  RESULTS_FILE: path.join(__dirname, '.captures', 'results.json'),
  GFLIGHTS_FILE: path.join(__dirname, '.captures', 'gflights_results.json'),
  // Read-only backend location (we only ever READ from here).
  BACKEND_DIR: '/workspaces/other_project',
};
