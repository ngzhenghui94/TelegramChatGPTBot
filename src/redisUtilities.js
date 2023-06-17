import { Redis } from 'ioredis';
import dotenv from "dotenv"
import moment from "moment-timezone"
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

const redis = new Redis(process.env.REDIS_URL);

export const blobToBuffer = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export const checkRedis = async () => {
    try {
        let keys = await redis.keys('*');
        let valuePromises = keys.map(async key => {
            let value = await redis.get(key);
            console.log(`Key: ${key}, Value: ${value}`);
            return `Key: ${key}, Value: ${value}\n`;
        });
        let values = await Promise.all(valuePromises);
        let returnMsg = values.join("");
        return returnMsg
    } catch (err) {
        console.error(`[checkRedis] Caught Error: ${err}`)
    }
}

export const resetRedis = async () => {
    try {
        redis.flushdb((err, result) => {
            if (err) {
                console.erroror(err);
                return;
            }
            console.log("Redis database has been reset");
        });
    } catch (err) {
        console.error(`[resetRedis] Caught Error: ${err}`)
    }
}

export const checkUserOnRedis = async (telegramId) => {
    try {
        let value = await redis.get(`user: ${telegramId}`);
        if (value) {
            console.log(`Key: user: ${telegramId}, Value: ${value}`);
            return `Key: user: ${telegramId}, Value: ${value}\n`;
        } else {
            console.log(`Key: user: ${telegramId} does not exist.`);
            return `Key: user: ${telegramId} does not exist.\n`;
        }
    } catch (err) {
        console.error(`[checkUserOnRedis] Caught Error: ${err}`)
    }
}

export const removeFromRedisCache = async (userId) => {
    try {
        await redis.del(`user: ${userId}`);
        return;
    } catch (err) {
        console.error(`[removeFromRedisCache] Caught Error: ${err}`)
    }
}

export const privateChatOnly = async (msg) => {
    try {
        if (msg.chat.type == "private") {
            return true
        } else {
            return false
        }
    } catch (err) {
        console.error(`[privateChatOnly] Caught Error: ${err}`)
    }
}
