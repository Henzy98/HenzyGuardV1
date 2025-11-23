const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['ban', 'channel', 'role', 'spam', 'permission', 'bot_add', 'security']
    },
    executor: {
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true
    },
    target: {
        type: String,
        default: null
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    guardBot: {
        type: String,
        required: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    wasBlocked: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Log', logSchema);
