// PM2 process config for the Booking Platform backend.
// Usage on the VM:  pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'booking-api',
      script: 'dist/main.js',
      instances: 1, // bump to 'max' for cluster mode once it's stable
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        // App reads PORT-related config from process.env / .env.
        // The .env file in the project root is loaded by @nestjs/config.
      },
    },
  ],
};
