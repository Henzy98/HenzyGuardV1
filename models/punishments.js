const mongoose = require('mongoose');

const punishmentSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    guardBot: {
        type: String,
        required: true
    },
    action: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    evidence: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    punishmentType: {
        type: String,
        enum: ['quarantine', 'kick', 'ban', 'role_remove', 'warn', 'timeout'],
        required: true
    }
});

module.exports = mongoose.model('Punishment', punishmentSchema);
