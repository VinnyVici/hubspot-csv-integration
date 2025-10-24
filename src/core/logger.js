/**
 * Simple logging utility for HubSpot CSV Integration
 */

class Logger {
  constructor(level = 'info') {
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    this.level = this.levels[level] || this.levels.info;
  }

  error(message, ...args) {
    if (this.level >= this.levels.error) {
      console.error(`❌ ERROR: ${message}`, ...args);
    }
  }

  warn(message, ...args) {
    if (this.level >= this.levels.warn) {
      console.warn(`⚠️  WARN: ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (this.level >= this.levels.info) {
      console.log(`ℹ️  INFO: ${message}`, ...args);
    }
  }

  debug(message, ...args) {
    if (this.level >= this.levels.debug) {
      console.log(`🔍 DEBUG: ${message}`, ...args);
    }
  }

  // Success messages (always shown for user feedback)
  success(message, ...args) {
    console.log(`✅ ${message}`, ...args);
  }

  // Progress messages (always shown for user feedback)
  progress(message, ...args) {
    console.log(`📊 ${message}`, ...args);
  }

  // Important operation messages (always shown)
  operation(message, ...args) {
    console.log(`🔧 ${message}`, ...args);
  }
}

// Export singleton instance
const logger = new Logger(process.env.LOG_LEVEL || 'info');
module.exports = logger;