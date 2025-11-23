const config = require('../config/config.json');

async function setupVoiceAndDM(client, guardName, logger) {
    if (config.voiceChannel.enabled && config.voiceChannel.channelId !== 'SES_KANAL_ID_BURAYA') {
        try {
            const { joinVoiceChannel } = require('@discordjs/voice');
            const guild = await client.guilds.fetch(config.guildId);
            const voiceChannel = await guild.channels.fetch(config.voiceChannel.channelId);

            if (voiceChannel) {
                joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: false,
                    selfMute: false
                });
                logger.success(`Ses kanalına bağlanıldı: ${voiceChannel.name}`);
            }
        } catch (error) {
            logger.error('Ses kanalı bağlantı hatası: ' + error.message);
        }
    }
}

module.exports = { setupVoiceAndDM };
