const mongoose = require('mongoose');

const whitelistSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    addedBy: {
        type: String,
        required: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    savedRoles: {
        type: [String],
        default: []
    },
    inSleepMode: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Whitelist', whitelistSchema);
