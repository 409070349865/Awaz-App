'use strict';

const mongoose = require('mongoose');
const config = require('./config');
const { logger } = require('../utils/logger');

const connectDB = async () => {
  if (!config.mongoUri) {
    logger.warn('[MongoDB] MONGO_URI is not set; cloud history is disabled.');
    return false;
  }
  try {
    const conn = await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5_000 });
    logger.info(`[MongoDB] Connected: ${conn.connection.host}`);
    return true;
  } catch (err) {
    logger.error(`[MongoDB] Connection unavailable; translation can still run. ${err.message}`);
    return false;
  }
};

module.exports = connectDB;
