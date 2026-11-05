if (require.main === module) {
    console.error('minimal-server.js is a retired demo and cannot process real payments. Do not use it in production.');
    process.exitCode = 1;
}
