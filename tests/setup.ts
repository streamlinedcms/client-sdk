// Set default LOG_LEVEL for tests if not already set
// In jsdom, loganite checks localStorage (not process.env) because window exists
const logLevel = process.env.LOG_LEVEL || 'fatal';
localStorage.setItem('LOG_LEVEL', logLevel);
