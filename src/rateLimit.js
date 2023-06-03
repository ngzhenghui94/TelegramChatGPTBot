import dotenv from "dotenv";
import Redis from "ioredis";
import TelegramBot from "node-telegram-bot-api";
import moment from "moment-timezone"
dotenv.config();
moment.tz.setDefault("Asia/Singapore");

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client
const logger = new TelegramBot(process.env.LOGAPIKEY);
const telegramAdminId = parseInt(process.env.ADMINID);
const whitelist = process.env.WHITELIST
const blacklist = process.env.BLACKLIST

// Enabled during development to reset Redis database
// redis.flushdb((err, result) => {
//     if (err) {
//         console.error(err);
//         return;
//     }
//     console.log("Redis database has been reset");
// });

// Helper function to get user request info from Redis
const getUserRequestInfo = async (userId) => {
    let requestInfo = await redis.get(`user: ${userId}`);
    if (requestInfo) {
        requestInfo = JSON.parse(requestInfo);
    } else {
        requestInfo = { count: 0 };
    }
    return requestInfo;
};

function isUserIdInWhitelist(userId) {
    return whitelist.split(',').includes(userId.toString());
}

function isUserIdInBlacklist(userId) {
    return blacklist.split(',').includes(userId.toString());
}

export const addUserToSubscription = async (userId) => {
    try {
        console.log("Adding User to Sub" + userId)
        const requestInfo = await getUserRequestInfo(userId);
        requestInfo.isSubscriber = true;
        requestInfo.subscriptionDate = Date.now();
        console.log(JSON.stringify(requestInfo))
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return
    } catch (err) {
        console.log(err)
    }

}

// Rate limit function using redis
export const rateLimit = async (msg) => {
    const userId = msg.chat.id
    const rateLimitRequests = 5;
    const timeWindow = 10 * 60 * 1000; // 10 minute in milliseconds
    const twentyfourhour = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const threeSeconds = 3 * 1000; // 3 seconds in milliseconds
    const requestInfo = await getUserRequestInfo(userId);

    // Whitelist check
    if (isUserIdInWhitelist(userId)) {
        await logger.sendMessage(telegramAdminId, `Whitelisted: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
        requestInfo.count = 0;
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return false;
    }
    // Blacklist Check
    if (isUserIdInBlacklist(userId)) {
        await logger.sendMessage(telegramAdminId, `Blacklisted: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
        requestInfo.count = 99;
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return true;
    }

    // Check if user is a subscriber and time
    if (requestInfo.isSubscriber == true) {
        const elapsedTime = Date.now() - requestInfo.subscriptionDate;
        if (elapsedTime < twentyfourhour) {
            await logger.sendMessage(telegramAdminId, `Subscriber: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
            requestInfo.isSubscriber = false
            requestInfo.count = 0;
            requestInfo.blockTime = null;
            await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
            return false;
        } else {
            await logger.sendMessage(telegramAdminId, `Subscriber expired: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
            requestInfo.count = 0;
            requestInfo.isSubscriber = false
            requestInfo.subscriptionDate = null;
            await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        }
    }

    // Normal rate limiting check
    await logger.sendMessage(telegramAdminId, `${userId}:${JSON.stringify(requestInfo)}`);
    if (requestInfo.count < rateLimitRequests) {
        requestInfo.count += 1;
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return false;
    }

    // Rate limit exceeded, look for block time
    if (requestInfo.blockTime) {
        const elapsedTime = Date.now() - requestInfo.blockTime;
        console.log(elapsedTime)
        if (elapsedTime < timeWindow) {
            let timeLeft = (timeWindow - elapsedTime) / 60000;
            await logger.sendMessage(telegramAdminId, `Rate Limit Tracker: ${userId} - ${timeLeft.toFixed(2)} mins`);
            return true;
        }
        // Time window elapsed, reset count and clear block state
        requestInfo.blockTime = null;
        requestInfo.count = 1;
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return false;
    }

    // No block time set, set block time and return false
    requestInfo.blockTime = Date.now();
    await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
    return false;
}


// Rate limit function using redis
export const removeFromRedisCache = async (userId) => {
    await redis.del(`user: ${userId}`);
    return;
}


