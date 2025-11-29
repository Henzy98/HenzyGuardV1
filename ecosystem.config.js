module.exports = {
    apps: [
        {
            name: 'henzy-controller',
            script: './controller/controller.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '500M',
            error_file: './pm2-logs/controller-error.log',
            out_file: './pm2-logs/controller-out.log',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'henzy-guard1-ban',
            script: './guards/guard1-ban.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            error_file: './pm2-logs/guard1-error.log',
            out_file: './pm2-logs/guard1-out.log',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'henzy-guard2-channel',
            script: './guards/guard2-channel.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            error_file: './pm2-logs/guard2-error.log',
            out_file: './pm2-logs/guard2-out.log',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'henzy-guard3-role',
            script: './guards/guard3-role.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            error_file: './pm2-logs/guard3-error.log',
            out_file: './pm2-logs/guard3-out.log',
            env: {
                NODE_ENV: 'production'
            }
        },
        {
            name: 'henzy-dist',
            script: './guards/dist-backup.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '300M',
            error_file: './pm2-logs/dist-error.log',
            out_file: './pm2-logs/dist-out.log',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
