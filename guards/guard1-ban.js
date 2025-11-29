const { Client, GatewayIntentBits, AuditLogEvent } = require('discord.js');
const mongoose = require('mongoose');
const Logger = require('../util/logger');
const { isWhitelisted, sendLog, punishUser, updateLastSeen } = require('../util/functions');
const { setupVoiceAndDM } = require('../util/guardPresence');
const henzy = require('../config/config.json');
const { validateHenzySignature } = require('../util/signature');
validateHenzySignature(henzy, 'henzy');
const dbConfig = require('../config/database.json');
const tokens = require('../config/tokens.json');

const logger = new Logger('GUARD1-BAN');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

mongoose.connect(dbConfig.uri, dbConfig.options)
    .then(() => logger.success('MongoDB bağlantısı başarılı'))
    .catch(err => logger.error('MongoDB bağlantı hatası: ' + err));

client.once('ready', async () => {
    logger.success(`Guard 1 (Ban Protection) aktif: ${client.user.tag}`);
    await setupVoiceAndDM(client, 'GUARD1-BAN', logger);
});

client.on('guildBanAdd', async (ban) => {
    if (ban.guild.name !== henzy.guildName || ban.guild.id !== henzy.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await ban.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberBanAdd,
            limit: 1
        });

        const banLog = auditLogs.entries.first();

        if (!banLog) {
            logger.warn('Audit log bulunamadı!');
            return;
        }

        const executor = banLog.executor;
        const target = ban.user;

        if (executor.id === client.user.id) return;

        logger.info(`Ban işlemi tespit edildi: ${executor.tag} -> ${target.tag}`);

        const whitelisted = await isWhitelisted(executor.id);

        if (!whitelisted) {
            logger.warn(`Yetkisiz ban girişimi: ${executor.tag}`);

            await ban.guild.members.unban(target.id, 'Guard 1: Yetkisiz ban geri alındı');
            logger.success(`Ban geri alındı: ${target.tag}`);

            await punishUser(
                ban.guild,
                executor.id,
                'GUARD1-BAN',
                'Yetkisiz ban işlemi',
                'Whitelist\'te olmayan kullanıcı ban attı'
            );

            await sendLog(client, 'ban', {
                title: '🔨 Yetkisiz Ban Girişimi Engellendi',
                description: `${executor.tag} yetkisiz ban atmaya çalıştı!`,
                executor: executor.id,
                action: 'BAN_ATTEMPT_BLOCKED',
                target: target.id,
                guardBot: 'GUARD1-BAN',
                wasBlocked: true,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Hedef', value: `<@${target.id}>`, inline: true },
                    { name: 'Aksiyon', value: 'Ban geri alındı, executor cezalandırıldı', inline: false }
                ]
            });

        } else {
            await updateLastSeen(executor.id);

            await sendLog(client, 'ban', {
                title: '✅ Yetkili Ban İşlemi',
                description: `${executor.tag} bir kullanıcıyı banladı`,
                executor: executor.id,
                action: 'BAN_AUTHORIZED',
                target: target.id,
                guardBot: 'GUARD1-BAN',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Banlanan', value: `<@${target.id}>`, inline: true },
                    { name: 'Sebep', value: banLog.reason || 'Belirtilmemiş', inline: false }
                ]
            });

            logger.info(`Yetkili ban işlemi onaylandı: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Ban işlemi hatası: ' + error.message);
    }
});

client.on('guildBanRemove', async (ban) => {
    if (ban.guild.name !== henzy.guildName || ban.guild.id !== henzy.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await ban.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberBanRemove,
            limit: 1
        });

        const unbanLog = auditLogs.entries.first();

        if (!unbanLog) return;

        const executor = unbanLog.executor;
        const target = ban.user;

        if (executor.id === client.user.id) return;

        const whitelisted = await isWhitelisted(executor.id);

        if (whitelisted) {
            await updateLastSeen(executor.id);

            await sendLog(client, 'ban', {
                title: '✅ Yetkili Unban İşlemi',
                description: `${executor.tag} bir kullanıcının banını kaldırdı`,
                executor: executor.id,
                action: 'UNBAN_AUTHORIZED',
                target: target.id,
                guardBot: 'GUARD1-BAN',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Unbanlanan', value: `<@${target.id}>`, inline: true }
                ]
            });

            logger.info(`Yetkili unban işlemi: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Unban işlemi hatası: ' + error.message);
    }
});

client.login(tokens.GUARD1_TOKEN)
    .then(() => logger.info('Guard 1 bot giriş yapıyor...'))
    .catch(err => logger.error('Guard 1 login hatası: ' + err));
