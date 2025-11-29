const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const Logger = require('../util/logger');
const { sendLog, updateLastSeen } = require('../util/functions');
const { setupVoiceAndDM } = require('../util/guardPresence');
const Whitelist = require('../models/whitelist');
const henzy = require('../config/config.json');
const { validateHenzySignature } = require('../util/signature');
validateHenzySignature(henzy, 'henzy');
const dbConfig = require('../config/database.json');
const tokens = require('../config/tokens.json');

const logger = new Logger('CONTROLLER');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ]
});

mongoose.connect(dbConfig.uri, dbConfig.options)
    .then(() => logger.success('MongoDB bağlantısı başarılı'))
    .catch(err => logger.error('MongoDB bağlantı hatası: ' + err));

client.once('ready', async () => {
    logger.success(`Controller bot aktif: ${client.user.tag}`);

    const henzyGuild = client.guilds.cache.find(g => g.name === henzy.guildName && g.id === henzy.guildId);
    if (!henzyGuild) {
        logger.error('Henzy sunucusu bulunamadı! Guild ID ve ismi kontrol edin.');
        process.exit(1);
    }

    logger.info(`Henzy sunucusuna bağlanıldı: ${henzyGuild.name}`);
    await setupVoiceAndDM(client, 'CONTROLLER', logger);
});

client.on('presenceUpdate', async (oldPresence, newPresence) => {
    if (!newPresence || newPresence.guild.id !== henzy.guildId) return;

    try {
        const userId = newPresence.userId;
        await updateLastSeen(userId);

        const whitelistEntry = await Whitelist.findOne({ userId, isActive: true });
        if (!whitelistEntry) return;

        const member = await newPresence.guild.members.fetch(userId);
        const newStatus = newPresence.status;

        if (newStatus === 'offline' && !whitelistEntry.inSleepMode) {
            const botMember = newPresence.guild.members.me;
            const botHighestRole = botMember.roles.highest;
            const memberHighestRole = member.roles.highest;

            if (memberHighestRole.position >= botHighestRole.position) {
                logger.warn(`Uyku modu atlanamadı: ${member.user.tag} - Bot yetkisi yetersiz`);
                return;
            }

            const currentRoles = member.roles.cache
                .filter(role => role.id !== newPresence.guild.id)
                .map(role => role.id);

            await Whitelist.findOneAndUpdate(
                { userId },
                {
                    savedRoles: currentRoles,
                    inSleepMode: true
                }
            );

            let sleepRole = newPresence.guild.roles.cache.find(r => r.name === henzy.sleepMode.sleepRoleName);
            if (!sleepRole) {
                sleepRole = await newPresence.guild.roles.create({
                    name: henzy.sleepMode.sleepRoleName,
                    color: '#808080',
                    reason: 'Uyku modu rolü'
                });
            }

            await member.roles.set([sleepRole.id]);

            logger.info(`${member.user.tag} offline oldu - Uyku moduna alındı`);

            await sendLog(client, 'security', {
                title: '😴 Uyku Modu Aktif',
                description: `Whitelist kullanıcısı offline oldu`,
                executor: userId,
                action: 'SLEEP_MODE_ACTIVATED_OFFLINE',
                target: userId,
                guardBot: 'CONTROLLER',
                wasBlocked: false,
                fields: [
                    { name: 'Kullanıcı', value: `<@${userId}>`, inline: true },
                    { name: 'Kaydedilen Roller', value: `${currentRoles.length} rol`, inline: true }
                ]
            });

        } else if (newStatus !== 'offline' && whitelistEntry.inSleepMode) {
            const rolesToRestore = whitelistEntry.savedRoles.filter(roleId => {
                return newPresence.guild.roles.cache.has(roleId);
            });

            if (rolesToRestore.length > 0) {
                await member.roles.add(rolesToRestore);
                logger.success(`${member.user.tag} online oldu - Rolleri geri yüklendi (${rolesToRestore.length} rol)`);
            }

            await Whitelist.findOneAndUpdate(
                { userId },
                {
                    inSleepMode: false,
                    savedRoles: []
                }
            );

            logger.info(`Kullanıcı uyku modundan çıkarıldı: ${userId}`);

            await sendLog(client, 'security', {
                title: '🎉 Uyku Modundan Çıkıldı',
                description: `Whitelist kullanıcısı online oldu, rolleri geri yüklendi`,
                executor: userId,
                action: 'SLEEP_MODE_DEACTIVATED_ONLINE',
                target: userId,
                guardBot: 'CONTROLLER',
                wasBlocked: false,
                fields: [
                    { name: 'Kullanıcı', value: `<@${userId}>`, inline: true },
                    { name: 'Geri Yüklenen Roller', value: `${rolesToRestore.length} rol`, inline: true }
                ]
            });
        }

    } catch (error) {
        logger.error('Presence update hatası: ' + error.message);
    }
});

client.on('guildMemberRemove', async (member) => {
    if (member.guild.id !== henzy.guildId) return;

    try {
        const whitelistEntry = await Whitelist.findOne({ userId: member.id, isActive: true });

        if (!whitelistEntry) return;

        const currentRoles = member.roles.cache
            .filter(role => role.id !== member.guild.id)
            .map(role => role.id);

        await Whitelist.findOneAndUpdate(
            { userId: member.id },
            {
                savedRoles: currentRoles,
                inSleepMode: true
            }
        );

        logger.info(`Whitelist kullanıcısı sunucudan ayrıldı, uyku moduna alındı: ${member.user.tag}`);

        await sendLog(client, 'security', {
            title: '😴 Uyku Modu Aktif',
            description: `Whitelist kullanıcısı sunucudan ayrıldı`,
            executor: member.id,
            action: 'SLEEP_MODE_ACTIVATED_LEAVE',
            target: member.id,
            guardBot: 'CONTROLLER',
            wasBlocked: false,
            fields: [
                { name: 'Kullanıcı', value: `<@${member.id}>`, inline: true },
                { name: 'Kaydedilen Roller', value: `${currentRoles.length} rol`, inline: true }
            ]
        });

    } catch (error) {
        logger.error('GuildMemberRemove hatası: ' + error.message);
    }
});

client.on('guildMemberAdd', async (member) => {
    if (member.guild.id !== henzy.guildId) return;

    try {
        const whitelistEntry = await Whitelist.findOne({ userId: member.id, isActive: true, inSleepMode: true });

        if (!whitelistEntry || !whitelistEntry.savedRoles || whitelistEntry.savedRoles.length === 0) return;

        const rolesToRestore = whitelistEntry.savedRoles.filter(roleId => {
            return member.guild.roles.cache.has(roleId);
        });

        if (rolesToRestore.length > 0) {
            await member.roles.add(rolesToRestore);
            logger.success(`Kullanıcının rolleri geri yüklendi: ${member.user.tag} (${rolesToRestore.length} rol)`);
        }

        await Whitelist.findOneAndUpdate(
            { userId: member.id },
            {
                inSleepMode: false,
                savedRoles: []
            }
        );

        await sendLog(client, 'security', {
            title: '🎉 Uyku Modundan Çıkıldı',
            description: `Whitelist kullanıcısı geri döndü, rolleri geri yüklendi`,
            executor: member.id,
            action: 'SLEEP_MODE_DEACTIVATED_REJOIN',
            target: member.id,
            guardBot: 'CONTROLLER',
            wasBlocked: false,
            fields: [
                { name: 'Kullanıcı', value: `<@${member.id}>`, inline: true },
                { name: 'Geri Yüklenen Roller', value: `${rolesToRestore.length} rol`, inline: true }
            ]
        });

    } catch (error) {
        logger.error('GuildMemberAdd hatası: ' + error.message);
    }
});


client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.guild.name !== henzy.guildName || message.guild.id !== henzy.guildId) return;

    if (message.content === '.setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Bu komutu kullanmak için yönetici yetkisine sahip olmalısınız!');
        }

        try {
            logger.info('Setup komutu çalıştırılıyor...');

            let category = message.guild.channels.cache.find(
                c => c.type === ChannelType.GuildCategory && c.name === henzy.logChannels.category
            );

            if (!category) {
                category = await message.guild.channels.create({
                    name: henzy.logChannels.category,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        {
                            id: message.guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        }
                    ]
                });
                logger.success(`Kategori oluşturuldu: ${category.name}`);
            } else {
                logger.info(`Kategori zaten mevcut: ${category.name}`);
            }

            const channelNames = [
                henzy.logChannels.guardLogs,
                henzy.logChannels.messageLogs,
                henzy.logChannels.modLogs,
                henzy.logChannels.securityLogs,
                henzy.logChannels.roleLogs,
                henzy.logChannels.channelLogs,
                henzy.backup.backupLogChannel
            ];

            for (const channelName of channelNames) {
                let channel = message.guild.channels.cache.find(
                    c => c.name === channelName && c.parentId === category.id
                );

                if (!channel) {
                    channel = await message.guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        parent: category.id,
                        permissionOverwrites: [
                            {
                                id: message.guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: client.user.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                            }
                        ]
                    });
                    logger.success(`Kanal oluşturuldu: ${channelName}`);
                } else {
                    logger.info(`Kanal zaten mevcut: ${channelName}`);
                }
            }

            await message.reply('✅ Log sistemi başarıyla kuruldu!');
            logger.success('Setup tamamlandı!');

        } catch (error) {
            logger.error('Setup hatası: ' + error.message);
            await message.reply('❌ Setup sırasında bir hata oluştu!');
        }
    }

    if (message.content === '.yardım' || message.content === '.help') {
        const embed = {
            color: 0x2ecc71,
            title: '📋 Henzy Guard - Komut Listesi',
            description: 'Tüm mevcut komutlar:',
            fields: [
                {
                    name: '⚙️ Kurulum',
                    value: '`.setup` - Log kanallarını oluşturur (Admin)',
                    inline: false
                },
                {
                    name: '👥 Whitelist Yönetimi',
                    value: '`.whitelist ekle @kullanıcı` - Whitelist\'e ekler (Owner/Admin)\n' +
                        '`.whitelist sil @kullanıcı` - Whitelist\'ten çıkarır (Owner/Admin)\n' +
                        '`.whitelist liste` - Tüm whitelist kullanıcılarını gösterir (Admin)',
                    inline: false
                },
                {
                    name: '🔨 Ceza Sistemi',
                    value: '`.ceza` - Mevcut ceza türünü gösterir (Admin)\n' +
                        '`.ceza karantina` - Karantina moduna geçer (Admin)\n' +
                        '`.ceza kick` - Kick moduna geçer (Admin)\n' +
                        '`.ceza ban` - Ban moduna geçer (Admin)',
                    inline: false
                },
                {
                    name: '🔓 Karantina Yönetimi',
                    value: '`.karantinaçöz @kullanıcı` - Karantinayı kaldırır (Sadece Owner)',
                    inline: false
                },
                {
                    name: '💾 Backup Yönetimi',
                    value: '`.backup` veya `.backup al` - Manuel yedek alır (Admin)\n' +
                        '`.backup liste` - Tüm yedekleri listeler (Admin)\n' +
                        '`.backup yükle <backup_id>` - Yedeği yükler (Owner)',
                    inline: false
                },
                {
                    name: 'ℹ️ Bilgi',
                    value: '`.yardım` veya `.help` - Bu mesajı gösterir',
                    inline: false
                }
            ],
            footer: { text: 'Henzy Guard Framework v1.1.0 - bugün saat 19:15' },
            timestamp: new Date()
        };

        message.reply({ embeds: [embed] });
    }

    if (message.content.startsWith('.karantinaçöz ') || message.content.startsWith('.unquarantine ')) {
        if (message.guild.ownerId !== message.author.id) {
            return message.reply('❌ Bu komutu sadece sunucu sahibi kullanabilir!');
        }

        const mentionedUser = message.mentions.users.first();
        if (!mentionedUser) {
            return message.reply('❌ Bir kullanıcı etiketlemelisin! Kullanım: `.karantinaçöz @kullanıcı`');
        }

        try {
            const member = await message.guild.members.fetch(mentionedUser.id);
            const quarantineRole = message.guild.roles.cache.find(r => r.name === config.punishment.quarantineRoleName);

            if (!quarantineRole) {
                return message.reply('❌ Karantina rolü bulunamadı!');
            }

            if (!member.roles.cache.has(quarantineRole.id)) {
                return message.reply('❌ Bu kullanıcı zaten karantinada değil!');
            }

            await member.roles.remove(quarantineRole, `Owner tarafından karantina kaldırıldı: ${message.author.tag}`);

            await sendLog(client, 'security', {
                title: '🔓 Karantina Kaldırıldı',
                description: `${message.author.tag} bir kullanıcının karantinasını kaldırdı`,
                executor: message.author.id,
                action: 'QUARANTINE_REMOVED',
                target: mentionedUser.id,
                guardBot: 'CONTROLLER',
                wasBlocked: false,
                fields: [
                    { name: 'Owner', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Kullanıcı', value: `<@${mentionedUser.id}>`, inline: true }
                ]
            });

            message.reply(`✅ ${mentionedUser.tag} kullanıcısının karantinası kaldırıldı!`);
            logger.success(`Karantina kaldırıldı: ${mentionedUser.tag} (Owner: ${message.author.tag})`);

        } catch (error) {
            logger.error('Karantina kaldırma hatası: ' + error.message);
            message.reply('❌ Karantina kaldırılırken bir hata oluştu!');
        }
    }

    if (message.content === '.ceza') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Bu komutu sadece yöneticiler kullanabilir!');
        }

        const fs = require('fs');
        const currentType = config.punishment.type;
        const typeNames = {
            quarantine: 'Karantina',
            kick: 'Kick',
            ban: 'Ban'
        };

        message.reply({
            embeds: [{
                title: '⚙️ Ceza Sistemi Ayarları',
                description: `**Mevcut Ceza Türü:** ${typeNames[currentType]}`,
                color: 0x00ff00,
                fields: [
                    {
                        name: 'Değiştirmek için:',
                        value: '`.ceza karantina` - Kullanıcıyı karantinaya alır\n`.ceza kick` - Kullanıcıyı sunucudan atar\n`.ceza ban` - Kullanıcıyı yasaklar',
                        inline: false
                    }
                ]
            }]
        });
    }

    if (message.content.startsWith('.ceza ')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Bu komutu sadece yöneticiler kullanabilir!');
        }

        const args = message.content.split(' ');
        const type = args[1]?.toLowerCase();

        if (!['karantina', 'kick', 'ban'].includes(type)) {
            return message.reply('❌ Geçersiz ceza türü! Kullanım: `.ceza karantina/kick/ban`');
        }

        const fs = require('fs');
        const typeMap = {
            karantina: 'quarantine',
            kick: 'kick',
            ban: 'ban'
        };

        config.punishment.type = typeMap[type];

        fs.writeFileSync(
            './config/config.json',
            JSON.stringify(config, null, 4),
            'utf-8'
        );

        await sendLog(client, 'security', {
            title: '⚙️ Ceza Sistemi Güncellendi',
            description: `Ceza türü **${type}** olarak değiştirildi`,
            executor: message.author.id,
            action: 'PUNISHMENT_TYPE_CHANGED',
            target: null,
            guardBot: 'CONTROLLER',
            wasBlocked: false,
            fields: [
                { name: 'Değiştiren', value: `<@${message.author.id}>`, inline: true },
                { name: 'Yeni Ceza Türü', value: type.toUpperCase(), inline: true }
            ]
        });

        message.reply(`✅ Ceza türü **${type}** olarak güncellendi!`);
        logger.success(`Ceza türü değiştirildi: ${type}`);
    }

    if (message.content.startsWith('.whitelist')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator) &&
            message.guild.ownerId !== message.author.id) {
            return message.reply('❌ Bu komutu sadece sunucu sahibi veya yöneticiler kullanabilir!');
        }

        const args = message.content.split(' ');
        const action = args[1];

        if (action === 'ekle' || action === 'add') {
            const userId = args[2]?.replace(/[<@!>]/g, '');
            if (!userId) return message.reply('❌ Kullanıcı ID belirtmelisiniz!');

            const existing = await Whitelist.findOne({ userId });
            if (existing) return message.reply('❌ Bu kullanıcı zaten whitelist\'te!');

            await Whitelist.create({
                userId,
                addedBy: message.author.id,
                isActive: true
            });

            await sendLog(client, 'security', {
                title: '✅ Whitelist Eklendi',
                description: `<@${userId}> whitelist'e eklendi`,
                executor: message.author.id,
                action: 'WHITELIST_ADD',
                target: userId,
                guardBot: 'CONTROLLER',
                fields: [
                    { name: 'Ekleyen', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Eklenen', value: `<@${userId}>`, inline: true }
                ]
            });

            message.reply('✅ Kullanıcı whitelist\'e eklendi!');
            logger.success(`Whitelist eklendi: ${userId}`);
        }

        if (action === 'sil' || action === 'remove') {
            const userId = args[2]?.replace(/[<@!>]/g, '');
            if (!userId) return message.reply('❌ Kullanıcı ID belirtmelisiniz!');

            const result = await Whitelist.findOneAndDelete({ userId });
            if (!result) return message.reply('❌ Bu kullanıcı whitelist\'te değil!');

            await sendLog(client, 'security', {
                title: '❌ Whitelist Silindi',
                description: `<@${userId}> whitelist\'ten çıkarıldı`,
                executor: message.author.id,
                action: 'WHITELIST_REMOVE',
                target: userId,
                guardBot: 'CONTROLLER',
                fields: [
                    { name: 'Silen', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Silinen', value: `<@${userId}>`, inline: true }
                ]
            });

            message.reply('✅ Kullanıcı whitelist\'ten çıkarıldı!');
            logger.success(`Whitelist silindi: ${userId}`);
        }

        if (action === 'liste' || action === 'list') {
            const whitelistUsers = await Whitelist.find({ isActive: true });

            if (whitelistUsers.length === 0) {
                return message.reply('❌ Whitelist boş!');
            }

            const userList = whitelistUsers.map((u, i) =>
                `${i + 1}. <@${u.userId}> - ${u.inSleepMode ? '💤 Uyku Modunda' : '✅ Aktif'}`
            ).join('\n');

            message.reply({
                embeds: [{
                    title: '📋 Whitelist Kullanıcıları',
                    description: userList,
                    color: 0x00ff00,
                    footer: { text: `Toplam: ${whitelistUsers.length}` }
                }]
            });
        }
    }
});

client.on('presenceUpdate', async (oldPresence, newPresence) => {
    if (!newPresence || newPresence.guild.name !== henzy.guildName || newPresence.guild.id !== henzy.guildId) return;

    const whitelistUser = await Whitelist.findOne({ userId: newPresence.userId });

    if (whitelistUser && newPresence.status !== 'offline') {
        if (whitelistUser.inSleepMode) {
            const member = await newPresence.guild.members.fetch(newPresence.userId);

            const sleepRole = newPresence.guild.roles.cache.find(r => r.name === henzy.sleepMode.sleepRoleName);
            if (sleepRole) {
                await member.roles.remove(sleepRole);
            }

            if (whitelistUser.savedRoles.length > 0) {
                await member.roles.add(whitelistUser.savedRoles);
            }

            await Whitelist.findOneAndUpdate(
                { userId: newPresence.userId },
                {
                    inSleepMode: false,
                    savedRoles: [],
                    lastSeen: new Date()
                }
            );

            logger.info(`Kullanıcı uyku modundan çıkarıldı: ${newPresence.userId}`);
        } else {
            await Whitelist.findOneAndUpdate(
                { userId: newPresence.userId },
                { lastSeen: new Date() }
            );
        }
    }
});

client.login(tokens.CONTROLLER_TOKEN)
    .then(() => logger.info('Controller bot giriş yapıyor...'))
    .catch(err => logger.error('Controller login hatası: ' + err));
