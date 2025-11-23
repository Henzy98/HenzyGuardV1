const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

const logLevels = {
    ERROR: { color: colors.red, prefix: '[ERROR]' },
    WARN: { color: colors.yellow, prefix: '[WARN]' },
    INFO: { color: colors.blue, prefix: '[INFO]' },
    SUCCESS: { color: colors.green, prefix: '[SUCCESS]' },
    DEBUG: { color: colors.magenta, prefix: '[DEBUG]' }
};

class Logger {
    constructor(botName) {
        this.botName = botName;
    }

    formatMessage(level, message) {
        const timestamp = new Date().toISOString();
        const levelConfig = logLevels[level];
        return `${levelConfig.color}[${timestamp}] [${this.botName}] ${levelConfig.prefix} ${message}${colors.reset}`;
    }

    log(level, message) {
        console.log(this.formatMessage(level, message));
    }

    error(message) {
        this.log('ERROR', message);
    }

    warn(message) {
        this.log('WARN', message);
    }

    info(message) {
        this.log('INFO', message);
    }

    success(message) {
        this.log('SUCCESS', message);
    }

    debug(message) {
        this.log('DEBUG', message);
    }
}

module.exports = Logger;
