const { Client, GatewayIntentBits, Partials, PermissionFlagsBits, ChannelType, PresenceUpdateStatus } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Logger = require('../util/logger');
const { sendLog } = require('../util/functions');
const { setupVoiceAndDM } = require('../util/guardPresence');
const henzy = require('../config/config.json');
const { validateHenzySignature } = require('../util/signature');
validateHenzySignature(henzy, 'henzy');
const dbConfig = require('../config/database.json');
const tokens = require('../config/tokens.json');

const logger = new Logger('DIST-BACKUP');

let Bots = global.distBots = [];
let backupInterval;
let mainClient = null;

mongoose.connect(dbConfig.uri, dbConfig.options)
    .then(() => logger.success('MongoDB bağlantısı başarılı'))
    .catch(err => logger.error('MongoDB bağlantı hatası: ' + err));

tokens.DIST_TOKENS.forEach((token, index) => {
    const client = new Client({
        fetchAllMembers: true,
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildEmojisAndStickers,
            GatewayIntentBits.GuildIntegrations,
            GatewayIntentBits.GuildWebhooks,
            GatewayIntentBits.GuildInvites,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.MessageContent
        ],
        partials: [
            Partials.Channel,
            Partials.Message,
            Partials.User,
            Partials.GuildMember,
            Partials.Reaction
        ],
        presence: {
            status: "invisible"
        }
    });

    client.on('ready', async () => {
        Bots.push(client);
        logger.success(`DIST Bot ${index + 1} aktif: ${client.user.tag} (Invisible)`);

        await setupVoiceAndDM(client, `DIST-BACKUP-${index + 1}`, logger);

        setTimeout(() => {
            const guild = client.guilds.cache.get(henzy.guildId);
            if (guild && guild.members.me.voice.channel) {
                guild.members.me.voice.disconnect();
                logger.info(`DIST Bot ${index + 1} ses kanalından ayrıldı`);
            }
        }, 3000);

        if (index === 0) {
            mainClient = client;

            if (henzy.backup.enabled) {
                const intervalMs = henzy.backup.intervalMinutes * 60 * 1000;

                setTimeout(async () => {
                    await createBackup(client);

                    backupInterval = setInterval(async () => {
                        await createBackup(client);
                    }, intervalMs);
                }, 5000);

                logger.info(`Ana bot backup alıyor: ${henzy.backup.intervalMinutes} dakikada bir`);
            }

            client.on('messageCreate', handleBackupCommands);
        }
    });

    client.login(token).then(() => {
        logger.info(`DIST Bot ${index + 1} giriş yapıyor...`);
    }).catch(err => {
        logger.error(`DIST Bot ${index + 1} login hatası: ${err.message}`);
    });
});

async function createBackup(client) {
    try {
        const guild = await client.guilds.fetch(henzy.guildId);
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 8);
        const backupId = `backup_${timestamp}_${randomId}`;

        logger.info('Sunucu yedeği alınıyor...');

        const channels = await guild.channels.fetch();
        const channelsData = [];

        for (const [, channel] of channels) {
            const channelData = {
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                parentId: channel.parentId,
                permissionOverwrites: []
            };

            if (channel.topic) channelData.topic = channel.topic;
            if (channel.nsfw !== undefined) channelData.nsfw = channel.nsfw;
            if (channel.rateLimitPerUser) channelData.rateLimitPerUser = channel.rateLimitPerUser;
            if (channel.bitrate) channelData.bitrate = channel.bitrate;
            if (channel.userLimit) channelData.userLimit = channel.userLimit;

            channel.permissionOverwrites.cache.forEach(overwrite => {
                channelData.permissionOverwrites.push({
                    id: overwrite.id,
                    type: overwrite.type,
                    allow: overwrite.allow.bitfield.toString(),
                    deny: overwrite.deny.bitfield.toString()
                });
            });

            channelsData.push(channelData);
        }

        const roles = await guild.roles.fetch();
        const rolesData = [];

        roles.forEach(role => {
            if (role.id === guild.id) return;

            rolesData.push({
                id: role.id,
                name: role.name,
                color: role.color,
                hoist: role.hoist,
                position: role.position,
                permissions: role.permissions.bitfield.toString(),
                mentionable: role.mentionable
            });
        });

        const backupData = {
            backupId: backupId,
            timestamp: new Date().toISOString(),
            guildName: guild.name,
            guildId: guild.id,
            guildIcon: guild.iconURL(),
            guildBanner: guild.bannerURL(),
            channels: channelsData,
            roles: rolesData,
            settings: {
                verificationLevel: guild.verificationLevel,
                defaultMessageNotifications: guild.defaultMessageNotifications,
                explicitContentFilter: guild.explicitContentFilter
            }
        };

        const backupFolder = path.join(__dirname, '..', henzy.backup.backupFolder);
        if (!fs.existsSync(backupFolder)) {
            fs.mkdirSync(backupFolder, { recursive: true });
        }

        const backupFilePath = path.join(backupFolder, `${backupId}.json`);
        fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));

        const backupFiles = fs.readdirSync(backupFolder).filter(f => f.startsWith('backup_') && f.endsWith('.json'));
        if (backupFiles.length > henzy.backup.maxBackups) {
            backupFiles.sort();
            const filesToDelete = backupFiles.slice(0, backupFiles.length - henzy.backup.maxBackups);
            filesToDelete.forEach(file => {
                fs.unlinkSync(path.join(backupFolder, file));
                logger.info(`Eski yedek silindi: ${file}`);
            });
        }

        logger.success(`Yedek oluşturuldu: ${backupId}`);
        console.log(`\n🎉 [DIST-BACKUP] Yedek başarıyla oluşturuldu!`);
        console.log(`📦 Backup ID: ${backupId}`);
        console.log(`📁 Kanallar: ${channelsData.length} | 👥 Roller: ${rolesData.length}`);
        console.log(`💾 Dosya: ./backups/${backupId}.json\n`);

        await sendLog(client, 'backup', {
            title: '💾 Sunucu Yedeği Alındı',
            description: `Sunucu yedeği başarıyla oluşturuldu`,
            executor: null,
            action: 'BACKUP_CREATED',
            target: null,
            guardBot: 'DIST-BACKUP',
            wasBlocked: false,
            fields: [
                { name: 'Backup ID', value: `\`${backupId}\``, inline: false },
                { name: 'Tarih', value: new Date().toLocaleString('tr-TR'), inline: true },
                { name: 'Kanallar', value: `${channelsData.length}`, inline: true },
                { name: 'Roller', value: `${rolesData.length}`, inline: true },
                { name: 'Toplam Bot', value: `${Bots.length}`, inline: true }
            ]
        });

    } catch (error) {
        logger.error('Yedekleme hatası: ' + error.message);
        console.error(error.stack);
    }
}

async function loadBackup(guild, backupId, executorId) {
    try {
        const backupFolder = path.join(__dirname, '..', henzy.backup.backupFolder);
        const backupFilePath = path.join(backupFolder, `${backupId}.json`);

        if (!fs.existsSync(backupFilePath)) {
            logger.error(`Yedek bulunamadı: ${backupId}`);
            return false;
        }

        const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
        logger.info(`Yedek yükleniyor: ${backupId}`);

        await sendLog(mainClient, 'backup', {
            title: '⏳ Yedek Yükleniyor',
            description: `Yedek geri yükleme işlemi başlatıldı`,
            executor: executorId,
            action: 'BACKUP_RESTORE_STARTED',
            target: null,
            guardBot: 'DIST-BACKUP',
            wasBlocked: false,
            fields: [
                { name: 'Backup ID', value: `\`${backupId}\``, inline: false },
                { name: 'Yükleyen', value: `<@${executorId}>`, inline: true }
            ]
        });

        const roleMap = new Map();
        const botMember = guild.members.me;
        const botHighestRole = botMember.roles.highest;

        for (const roleData of backupData.roles) {
            const existingRole = guild.roles.cache.find(r => r.name === roleData.name);

            if (existingRole) {
                roleMap.set(roleData.id, existingRole.id);

                if (existingRole.position >= botHighestRole.position) {
                    logger.warn(`Rol düzenlenemedi (yetki yetersiz): ${roleData.name}`);
                    continue;
                }

                const editData = {
                    hoist: roleData.hoist,
                    permissions: roleData.permissions,
                    mentionable: roleData.mentionable
                };
                if (roleData.color !== undefined && roleData.color !== null) {
                    editData.color = roleData.color;
                }

                try {
                    await existingRole.edit(editData);
                    logger.info(`Rol güncellendi: ${roleData.name}`);
                } catch (err) {
                    logger.warn(`Rol güncellenemedi: ${roleData.name} - ${err.message}`);
                }
            } else {
                const createData = {
                    name: roleData.name,
                    hoist: roleData.hoist,
                    permissions: roleData.permissions,
                    mentionable: roleData.mentionable,
                    reason: `Henzy Guard: Yedekten geri yükleme`
                };
                if (roleData.color !== undefined && roleData.color !== null) {
                    createData.color = roleData.color;
                }

                try {
                    const newRole = await guild.roles.create(createData);
                    roleMap.set(roleData.id, newRole.id);
                    logger.success(`Rol oluşturuldu: ${roleData.name}`);
                } catch (err) {
                    logger.warn(`Rol oluşturulamadı: ${roleData.name} - ${err.message}`);
                }
            }
        }

        const categoryMap = new Map();
        const categoriesData = backupData.channels.filter(ch => ch.type === ChannelType.GuildCategory);

        for (const catData of categoriesData) {
            const existingCat = guild.channels.cache.find(c => c.name === catData.name && c.type === ChannelType.GuildCategory);

            if (existingCat) {
                categoryMap.set(catData.id, existingCat.id);
            } else {
                const newCat = await guild.channels.create({
                    name: catData.name,
                    type: ChannelType.GuildCategory,
                    reason: 'Henzy Guard: Yedekten geri yükleme'
                });
                categoryMap.set(catData.id, newCat.id);
                logger.success(`Kategori oluşturuldu: ${catData.name}`);
            }
        }

        const otherChannels = backupData.channels.filter(ch => ch.type !== ChannelType.GuildCategory);

        for (const chData of otherChannels) {
            const existingChannel = guild.channels.cache.find(c => c.name === chData.name && c.type === chData.type);

            const channelOptions = {
                name: chData.name,
                type: chData.type,
                parent: chData.parentId ? categoryMap.get(chData.parentId) : null,
                reason: 'Henzy Guard: Yedekten geri yükleme'
            };

            if (chData.topic) channelOptions.topic = chData.topic;
            if (chData.nsfw !== undefined) channelOptions.nsfw = chData.nsfw;
            if (chData.rateLimitPerUser) channelOptions.rateLimitPerUser = chData.rateLimitPerUser;
            if (chData.bitrate) channelOptions.bitrate = chData.bitrate;
            if (chData.userLimit) channelOptions.userLimit = chData.userLimit;

            if (!existingChannel) {
                const newChannel = await guild.channels.create(channelOptions);
                logger.success(`Kanal oluşturuldu: ${chData.name}`);

                for (const perm of chData.permissionOverwrites) {
                    const targetId = perm.type === 0 ? roleMap.get(perm.id) || perm.id : perm.id;
                    await newChannel.permissionOverwrites.create(targetId, {
                        allow: BigInt(perm.allow),
                        deny: BigInt(perm.deny)
                    });
                }
            }
        }

        logger.success('Yedek başarıyla yüklendi!');

        await sendLog(mainClient, 'backup', {
            title: '✅ Yedek Yüklendi',
            description: `Yedek başarıyla geri yüklendi`,
            executor: executorId,
            action: 'BACKUP_RESTORE_COMPLETED',
            target: null,
            guardBot: 'DIST-BACKUP',
            wasBlocked: false,
            fields: [
                { name: 'Backup ID', value: `\`${backupId}\``, inline: false },
                { name: 'Yükleyen', value: `<@${executorId}>`, inline: true },
                { name: 'Durum', value: 'Başarılı', inline: true }
            ]
        });

        return true;
    } catch (error) {
        logger.error('Yedek yükleme hatası: ' + error.message);
        console.error(error.stack);
        return false;
    }
}

async function handleBackupCommands(message) {
    if (message.author.bot) return;
    if (message.guild.name !== henzy.guildName || message.guild.id !== henzy.guildId) return;

    if (message.content.startsWith('.backup')) {
        const args = message.content.split(' ');
        const action = args[1];

        if (!action || action === 'al') {
            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply('❌ Bu komutu sadece yöneticiler kullanabilir!');
            }

            await message.reply('⏳ Manuel yedek alınıyor...');
            await createBackup(mainClient);
            message.reply('✅ Manuel yedek başarıyla oluşturuldu!');
        }

        if (action === 'liste' || action === 'list') {
            const backupFolder = path.join(__dirname, '..', henzy.backup.backupFolder);

            if (!fs.existsSync(backupFolder)) {
                return message.reply('❌ Henüz yedek alınmamış!');
            }

            const backupFiles = fs.readdirSync(backupFolder)
                .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
                .sort()
                .reverse();

            if (backupFiles.length === 0) {
                return message.reply('❌ Henüz yedek alınmamış!');
            }

            const page = parseInt(args[2]) || 1;
            const perPage = 10;
            const totalPages = Math.ceil(backupFiles.length / perPage);

            if (page < 1 || page > totalPages) {
                return message.reply(`❌ Geçersiz sayfa! Toplam ${totalPages} sayfa var. Kullanım: \`.backup liste <sayfa>\``);
            }

            const startIndex = (page - 1) * perPage;
            const endIndex = startIndex + perPage;
            const backupsToShow = backupFiles.slice(startIndex, endIndex);

            const backupList = backupsToShow.map((file, i) => {
                const backupId = file.replace('.json', '');
                const data = JSON.parse(fs.readFileSync(path.join(backupFolder, file), 'utf8'));
                const date = new Date(data.timestamp).toLocaleString('tr-TR');
                return `**${startIndex + i + 1}.** \`\`\`${backupId}\`\`\`📅 ${date} | 📁 ${data.channels.length} kanal | 👥 ${data.roles.length} rol`;
            }).join('\n\n');

            message.reply({
                embeds: [{
                    title: '💾 Sunucu Yedekleri',
                    description: backupList,
                    color: 0x00ff00,
                    footer: { text: `Sayfa ${page}/${totalPages} | Toplam ${backupFiles.length} yedek | Kullanım: .backup liste <sayfa>` }
                }]
            });
        }

        if (action === 'yükle' || action === 'load') {
            if (message.guild.ownerId !== message.author.id) {
                return message.reply('❌ Bu komutu sadece sunucu sahibi kullanabilir!');
            }

            const backupId = args[2];
            if (!backupId) {
                return message.reply('❌ Backup ID belirtmelisiniz! Kullanım: `.backup yükle <backup-id>`');
            }

            await message.reply('⏳ Yedek yükleniyor... Bu işlem birkaç dakika sürebilir.');
            const success = await loadBackup(message.guild, backupId, message.author.id);

            if (success) {
                message.reply('✅ Yedek başarıyla yüklendi!');
            } else {
                message.reply('❌ Yedek yüklenirken bir hata oluştu!');
            }
        }

        if (action === 'sil' || action === 'delete') {
            if (message.guild.ownerId !== message.author.id) {
                return message.reply('❌ Bu komutu sadece sunucu sahibi kullanabilir!');
            }

            const backupId = args[2];
            if (!backupId) {
                return message.reply('❌ Backup ID belirtmelisiniz! Kullanım: `.backup sil <backup-id>`');
            }

            const backupFolder = path.join(__dirname, '..', henzy.backup.backupFolder);
            const backupFilePath = path.join(backupFolder, `${backupId}.json`);

            if (!fs.existsSync(backupFilePath)) {
                return message.reply('❌ Bu ID ile yedek bulunamadı!');
            }

            fs.unlinkSync(backupFilePath);
            logger.info(`Yedek silindi: ${backupId}`);

            await sendLog(mainClient, 'backup', {
                title: '🗑️ Yedek Silindi',
                description: `Bir yedek dosyası silindi`,
                executor: message.author.id,
                action: 'BACKUP_DELETED',
                target: null,
                guardBot: 'DIST-BACKUP',
                wasBlocked: false,
                fields: [
                    { name: 'Backup ID', value: `\`${backupId}\``, inline: false },
                    { name: 'Silen', value: `<@${message.author.id}>`, inline: true }
                ]
            });

            message.reply(`✅ Yedek silindi: \`${backupId}\``);
        }
    }
}

module.exports = Bots;
