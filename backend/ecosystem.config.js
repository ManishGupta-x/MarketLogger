module.exports = {
  apps: [{
    name: 'marketlogger',
    script: 'app.js',
    cwd: __dirname,
    watch: false,
    env: { NODE_ENV: 'production' },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    max_memory_restart: '500M'
  }]
};
