import dotenv from "dotenv";
import Redis from "ioredis";
import TelegramBot from "node-telegram-bot-api";
import moment from "moment-timezone"
import { getUserRequestInfo, getUsersnameFromMsg } from "./userInfo.js";
import { getUserSubscription } from "./subscription.js"
dotenv.config();
moment.tz.setDefault("Asia/Singapore");

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client
const logger = new TelegramBot(process.env.LOGAPIKEY);
const telegramAdminId = parseInt(process.env.ADMINID);
const whitelist = process.env.WHITELIST
const blacklist = process.env.BLACKLIST
const queryLimit = process.env.RATELIMITQNS
const limitTimer = process.env.RATELIMITTIMER

function isUserIdInWhitelist(userId) {
    try {
        return whitelist.split(',').includes(userId.toString());
    } catch (err) {
        console.error(`[isUserIdInWhitelist] Caught Error: ${err}`)
    }
}

function isUserIdInBlacklist(userId) {
    try {
        return blacklist.split(',').includes(userId.toString());
    } catch (err) {
        console.error(`[isUserIdInBlacklist] Caught Error: ${err}`)
    }
}

// UserInfo object (requestInfo)
// requestInfo.rateLimit
// requestInfo.blockTime
// requestInfo.lastMessageId
// requestInfo.isWhitelisted
// requestInfo.isBlacklisted

// Rate limit function using redis
export const rateLimit = async (msg) => {
    try {
        const userId = msg.from.id
        const rateLimitRequests = queryLimit
        const timeWindow = limitTimer * 60 * 1000 // limitTimer is minutes -> milliseconds
        const requestInfo = await getUserRequestInfo(userId);
        const username = await getUsersnameFromMsg(msg)
        requestInfo.messageCount += 1;

        // Whitelist check
        if (isUserIdInWhitelist(userId)) {
            await logger.sendMessage(telegramAdminId, `Whitelisted: ${username} - ${userId}:${JSON.stringify(requestInfo)}`);
            requestInfo.rateLimit = 0;
            requestInfo.isWhitelisted = true;
            await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
            return false;
        }
        // Blacklist Check
        if (isUserIdInBlacklist(userId)) {
            await logger.sendMessage(telegramAdminId, `Blacklisted: ${username} - ${userId}:${JSON.stringify(requestInfo)}`);
            requestInfo.rateLimit = 99;
            requestInfo.isBlacklisted = true;
            await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
            return true;
        }

        const subscriptionInfo = await getUserSubscription(userId)

        // Check if user is a subscriber and time
        if (subscriptionInfo && subscriptionInfo.isSubscriber == true) {
            const now = Date.now()
            if (now < subscriptionInfo.subScriptionEndDate) {
                await logger.sendMessage(telegramAdminId, `Subscriber: ${username} - ${userId}:${JSON.stringify(requestInfo)}`);
                return false;
            } else {
                await logger.sendMessage(telegramAdminId, `Subscriber expired: ${username} - ${userId}:${JSON.stringify(requestInfo)}`);
            }
            await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        }

        // Normal rate limiting check
        await logger.sendMessage(telegramAdminId, `${userId}:${JSON.stringify(requestInfo)}`);
        if (requestInfo.rateLimit < rateLimitRequests) {
            requestInfo.rateLimit += 1;
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
            requestInfo.rateLimit = 0;
            await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
            return false;
        }

        // No block time set, set block time and return false
        requestInfo.blockTime = Date.now();
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return false;
    } catch (err) {
        console.error(`[rateLimit] Caught Error: ${err}`)
    }
}



