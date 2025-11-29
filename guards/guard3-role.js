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

const logger = new Logger('GUARD3-ROLE');

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

const roleCache = new Map();

client.once('ready', async () => {
    logger.success(`Guard 3 (Role & Bot Protection) aktif: ${client.user.tag}`);

    const guild = await client.guilds.fetch(henzy.guildId);
    guild.roles.cache.forEach(role => {
        roleCache.set(role.id, {
            name: role.name,
            color: role.color,
            permissions: role.permissions.bitfield,
            position: role.position,
            hoist: role.hoist,
            mentionable: role.mentionable
        });
    });

    logger.info(`${roleCache.size} rol cache'e alındı`);
    await setupVoiceAndDM(client, 'GUARD3-ROLE', logger);
});

client.on('roleCreate', async (role) => {
    if (role.guild.name !== henzy.guildName || role.guild.id !== henzy.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await role.guild.fetchAuditLogs({
            type: AuditLogEvent.RoleCreate,
            limit: 1
        });

        const createLog = auditLogs.entries.first();

        if (!createLog) return;

        const executor = createLog.executor;

        if (executor.id === client.user.id) return;

        logger.info(`Rol oluşturma tespit edildi: ${executor.tag} -> ${role.name}`);

        const whitelisted = await isWhitelisted(executor.id);

        if (!whitelisted) {
            logger.warn(`Yetkisiz rol oluşturma: ${executor.tag}`);

            await role.delete('Guard 3: Yetkisiz rol oluşturma engellendi');
            logger.success(`Rol silindi: ${role.name}`);

            await punishUser(
                role.guild,
                executor.id,
                'GUARD3-ROLE',
                'Yetkisiz rol oluşturmaya çalıştı',
                'Whitelist\'te olmayan kullanıcı rol oluşturdu'
            );

            await sendLog(client, 'role', {
                title: '🚫 Yetkisiz Rol Oluşturma Engellendi',
                description: `${executor.tag} yetkisiz rol oluşturmaya çalıştı!`,
                executor: executor.id,
                action: 'ROLE_CREATE_BLOCKED',
                target: role.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: true,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Rol Adı', value: role.name, inline: true },
                    { name: 'Aksiyon', value: 'Rol silindi, executor cezalandırıldı', inline: false }
                ]
            });

        } else {
            await updateLastSeen(executor.id);

            roleCache.set(role.id, {
                name: role.name,
                color: role.color,
                permissions: role.permissions.bitfield,
                position: role.position,
                hoist: role.hoist,
                mentionable: role.mentionable
            });

            await sendLog(client, 'role', {
                title: '✅ Yetkili Rol Oluşturma',
                description: `${executor.tag} yeni bir rol oluşturdu`,
                executor: executor.id,
                action: 'ROLE_CREATE_AUTHORIZED',
                target: role.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Rol', value: role.name, inline: true }
                ]
            });

            logger.info(`Yetkili rol oluşturma: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Role create hatası: ' + error.message);
    }
});

client.on('roleDelete', async (role) => {
    if (role.guild.name !== henzy.guildName || role.guild.id !== henzy.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await role.guild.fetchAuditLogs({
            type: AuditLogEvent.RoleDelete,
            limit: 1
        });

        const deleteLog = auditLogs.entries.first();

        if (!deleteLog) return;

        const executor = deleteLog.executor;

        if (executor.id === client.user.id) return;

        logger.info(`Rol silme tespit edildi: ${executor.tag} -> ${role.name}`);

        const whitelisted = await isWhitelisted(executor.id);

        if (!whitelisted) {
            logger.warn(`Yetkisiz rol silme: ${executor.tag}`);

            const cachedRole = roleCache.get(role.id);

            if (cachedRole) {
                const newRole = await role.guild.roles.create({
                    name: cachedRole.name,
                    color: cachedRole.color,
                    permissions: cachedRole.permissions,
                    hoist: cachedRole.hoist,
                    mentionable: cachedRole.mentionable,
                    reason: 'Guard 3: Silinen rol geri yüklendi'
                });

                logger.success(`Rol geri yüklendi: ${newRole.name}`);
            }

            await punishUser(
                role.guild,
                executor.id,
                'GUARD3-ROLE',
                'Yetkisiz rol silmeye çalıştı',
                'Whitelist\'te olmayan kullanıcı rol sildi'
            );

            await sendLog(client, 'role', {
                title: '🚫 Yetkisiz Rol Silme Engellendi',
                description: `${executor.tag} yetkisiz rol silmeye çalıştı!`,
                executor: executor.id,
                action: 'ROLE_DELETE_BLOCKED',
                target: role.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: true,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Silinen Rol', value: role.name, inline: true },
                    { name: 'Aksiyon', value: 'Rol geri yüklendi, executor cezalandırıldı', inline: false }
                ]
            });

        } else {
            await updateLastSeen(executor.id);

            roleCache.delete(role.id);

            await sendLog(client, 'role', {
                title: '✅ Yetkili Rol Silme',
                description: `${executor.tag} bir rol sildi`,
                executor: executor.id,
                action: 'ROLE_DELETE_AUTHORIZED',
                target: role.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Silinen Rol', value: role.name, inline: true }
                ]
            });

            logger.info(`Yetkili rol silme: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Role delete hatası: ' + error.message);
    }
});

client.on('roleUpdate', async (oldRole, newRole) => {
    if (newRole.guild.name !== henzy.guildName || newRole.guild.id !== henzy.guildId) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await newRole.guild.fetchAuditLogs({
            type: AuditLogEvent.RoleUpdate,
            limit: 1
        });

        const updateLog = auditLogs.entries.first();

        if (!updateLog || updateLog.target.id !== newRole.id) return;

        const executor = updateLog.executor;

        if (executor.id === client.user.id) return;

        const nameChanged = oldRole.name !== newRole.name;
        const permissionsChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;

        if (nameChanged || permissionsChanged) {
            logger.info(`Rol güncelleme tespit edildi: ${executor.tag} -> ${newRole.name}`);

            const whitelisted = await isWhitelisted(executor.id);

            if (!whitelisted) {
                logger.warn(`Yetkisiz rol güncelleme: ${executor.tag}`);

                await newRole.edit({
                    name: oldRole.name,
                    permissions: oldRole.permissions.bitfield,
                    color: oldRole.color,
                    hoist: oldRole.hoist,
                    mentionable: oldRole.mentionable
                }, 'Guard 3: Yetkisiz rol değişikliği geri alındı');

                logger.success(`Rol değişikliği geri alındı: ${oldRole.name}`);

                await punishUser(
                    newRole.guild,
                    executor.id,
                    'GUARD3-ROLE',
                    'Yetkisiz rol güncellemesi',
                    'Whitelist\'te olmayan kullanıcı rol güncelledi'
                );

                await sendLog(client, 'role', {
                    title: '🚫 Yetkisiz Rol Güncelleme Engellendi',
                    description: `${executor.tag} yetkisiz rol güncellemeye çalıştı!`,
                    executor: executor.id,
                    action: 'ROLE_UPDATE_BLOCKED',
                    target: newRole.id,
                    guardBot: 'GUARD3-ROLE',
                    wasBlocked: true,
                    fields: [
                        { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                        { name: 'Rol', value: oldRole.name, inline: true },
                        { name: 'Aksiyon', value: 'Değişiklikler geri alındı', inline: false }
                    ]
                });

            } else {
                await updateLastSeen(executor.id);

                roleCache.set(newRole.id, {
                    name: newRole.name,
                    color: newRole.color,
                    permissions: newRole.permissions.bitfield,
                    position: newRole.position,
                    hoist: newRole.hoist,
                    mentionable: newRole.mentionable
                });

                await sendLog(client, 'role', {
                    title: '✅ Yetkili Rol Güncelleme',
                    description: `${executor.tag} bir rol güncelledi`,
                    executor: executor.id,
                    action: 'ROLE_UPDATE_AUTHORIZED',
                    target: newRole.id,
                    guardBot: 'GUARD3-ROLE',
                    wasBlocked: false,
                    fields: [
                        { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                        { name: 'Rol', value: newRole.name, inline: true },
                        { name: 'Eski İsim', value: oldRole.name !== newRole.name ? oldRole.name : 'Değişmedi', inline: true }
                    ]
                });

                logger.info(`Yetkili rol güncelleme: ${executor.tag}`);
            }
        }

    } catch (error) {
        logger.error('Role update hatası: ' + error.message);
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (newMember.guild.name !== henzy.guildName || newMember.guild.id !== henzy.guildId) return;

    try {
        const addedRoles = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

        if (addedRoles.size === 0 && removedRoles.size === 0) return;

        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await newMember.guild.fetchAuditLogs({
            type: AuditLogEvent.MemberRoleUpdate,
            limit: 1
        });

        const roleLog = auditLogs.entries.first();

        if (!roleLog || roleLog.target.id !== newMember.id) return;

        const executor = roleLog.executor;

        if (executor.id === client.user.id) return;

        logger.info(`Rol değişimi tespit edildi: ${executor.tag} -> ${newMember.user.tag}`);

        const whitelisted = await isWhitelisted(executor.id);

        if (!whitelisted) {
            logger.warn(`Yetkisiz rol verme/alma: ${executor.tag}`);

            await newMember.roles.set(oldMember.roles.cache, 'Guard 3: Yetkisiz rol değişikliği geri alındı');
            logger.success(`Roller geri yüklendi: ${newMember.user.tag}`);

            await punishUser(
                newMember.guild,
                executor.id,
                'GUARD3-ROLE',
                'Yetkisiz rol verme/alma',
                'Whitelist\'te olmayan kullanıcı rol verdi/aldı'
            );

            await sendLog(client, 'role', {
                title: '🚫 Yetkisiz Rol Verme/Alma Engellendi',
                description: `${executor.tag} yetkisiz rol vermeye/almaya çalıştı!`,
                executor: executor.id,
                action: 'MEMBER_ROLE_UPDATE_BLOCKED',
                target: newMember.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: true,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Hedef', value: `<@${newMember.id}>`, inline: true },
                    { name: 'Aksiyon', value: 'Roller geri alındı, executor cezalandırıldı', inline: false }
                ]
            });

        } else {
            await updateLastSeen(executor.id);

            const roleNames = addedRoles.size > 0
                ? addedRoles.map(r => r.name).join(', ')
                : removedRoles.map(r => r.name).join(', ');

            await sendLog(client, 'role', {
                title: '✅ Yetkili Rol Değişikliği',
                description: `${executor.tag} rol verdi/aldı`,
                executor: executor.id,
                action: 'MEMBER_ROLE_UPDATE_AUTHORIZED',
                target: newMember.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Hedef', value: `<@${newMember.id}>`, inline: true },
                    { name: addedRoles.size > 0 ? 'Eklenen Roller' : 'Alınan Roller', value: roleNames, inline: false }
                ]
            });

            logger.info(`Yetkili rol değişikliği: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Member role update hatası: ' + error.message);
    }
});

client.on('guildMemberAdd', async (member) => {
    if (member.guild.name !== henzy.guildName || member.guild.id !== henzy.guildId) return;
    if (!member.user.bot) return;

    try {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const auditLogs = await member.guild.fetchAuditLogs({
            type: AuditLogEvent.BotAdd,
            limit: 1
        });

        const botLog = auditLogs.entries.first();

        if (!botLog || botLog.target.id !== member.id) return;

        const executor = botLog.executor;

        logger.info(`Bot ekleme tespit edildi: ${executor.tag} -> ${member.user.tag}`);

        const whitelisted = await isWhitelisted(executor.id);

        if (!whitelisted) {
            logger.warn(`Yetkisiz bot ekleme: ${executor.tag}`);

            await member.kick('Guard 3: Yetkisiz bot ekleme engellendi');
            logger.success(`Bot atıldı: ${member.user.tag}`);

            await punishUser(
                member.guild,
                executor.id,
                'GUARD3-ROLE',
                'Yetkisiz bot eklemeye çalıştı',
                'Whitelist\'te olmayan kullanıcı bot ekledi'
            );

            await sendLog(client, 'security', {
                title: '🚫 Yetkisiz Bot Ekleme Engellendi',
                description: `${executor.tag} yetkisiz bot eklemeye çalıştı!`,
                executor: executor.id,
                action: 'BOT_ADD_BLOCKED',
                target: member.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: true,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Bot', value: `<@${member.id}>`, inline: true },
                    { name: 'Aksiyon', value: 'Bot atıldı, executor cezalandırıldı', inline: false }
                ]
            });

        } else {
            await updateLastSeen(executor.id);

            await sendLog(client, 'security', {
                title: '✅ Yetkili Bot Ekleme',
                description: `${executor.tag} bir bot ekledi`,
                executor: executor.id,
                action: 'BOT_ADD_AUTHORIZED',
                target: member.id,
                guardBot: 'GUARD3-ROLE',
                wasBlocked: false,
                fields: [
                    { name: 'Executor', value: `<@${executor.id}>`, inline: true },
                    { name: 'Bot', value: `<@${member.id}>`, inline: true }
                ]
            });

            logger.info(`Yetkili bot ekleme: ${executor.tag}`);
        }

    } catch (error) {
        logger.error('Bot add hatası: ' + error.message);
    }
});

client.login(tokens.GUARD3_TOKEN)
    .then(() => logger.info('Guard 3 bot giriş yapıyor...'))
    .catch(err => logger.error('Guard 3 login hatası: ' + err));
