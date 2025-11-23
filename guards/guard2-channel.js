const { Client, GatewayIntentBits, AuditLogEvent } = require('discord.js');
const mongoose = require('mongoose');
const Logger = require('../util/logger');
const { isWhitelisted, sendLog, punishUser, updateLastSeen } = require('../util/functions');
const { setupVoiceAndDM } = require('../util/guardPresence');
const config = require('../config/config.json');
const dbConfig = require('../config/database.json');
const tokens = require('../config/tokens.json');

const logger = new Logger('GUARD2-CHANNEL');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

mongoose.connect(dbConfig.uri, dbConfig.options)
    .then(() => logger.success('MongoDB bağlantısı başarılı'))
    .catch(err => logger.error('MongoDB bağlantı hatası: ' + err));

const channelCache = new Map();

client.once('ready', async () => {
    logger.success(`Guard 2 (Channel Protection) aktif: ${client.user.tag}`);

    const guild = await client.guilds.fetch(config.guildId);
    guild.channels.cache.forEach(channel => {
        channelCache.set(channel.id, {
            name: channel.name,
            permissions: channel.permissionOverwrites.cache.clone()
        });
    });

    logger.info(`${channelCache.size} kanal cache'e alındı`);
    await setupVoiceAndDM(client, 'GUARD2-CHANNEL', logger);
});

client.on('channelCreate', async (channel) => {
    if (channel.guild.name !== config.guildName || channel.guild.id !== config.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await channel.guild.fetchAuditLogs({
            type: AuditLogEvent.ChannelCreate,
            limit: 1
        });

        const createLog = auditLogs.entries.first();

        if (!createLog) return;

        const executor = createLog.executor;

        if (executor.id === client.user.id) return;

        logger.info(`Kanal oluşturma tespit edildi: ${executor.tag} -> ${channel.name}`);

        const whitelisted = await isWhitelisted(executor.id);

        if (!whitelisted) {
            logger.warn(`Yetkisiz kanal oluşturma: ${executor.tag}`);

            await channel.delete('Guard 2: Yetkisiz kanal oluşturma engellendi');
            logger.success(`Kanal silindi: ${channel.name}`);

            await punishUser(
                channel.guild,
                executor.id,
                'GUARD2-CHANNEL',
                'Yetkisiz kanal oluşturmaya çalıştı',
                'Whitelist\'te olmayan kullanıcı kanal oluşturdu'
            );

            await sendLog(client, 'channel', {
                title: '🚫 Yetkisiz Kanal Oluşturma Engellendi',
                description: `${executor.tag} yetkisiz kanal oluşturmaya çalıştı!`,
                executor: executor.id,
                action: 'CHANNEL_CREATE_BLOCKED',
                target: channel.id,
                guardBot: 'GUARD2-CHANNEL',
                wasBlocked: true,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Kanal Adı', value: channel.name, inline: true },
                    { name: 'Aksiyon', value: 'Kanal silindi, executor cezalandırıldı', inline: false }
                ]
            });

        } else {
            await updateLastSeen(executor.id);

            channelCache.set(channel.id, {
                name: channel.name,
                permissions: channel.permissionOverwrites.cache.clone()
            });

            await sendLog(client, 'channel', {
                title: '✅ Yetkili Kanal Oluşturma',
                description: `${executor.tag} yeni bir kanal oluşturdu`,
                executor: executor.id,
                action: 'CHANNEL_CREATE_AUTHORIZED',
                target: channel.id,
                guardBot: 'GUARD2-CHANNEL',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Kanal', value: channel.name, inline: true }
                ]
            });

            logger.info(`Yetkili kanal oluşturma: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Channel create hatası: ' + error.message);
    }
});

client.on('channelDelete', async (channel) => {
    if (channel.guild.name !== config.guildName || channel.guild.id !== config.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await channel.guild.fetchAuditLogs({
            type: AuditLogEvent.ChannelDelete,
            limit: 1
        });

        const deleteLog = auditLogs.entries.first();

        if (!deleteLog) return;

        const executor = deleteLog.executor;

        if (executor.id === client.user.id) return;

        logger.info(`Kanal silme tespit edildi: ${executor.tag} -> ${channel.name}`);

        const whitelisted = await isWhitelisted(executor.id);

        if (!whitelisted) {
            logger.warn(`Yetkisiz kanal silme: ${executor.tag}`);

            const cachedChannel = channelCache.get(channel.id);

            if (cachedChannel) {
                const newChannel = await channel.guild.channels.create({
                    name: cachedChannel.name,
                    type: channel.type,
                    parent: channel.parent,
                    permissionOverwrites: Array.from(cachedChannel.permissions.values())
                });

                logger.success(`Kanal geri yüklendi: ${newChannel.name}`);
            }

            await punishUser(
                channel.guild,
                executor.id,
                'GUARD2-CHANNEL',
                'Yetkisiz kanal silmeye çalıştı',
                'Whitelist\'te olmayan kullanıcı kanal sildi'
            );

            await sendLog(client, 'channel', {
                title: '🚫 Yetkisiz Kanal Silme Engellendi',
                description: `${executor.tag} yetkisiz kanal silmeye çalıştı!`,
                executor: executor.id,
                action: 'CHANNEL_DELETE_BLOCKED',
                target: channel.id,
                guardBot: 'GUARD2-CHANNEL',
                wasBlocked: true,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Silinen Kanal', value: channel.name, inline: true },
                    { name: 'Aksiyon', value: 'Kanal geri yüklendi, executor cezalandırıldı', inline: false }
                ]
            });

        } else {
            await updateLastSeen(executor.id);

            channelCache.delete(channel.id);

            await sendLog(client, 'channel', {
                title: '✅ Yetkili Kanal Silme',
                description: `${executor.tag} bir kanal sildi`,
                executor: executor.id,
                action: 'CHANNEL_DELETE_AUTHORIZED',
                target: channel.id,
                guardBot: 'GUARD2-CHANNEL',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Silinen Kanal', value: channel.name, inline: true }
                ]
            });

            logger.info(`Yetkili kanal silme: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Channel delete hatası: ' + error.message);
    }
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (newChannel.guild.name !== config.guildName || newChannel.guild.id !== config.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await newChannel.guild.fetchAuditLogs({
            type: AuditLogEvent.ChannelUpdate,
            limit: 1
        });

        const updateLog = auditLogs.entries.first();

        if (!updateLog || updateLog.target.id !== newChannel.id) return;

        const executor = updateLog.executor;

        if (executor.id === client.user.id) return;

        const whitelisted = await isWhitelisted(executor.id);

        const nameChanged = oldChannel.name !== newChannel.name;
        const permissionsChanged = !oldChannel.permissionOverwrites.cache.equals(newChannel.permissionOverwrites.cache);

        if (nameChanged || permissionsChanged) {
            logger.info(`Kanal güncelleme tespit edildi: ${executor.tag} -> ${newChannel.name}`);

            if (!whitelisted) {
                logger.warn(`Yetkisiz kanal güncelleme: ${executor.tag}`);

                if (nameChanged) {
                    await newChannel.setName(oldChannel.name, 'Guard 2: Yetkisiz isim değişikliği geri alındı');
                    logger.success(`Kanal ismi geri alındı: ${oldChannel.name}`);
                }

                if (permissionsChanged) {
                    await newChannel.permissionOverwrites.set(
                        Array.from(oldChannel.permissionOverwrites.cache.values()),
                        'Guard 2: Yetkisiz izin değişikliği geri alındı'
                    );
                    logger.success(`Kanal izinleri geri alındı: ${newChannel.name}`);
                }

                await punishUser(
                    newChannel.guild,
                    executor.id,
                    'GUARD2-CHANNEL',
                    'Yetkisiz kanal güncelleme',
                    'Whitelist\'te olmayan kullanıcı kanal güncelledi'
                );

                await sendLog(client, 'channel', {
                    title: '🚫 Yetkisiz Kanal Güncelleme Engellendi',
                    description: `${executor.tag} yetkisiz kanal güncellemeye çalıştı!`,
                    executor: executor.id,
                    action: 'CHANNEL_UPDATE_BLOCKED',
                    target: newChannel.id,
                    guardBot: 'GUARD2-CHANNEL',
                    wasBlocked: true,
                    fields: [
                        { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                        { name: 'Kanal', value: newChannel.name, inline: true },
                        { name: 'Değişiklikler', value: nameChanged ? 'İsim değişikliği geri alındı' : 'İzin değişikliği geri alındı', inline: false }
                    ]
                });

            } else {
                await updateLastSeen(executor.id);

                channelCache.set(newChannel.id, {
                    name: newChannel.name,
                    permissions: newChannel.permissionOverwrites.cache.clone()
                });

                await sendLog(client, 'channel', {
                    title: '✅ Yetkili Kanal Güncelleme',
                    description: `${executor.tag} bir kanal güncelledi`,
                    executor: executor.id,
                    action: 'CHANNEL_UPDATE_AUTHORIZED',
                    target: newChannel.id,
                    guardBot: 'GUARD2-CHANNEL',
                    wasBlocked: false,
                    fields: [
                        { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                        { name: 'Kanal', value: newChannel.name, inline: true },
                        { name: 'Eski İsim', value: oldChannel.name !== newChannel.name ? oldChannel.name : 'Değişmedi', inline: true }
                    ]
                });

                logger.info(`Yetkili kanal güncelleme: ${executor.tag}`);
            }
        }

    } catch (error) {
        logger.error('Channel update hatası: ' + error.message);
    }
});

client.login(tokens.GUARD2_TOKEN)
    .then(() => logger.info('Guard 2 bot giriş yapıyor...'))
    .catch(err => logger.error('Guard 2 login hatası: ' + err));
