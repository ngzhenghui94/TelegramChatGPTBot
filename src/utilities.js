import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client 

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
    } catch (e) {
        console.log("Check Redis Error: " + e)
    }
}

export const resetRedis = async () => {
    try {
        redis.flushdb((err, result) => {
            if (err) {
                console.error(err);
                return;
            }
            console.log("Redis database has been reset");
        });
    } catch (e) {
        console.log("Reset Redis Error: " + e)
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
    } catch (e) {
        console.log("Check Redis Error: " + e);
    }
}
