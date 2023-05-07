import dotenv from "dotenv";
import Redis from "ioredis";
import TelegramBot from "node-telegram-bot-api";
dotenv.config();

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client
const logger = new TelegramBot(process.env.LOGAPIKEY);
const telegramAdminId = parseInt(process.env.ADMINID);

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

// Rate limit function using redis
export const rateLimit = async (userId) => {
    const rateLimitRequests = 5;
    const timeWindow = 10 * 60 * 1000; // 10 minute in milliseconds
    const requestInfo = await getUserRequestInfo(userId);
    if (requestInfo.count < rateLimitRequests) {
        requestInfo.count += 1;
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return false;
    } else if (requestInfo.count >= rateLimitRequests) {
        if (requestInfo.blockTime) {
            const elapsedTime = Date.now() - requestInfo.blockTime;
            if (elapsedTime < timeWindow) {
                logger.sendMessage(telegramAdminId, `Rate Limit Tracker: ${userId}`)
                return true;
            } else {
                requestInfo.blockTime = null;
                requestInfo.count = 1;
                await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
                return false;
            }
        } else {
            requestInfo.blockTime = Date.now();
            await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
            return false;
        }
    }
}


