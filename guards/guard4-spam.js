const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const Logger = require('../util/logger');
const { sendLog } = require('../util/functions');
const { setupVoiceAndDM } = require('../util/guardPresence');
const config = require('../config/config.json');
const dbConfig = require('../config/database.json');
const tokens = require('../config/tokens.json');

const logger = new Logger('GUARD4-SPAM');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

mongoose.connect(dbConfig.uri, dbConfig.options)
    .then(() => logger.success('MongoDB bağlantısı başarılı'))
    .catch(err => logger.error('MongoDB bağlantı hatası: ' + err));

const userMessageMap = new Map();

const urlRegex = /(https?:\/\/[^\s]+)/gi;
const discordInviteRegex = /(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/[a-zA-Z0-9]+/gi;

function containsDiscordInvite(content) {
    for (const pattern of config.spam.discordInvitePatterns) {
        if (content.toLowerCase().includes(pattern.toLowerCase())) {
            return true;
        }
    }
    return discordInviteRegex.test(content);
}

function containsURLShortener(content) {
    const urls = content.match(urlRegex);
    if (!urls) return false;

    for (const url of urls) {
        for (const shortener of config.spam.urlShorteners) {
            if (url.toLowerCase().includes(shortener)) {
                return true;
            }
        }
    }
    return false;
}

function containsSuspiciousKeywords(content) {
    for (const keyword of config.spam.suspiciousKeywords) {
        if (content.toLowerCase().includes(keyword.toLowerCase())) {
            return true;
        }
    }
    return false;
}

function isSpam(userId, content) {
    const now = Date.now();
    const userMessages = userMessageMap.get(userId) || [];

    const recentMessages = userMessages.filter(msg => now - msg.timestamp < 60000);
    recentMessages.push({ content, timestamp: now });

    userMessageMap.set(userId, recentMessages);

    if (recentMessages.length > config.spam.maxMessagesPerMinute) {
        return { isSpam: true, reason: 'Dakikada çok fazla mesaj' };
    }

    const sameContentCount = recentMessages.filter(msg => msg.content === content).length;
    if (sameContentCount >= 3) {
        return { isSpam: true, reason: 'Aynı mesajı 3+ kez tekrarladı' };
    }

    return { isSpam: false };
}

async function checkMessage(message, isEdit = false) {
    if (message.author.bot) return;
    if (message.guild.name !== config.guildName || message.guild.id !== config.guildId) return;
    if (message.member.permissions.has('Administrator')) return;

    const content = message.content;

    const hasDiscordInvite = containsDiscordInvite(content);
    const hasURLShortener = containsURLShortener(content);
    const hasSuspiciousKeyword = containsSuspiciousKeywords(content);
    const spamCheck = isSpam(message.author.id, content);

    if (hasDiscordInvite || hasURLShortener || hasSuspiciousKeyword || spamCheck.isSpam) {
        try {
            await message.delete();
            logger.warn(`Zararlı mesaj silindi: ${message.author.tag}`);

            let reason = '';
            let blockType = '';

            if (hasDiscordInvite) {
                reason = 'Discord davet linki tespit edildi';
                blockType = 'Discord Invite';
            } else if (hasURLShortener) {
                reason = 'URL kısaltıcı tespit edildi';
                blockType = 'URL Shortener';
            } else if (hasSuspiciousKeyword) {
                reason = 'Şüpheli kelime tespit edildi';
                blockType = 'Suspicious Keyword';
            } else if (spamCheck.isSpam) {
                reason = spamCheck.reason;
                blockType = 'Spam';
            }

            if (isEdit) {
                reason += ' (Mesaj düzenlenerek eklendi)';
            }

            await sendLog(client, 'spam', {
                title: '🚫 Zararlı Mesaj Engellendi',
                description: `${message.author.tag} zararlı içerik gönderdi!`,
                executor: message.author.id,
                action: isEdit ? 'MESSAGE_EDIT_SPAM_BLOCKED' : 'MESSAGE_SPAM_BLOCKED',
                target: message.channelId,
                guardBot: 'GUARD4-SPAM',
                wasBlocked: true,
                fields: [
                    { name: 'Kullanıcı', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Kanal', value: `<#${message.channelId}>`, inline: true },
                    { name: 'Sebep', value: reason, inline: false },
                    { name: 'Tür', value: blockType, inline: true },
                    { name: 'Mesaj İçeriği', value: content.substring(0, 100), inline: false }
                ],
                details: {
                    content: content,
                    isEdit: isEdit
                }
            });

            const warningMessage = await message.channel.send(
                `⚠️ <@${message.author.id}>, mesajınız **${reason}** sebebiyle silindi!`
            );

            setTimeout(() => {
                warningMessage.delete().catch(() => { });
            }, 5000);

            const userMessages = userMessageMap.get(message.author.id) || [];
            const violationsInLastHour = userMessages.filter(msg =>
                Date.now() - msg.timestamp < 3600000
            ).length;

            if (violationsInLastHour >= 5) {
                try {
                    await message.member.timeout(24 * 60 * 60 * 1000, 'Spam/Reklam - 5+ ihlal');
                    logger.success(`Kullanıcı 24 saat timeout aldı: ${message.author.tag}`);

                    await sendLog(client, 'spam', {
                        title: '⏰ Kullanıcı Timeout Aldı',
                        description: `${message.author.tag} spam/reklam sebebiyle 24 saat timeout aldı`,
                        executor: client.user.id,
                        action: 'AUTO_TIMEOUT',
                        target: message.author.id,
                        guardBot: 'GUARD4-SPAM',
                        wasBlocked: true,
                        fields: [
                            { name: 'Kullanıcı', value: `<@${message.author.id}>`, inline: true },
                            { name: 'İhlal Sayısı', value: violationsInLastHour.toString(), inline: true },
                            { name: 'Süre', value: '24 saat', inline: true }
                        ]
                    });
                } catch (error) {
                    logger.error(`Timeout hatası: ${error.message}`);
                }
            }

        } catch (error) {
            logger.error(`Mesaj silme hatası: ${error.message}`);
        }
    }
}

client.once('ready', async () => {
    logger.success(`Guard 4 (Spam & Ad Protection) aktif: ${client.user.tag}`);

    setInterval(() => {
        const now = Date.now();
        for (const [userId, messages] of userMessageMap.entries()) {
            const recentMessages = messages.filter(msg => now - msg.timestamp < 60000);
            if (recentMessages.length === 0) {
                userMessageMap.delete(userId);
            } else {
                userMessageMap.set(userId, recentMessages);
            }
        }
    }, 60000);

    await setupVoiceAndDM(client, 'GUARD4-SPAM', logger);
});

client.on('messageCreate', async (message) => {
    await checkMessage(message, false);
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (!newMessage.content) return;
    if (oldMessage.content === newMessage.content) return;

    await checkMessage(newMessage, true);
});

client.login(tokens.DIST_TOKEN)
    .then(() => logger.info('Guard 4 bot giriş yapıyor...'))
    .catch(err => logger.error('Guard 4 login hatası: ' + err));
