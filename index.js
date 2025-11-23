const mongoose = require('mongoose');
const Logger = require('./util/logger');
const dbConfig = require('./config/database.json');

const logger = new Logger('MAIN');

mongoose.connect(dbConfig.uri, dbConfig.options)
    .then(() => {
        logger.success('MongoDB bağlantısı başarılı');
        logger.info('Henzy Guard Framework hazır!');
        logger.info('Botları başlatmak için: npm run pm2:start');
    })
    .catch(err => {
        logger.error('MongoDB bağlantı hatası: ' + err);
        process.exit(1);
    });

process.on('SIGINT', async () => {
    logger.warn('Shutdown sinyali alındı...');
    await mongoose.connection.close();
    logger.info('MongoDB bağlantısı kapatıldı');
    process.exit(0);
});
