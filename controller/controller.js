const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const Logger = require('../util/logger');
const { checkInactiveUsers, sendLog } = require('../util/functions');
const { setupVoiceAndDM } = require('../util/guardPresence');
const Whitelist = require('../models/whitelist');
const config = require('../config/config.json');
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

    const henzyGuild = client.guilds.cache.find(g => g.name === config.guildName && g.id === config.guildId);
    if (!henzyGuild) {
        logger.error('Henzy sunucusu bulunamadı! Guild ID ve ismi kontrol edin.');
        process.exit(1);
    }

    logger.info(`Henzy sunucusuna bağlanıldı: ${henzyGuild.name}`);

    setInterval(() => {
        checkInactiveUsers(henzyGuild);
    }, 24 * 60 * 60 * 1000);

    setTimeout(() => {
        checkInactiveUsers(henzyGuild);
    }, 5000);

    await setupVoiceAndDM(client, 'CONTROLLER', logger);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.guild.name !== config.guildName || message.guild.id !== config.guildId) return;

    if (message.content === '.setup') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Bu komutu kullanmak için yönetici yetkisine sahip olmalısınız!');
        }

        try {
            logger.info('Setup komutu çalıştırılıyor...');

            let category = message.guild.channels.cache.find(
                c => c.type === ChannelType.GuildCategory && c.name === config.logChannels.category
            );

            if (!category) {
                category = await message.guild.channels.create({
                    name: config.logChannels.category,
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
                config.logChannels.guardLogs,
                config.logChannels.messageLogs,
                config.logChannels.modLogs,
                config.logChannels.securityLogs,
                config.logChannels.roleLogs,
                config.logChannels.channelLogs
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
            color: 0x00ff00,
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
                    name: 'ℹ️ Bilgi',
                    value: '`.yardım` veya `.help` - Bu mesajı gösterir',
                    inline: false
                }
            ],
            footer: { text: 'Henzy Guard Framework v1.0' },
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
    if (!newPresence || newPresence.guild.name !== config.guildName || newPresence.guild.id !== config.guildId) return;

    const whitelistUser = await Whitelist.findOne({ userId: newPresence.userId });

    if (whitelistUser && newPresence.status !== 'offline') {
        if (whitelistUser.inSleepMode) {
            const member = await newPresence.guild.members.fetch(newPresence.userId);

            const sleepRole = newPresence.guild.roles.cache.find(r => r.name === config.sleepMode.sleepRoleName);
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
