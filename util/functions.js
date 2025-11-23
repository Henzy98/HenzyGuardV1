const Whitelist = require('../models/whitelist');
const Punishments = require('../models/punishments');
const Logs = require('../models/logs');
const config = require('../config/config.json');

const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`)
};

async function isWhitelisted(userId) {
    try {
        const whitelistEntry = await Whitelist.findOne({ userId, isActive: true });
        return !!whitelistEntry;
    } catch (error) {
        logger.error('Whitelist kontrol hatası: ' + error);
        return false;
    }
}

async function updateLastSeen(userId) {
    try {
        await Whitelist.findOneAndUpdate(
            { userId },
            { lastSeen: new Date() },
            { new: true }
        );
    } catch (error) {
        logger.error('LastSeen güncelleme hatası: ' + error);
    }
}

async function checkInactiveUsers(guild) {
    try {
        const whitelistUsers = await Whitelist.find({ isActive: true, inSleepMode: false });
        const inactiveDays = config.sleepMode.inactiveDays;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

        for (const user of whitelistUsers) {
            if (user.lastSeen < cutoffDate) {
                const member = await guild.members.fetch(user.userId).catch(() => null);

                if (member) {
                    const currentRoles = member.roles.cache
                        .filter(role => role.id !== guild.id)
                        .map(role => role.id);

                    await Whitelist.findOneAndUpdate(
                        { userId: user.userId },
                        {
                            savedRoles: currentRoles,
                            inSleepMode: true
                        }
                    );

                    await member.roles.set([]);

                    let sleepRole = guild.roles.cache.find(r => r.name === config.sleepMode.sleepRoleName);
                    if (!sleepRole) {
                        sleepRole = await guild.roles.create({
                            name: config.sleepMode.sleepRoleName,
                            color: '#808080',
                            reason: 'Uyku modu rolü'
                        });
                    }

                    await member.roles.add(sleepRole);
                }
            }
        }
    } catch (error) {
        logger.error('Inaktif kullanıcı kontrolü hatası: ' + error);
    }
}

async function sendLog(client, logType, data) {
    try {
        const guild = await client.guilds.fetch(config.guildId);
        const logChannelMap = {
            'ban': config.logChannels.guardLogs,
            'channel': config.logChannels.channelLogs,
            'role': config.logChannels.roleLogs,
            'spam': config.logChannels.securityLogs,
            'security': config.logChannels.securityLogs,
            'mod': config.logChannels.modLogs
        };

        const channelName = logChannelMap[logType] || config.logChannels.guardLogs;
        const logChannel = guild.channels.cache.find(ch => ch.name === channelName);

        if (logChannel) {
            const embed = {
                color: data.wasBlocked ? 0xff0000 : 0x00ff00,
                title: data.title || 'Security Log',
                description: data.description || '',
                fields: data.fields || [],
                timestamp: new Date(),
                footer: { text: `${data.guardBot || 'System'} | Henzy Guard` }
            };

            await logChannel.send({ embeds: [embed] });
        }

        await Logs.create({
            type: logType,
            executor: data.executor,
            action: data.action,
            target: data.target,
            guardBot: data.guardBot,
            details: data.details || {},
            wasBlocked: data.wasBlocked || false
        });

    } catch (error) {
        logger.error('Log gönderme hatası: ' + error);
    }
}

async function punishUser(guild, userId, guardBot, reason, details, punishmentType = null) {
    try {
        const member = await guild.members.fetch(userId);
        const actualPunishmentType = punishmentType || config.punishment.type;

        if (actualPunishmentType === 'quarantine') {
            let quarantineRole = guild.roles.cache.find(r => r.name === config.punishment.quarantineRoleName);

            if (!quarantineRole) {
                quarantineRole = await guild.roles.create({
                    name: config.punishment.quarantineRoleName,
                    color: 0x000000,
                    permissions: [],
                    reason: 'Guard: Karantina rolü oluşturuldu'
                });

                const channels = await guild.channels.fetch();
                for (const [, channel] of channels) {
                    if (channel.isTextBased() || channel.type === 2) {
                        await channel.permissionOverwrites.create(quarantineRole, {
                            ViewChannel: false,
                            SendMessages: false,
                            Connect: false,
                            Speak: false
                        });
                    }
                }
            }

            await member.roles.set([quarantineRole.id], 'Guard: Karantinaya alındı');
            logger.info(`Kullanıcı karantinaya alındı: ${userId}`);

        } else if (actualPunishmentType === 'kick') {
            await member.kick(`Guard: ${reason}`);
            logger.info(`Kullanıcı kicklendi: ${userId}`);

        } else if (actualPunishmentType === 'ban') {
            await member.ban({ reason: `Guard: ${reason}` });
            logger.info(`Kullanıcı banlandı: ${userId}`);
        }

        await Punishments.create({
            userId,
            guardBot,
            action: reason,
            reason: details,
            punishmentType: actualPunishmentType,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('Ceza uygulama hatası:', error);
    }
}

module.exports = {
    isWhitelisted,
    updateLastSeen,
    checkInactiveUsers,
    sendLog,
    punishUser
};
