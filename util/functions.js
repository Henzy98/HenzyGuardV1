const Whitelist = require('../models/whitelist');
const Punishments = require('../models/punishments');
const Logs = require('../models/logs');
const henzy = require('../config/config.json');
const { validateHenzySignature } = require('./signature');
validateHenzySignature(henzy, 'henzy');

const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    success: (msg) => console.log(`[SUCCESS] ${msg}`)
};

async function isWhitelisted(userId) {
    try {
        const tokens = require('../config/tokens.json');
        const botIds = [
            tokens.CONTROLLER_BOT_ID,
            tokens.GUARD1_BOT_ID,
            tokens.GUARD2_BOT_ID,
            tokens.GUARD3_BOT_ID,
            ...(tokens.DIST_BOT_IDS || [])
        ];

        if (botIds.includes(userId)) {
            return true;
        }

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
        const inactiveDays = henzy.sleepMode.inactiveDays;
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

                    let sleepRole = guild.roles.cache.find(r => r.name === henzy.sleepMode.sleepRoleName);
                    if (!sleepRole) {
                        sleepRole = await guild.roles.create({
                            name: henzy.sleepMode.sleepRoleName,
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
        const guild = await client.guilds.fetch(henzy.guildId);
        const logChannelMap = {
            'ban': henzy.logChannels.guardLogs,
            'channel': henzy.logChannels.channelLogs,
            'role': henzy.logChannels.roleLogs,
            'spam': henzy.logChannels.securityLogs,
            'security': henzy.logChannels.securityLogs,
            'mod': henzy.logChannels.modLogs,
            'backup': henzy.backup?.backupLogChannel || 'backup-logs'
        };

        const channelName = logChannelMap[logType] || henzy.logChannels.guardLogs;
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
        const member = await guild.members.fetch(userId).catch(() => null);

        if (!member) {
            logger.error(`Kullanıcı bulunamadı: ${userId}`);
            await sendLog(guild.client, 'mod', {
                title: '❌ Ceza Uygulanamadı',
                description: `Kullanıcı sunucuda bulunamadı`,
                executor: null,
                action: 'PUNISHMENT_FAILED',
                target: userId,
                guardBot: guardBot,
                wasBlocked: false,
                fields: [
                    { name: 'Sebep', value: 'Kullanıcı sunucudan ayrılmış', inline: false },
                    { name: 'İşlem', value: reason, inline: false }
                ]
            });
            return;
        }

        const actualPunishmentType = punishmentType || henzy.punishment.type;
        const botMember = guild.members.me;

        if (actualPunishmentType === 'quarantine') {
            if (!botMember.permissions.has('ManageRoles')) {
                logger.error('Bot rol yönetimi yetkisine sahip değil!');
                await sendLog(guild.client, 'mod', {
                    title: '❌ Karantina Başarısız',
                    description: `Bot yetersiz yetkiye sahip - Rol yönetimi yetkisi gerekli`,
                    executor: null,
                    action: 'QUARANTINE_FAILED_PERMISSIONS',
                    target: userId,
                    guardBot: guardBot,
                    wasBlocked: false,
                    fields: [
                        { name: 'Hedef', value: `<@${userId}>`, inline: true },
                        { name: 'Eksik Yetki', value: 'Manage Roles', inline: true }
                    ]
                });
                return;
            }

            let quarantineRole = guild.roles.cache.find(r => r.name === henzy.punishment.quarantineRoleName);

            if (!quarantineRole) {
                try {
                    quarantineRole = await guild.roles.create({
                        name: henzy.punishment.quarantineRoleName,
                        color: 0x000000,
                        permissions: [],
                        reason: 'Henzy Guard: Karantina rolü oluşturuldu'
                    });

                    logger.success(`Karantina rolü oluşturuldu: ${quarantineRole.name}`);

                    if (botMember.permissions.has('ManageChannels')) {
                        const channels = await guild.channels.fetch();
                        for (const [, channel] of channels) {
                            try {
                                if (channel.isTextBased() || channel.type === 2) {
                                    await channel.permissionOverwrites.create(quarantineRole, {
                                        ViewChannel: false,
                                        SendMessages: false,
                                        Connect: false,
                                        Speak: false
                                    });
                                }
                            } catch (channelErr) {
                                logger.error(`Kanal izni ayarlanamadı [${channel.name}]: ${channelErr.message}`);
                            }
                        }
                    }
                } catch (roleErr) {
                    logger.error(`Karantina rolü oluşturulamadı: ${roleErr.message}`);
                    await sendLog(guild.client, 'mod', {
                        title: '❌ Karantina Rolü Oluşturulamadı',
                        description: `Karantina rolü oluşturulurken hata oluştu`,
                        executor: null,
                        action: 'QUARANTINE_ROLE_CREATE_FAILED',
                        target: userId,
                        guardBot: guardBot,
                        wasBlocked: false,
                        fields: [
                            { name: 'Hata', value: roleErr.message, inline: false }
                        ]
                    });
                    return;
                }
            }

            await member.roles.set([quarantineRole.id], `Henzy Guard: ${reason}`);
            logger.info(`Kullanıcı karantinaya alındı: ${userId}`);

        } else if (actualPunishmentType === 'kick') {
            if (!botMember.permissions.has('KickMembers')) {
                logger.error('Bot kick yetkisine sahip değil!');
                await sendLog(guild.client, 'mod', {
                    title: '❌ Kick Başarısız',
                    description: `Bot yetersiz yetkiye sahip - Kick yetkisi gerekli`,
                    executor: null,
                    action: 'KICK_FAILED_PERMISSIONS',
                    target: userId,
                    guardBot: guardBot,
                    wasBlocked: false,
                    fields: [
                        { name: 'Hedef', value: `<@${userId}>`, inline: true },
                        { name: 'Eksik Yetki', value: 'Kick Members', inline: true }
                    ]
                });
                return;
            }

            if (member.roles.highest.position >= botMember.roles.highest.position) {
                logger.error(`Hedef kullanıcı bottan yüksek role sahip: ${userId}`);
                await sendLog(guild.client, 'mod', {
                    title: '❌ Kick Başarısız',
                    description: `Hedef kullanıcı bottan yüksek veya eşit role sahip`,
                    executor: null,
                    action: 'KICK_FAILED_HIERARCHY',
                    target: userId,
                    guardBot: guardBot,
                    wasBlocked: false,
                    fields: [
                        { name: 'Hedef', value: `<@${userId}>`, inline: true },
                        { name: 'Hedef Rolü', value: member.roles.highest.name, inline: true },
                        { name: 'Bot Rolü', value: botMember.roles.highest.name, inline: true }
                    ]
                });
                return;
            }

            await member.kick(`Henzy Guard: ${reason}`);
            logger.info(`Kullanıcı kicklendi: ${userId}`);

        } else if (actualPunishmentType === 'ban') {
            if (!botMember.permissions.has('BanMembers')) {
                logger.error('Bot ban yetkisine sahip değil!');
                await sendLog(guild.client, 'mod', {
                    title: '❌ Ban Başarısız',
                    description: `Bot yetersiz yetkiye sahip - Ban yetkisi gerekli`,
                    executor: null,
                    action: 'BAN_FAILED_PERMISSIONS',
                    target: userId,
                    guardBot: guardBot,
                    wasBlocked: false,
                    fields: [
                        { name: 'Hedef', value: `<@${userId}>`, inline: true },
                        { name: 'Eksik Yetki', value: 'Ban Members', inline: true }
                    ]
                });
                return;
            }

            if (member.roles.highest.position >= botMember.roles.highest.position) {
                logger.error(`Hedef kullanıcı bottan yüksek role sahip: ${userId}`);
                await sendLog(guild.client, 'mod', {
                    title: '❌ Ban Başarısız',
                    description: `Hedef kullanıcı bottan yüksek veya eşit role sahip`,
                    executor: null,
                    action: 'BAN_FAILED_HIERARCHY',
                    target: userId,
                    guardBot: guardBot,
                    wasBlocked: false,
                    fields: [
                        { name: 'Hedef', value: `<@${userId}>`, inline: true },
                        { name: 'Hedef Rolü', value: member.roles.highest.name, inline: true },
                        { name: 'Bot Rolü', value: botMember.roles.highest.name, inline: true }
                    ]
                });
                return;
            }

            await member.ban({ reason: `Henzy Guard: ${reason}` });
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
        logger.error(`Ceza uygulama hatası: ${error.message}`);
        console.error('Stack trace:', error.stack);

        try {
            await sendLog(guild.client, 'mod', {
                title: '❌ Ceza Sistemi Hatası',
                description: `Ceza uygulanırken beklenmeyen bir hata oluştu`,
                executor: null,
                action: 'PUNISHMENT_ERROR',
                target: userId,
                guardBot: guardBot,
                wasBlocked: false,
                fields: [
                    { name: 'Hata', value: error.message, inline: false },
                    { name: 'Ceza Türü', value: punishmentType || henzy.punishment.type, inline: true }
                ]
            });
        } catch (logErr) {
            logger.error(`Log gönderme hatası: ${logErr.message}`);
        }
    }
}

module.exports = {
    isWhitelisted,
    updateLastSeen,
    checkInactiveUsers,
    sendLog,
    punishUser
};
