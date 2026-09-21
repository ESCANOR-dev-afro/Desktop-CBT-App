const db = require('../database');

setTimeout(async () => {
    try {
        console.log('🔄 Triggering database startup cleanup and check...');
        require('./direct_verify_all');
    } catch (err) {
        console.error('Error in startup cleanup script:', err);
        process.exit(1);
    }
}, 1500);
