require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
module.exports = require('../server/app');
