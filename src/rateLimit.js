import dotenv from "dotenv";
import Redis from "ioredis";
import TelegramBot from "node-telegram-bot-api";
import moment from "moment-timezone"
import { getUserRequestInfo, getUsersnameFromMsg } from "./userInfo.js";
dotenv.config();
moment.tz.setDefault("Asia/Singapore");

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client
const logger = new TelegramBot(process.env.LOGAPIKEY);
const telegramAdminId = parseInt(process.env.ADMINID);
const whitelist = process.env.WHITELIST
const blacklist = process.env.BLACKLIST

function isUserIdInWhitelist(userId) {
    return whitelist.split(',').includes(userId.toString());
}

function isUserIdInBlacklist(userId) {
    return blacklist.split(',').includes(userId.toString());
}

// UserInfo object (requestInfo)
// requestInfo.count
// requestInfo.isSubscriber
// requestInfo.subscriptionDate
// requestInfo.subscriptionEndDate
// requestInfo.subscriptionPackage
// requestInfo.blockTime
// requestInfo.lastRequestTime

// Rate limit function using redis
export const rateLimit = async (msg) => {
    const userId = msg.from.id
    const rateLimitRequests = 5;
    const timeWindow = 1200000 // 20 * 60 * 1000; // 20 minute in milliseconds
    const monthhour = 2592000000 // 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const yearhour = 31104000000 // 12 * 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const requestInfo = await getUserRequestInfo(userId);

    // Whitelist check
    if (isUserIdInWhitelist(userId)) {
        await logger.sendMessage(telegramAdminId, `Whitelisted: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
        requestInfo.count = 0;
        requestInfo.isWhitelisted = true;
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return false;
    }
    // Blacklist Check
    if (isUserIdInBlacklist(userId)) {
        await logger.sendMessage(telegramAdminId, `Blacklisted: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
        requestInfo.count = 99;
        requestInfo.isBlacklisted = true;
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return true;
    }

    // Check if user is a subscriber and time
    if (requestInfo.isSubscriber == true) {
        const elapsedTime = Date.now() - requestInfo.subscriptionDate;
        console.log(elapsedTime + " : " + monthhour)
        if (requestInfo.subscriptionPackage == "Year") {
            if (elapsedTime < yearhour) {
                await logger.sendMessage(telegramAdminId, `Subscriber: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
                requestInfo.isSubscriber = true
                requestInfo.count = 0;
                requestInfo.blockTime = null;
                requestInfo.subscriptionPackage = "Year"
                await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
                return false;
            } else {
                await logger.sendMessage(telegramAdminId, `Subscriber expired: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
                requestInfo.count = 0;
                requestInfo.isSubscriber = false
                requestInfo.subscriptionDate = null;
                await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
            }
        } else if (elapsedTime.subscriptionPackage == "Month") {
            if (elapsedTime < monthhour) {
                await logger.sendMessage(telegramAdminId, `Subscriber: ${msg.chat.first_name} - ${userId}:${JSON.stringify(requestInfo)}`);
                requestInfo.isSubscriber = true
                requestInfo.count = 0;
                requestInfo.blockTime = null;
                requestInfo.subscriptionPackage = "Month"
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
        if (elapsedTime < timeWindow) {
            let timeLeft = (timeWindow - elapsedTime) / 60000;
            await logger.sendMessage(telegramAdminId, `Rate Limit Tracker: ${userId} - ${timeLeft.toFixed(2)} mins`);
            return true;
        }
        // Time window elapsed, reset count and clear block state
        requestInfo.blockTime = null;
        requestInfo.count = 0;
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


