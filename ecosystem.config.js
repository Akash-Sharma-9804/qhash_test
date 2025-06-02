module.exports = {
  apps: [{
    name: 'server',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    node_args: [
      '--max-old-space-size=8192',
      '--expose-gc'
    ],
    env: {
      NODE_ENV: 'production',
      UV_THREADPOOL_SIZE: 4
    },
    max_memory_restart: '6G'
  }]
};
