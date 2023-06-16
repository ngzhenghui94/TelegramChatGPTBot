import { Redis } from 'ioredis';
import { rateLimit } from './rateLimit.js';
import { getUserRequestInfo, getUsersnameFromMsg } from "./userInfo.js"
import dotenv from "dotenv"
import moment from "moment-timezone"
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

const redis = new Redis(process.env.REDIS_URL);
const telegramAdminId = process.env.ADMINID;

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

export const queryOpenAI = async (api, msg, bot, logger, groupMsg) => {
    let userId = msg.from.id;
    const userName = await getUsersnameFromMsg(msg)
    const userRequestInfo = await getUserRequestInfo(userId);
    const maxTeleMessageLength = 3096;
    const now = moment().format("DD/MM/YY HH:mm");

    console.log(JSON.stringify(msg))
    try {
        await bot.sendChatAction(msg.chat.id, "typing");
        const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);
        let msgContent;
        if (msg.chat.type == "private") {
            if (msg.caption) {
                msgContent = msg.caption;
            } else if (msg.text) {
                if (msg.text.startsWith('/')) {
                    return;
                } else {
                    msgContent = msg.text;
                }
            }
        } else if (msg.chat.type == "group") {
            msgContent = groupMsg;
            userId = msg.chat.id;
        }


        // Check if the user is rate-limited
        if (await rateLimit(msg)) {
            await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 10 questions please wait 30 minute. Please wait and try again later or /subscribe for unlimited query");
            await logger.sendMessage(telegramAdminId, `At: ${now}, ${userName} has reached rate limit. ${JSON.stringify(msg)}`);
            clearInterval(typingInterval);
            return;
        }

        await api.sendMessage(`${msgContent}`, {
            parentMessageId: userRequestInfo.lastMessageId
        }).then(async (res) => {


            if (res.detail.usage.total_tokens >= 1500) {
                userRequestInfo.lastMessageId = null;
                await logger.sendMessage(telegramAdminId, `At: ${now}, ${userName} exceeded token > 1500. resetting their convo. ${JSON.stringify(msg)}`);
            } else {
                userRequestInfo.lastMessageId = res.id;
            }


            userRequestInfo.lastMessage = msgContent
            if (res.text.length > maxTeleMessageLength) {
                const chunks = chunkMessage(res.text, maxTeleMessageLength);
                for (let i = 0; i < chunks.length; i++) {
                    await bot.sendMessage(userId, chunks[i]);
                    await logger.sendMessage(telegramAdminId, `${userName}: ${msgContent}\n\nChatGPT: ${chunks[i]}\n\nmsg obj: ${JSON.stringify(msg)}`);
                }
                clearInterval(typingInterval);
            } else {
                await bot.sendMessage(userId, res.text, {
                    reply_to_message_id: msg.message_id, reply_markup: { inline_keyboard: [[{ text: "Generate another", callback_data: "Retry" }]] }
                });
                await logger.sendMessage(telegramAdminId, `${userName}: ${msgContent}\n\nChatGPT: ${res.text}\n\nmsg obj: ${JSON.stringify(msg)}`);
                clearInterval(typingInterval);
            }
            await redis.set(`user: ${userId}`, JSON.stringify(userRequestInfo));
            return;
        });
    } catch (err) {
        console.log(err)
        return;
    }
}

// Split msg into chunks to overcome Telegram's Msg 4096 Char limit
const chunkMessage = (message, chunkSize) => {
    const numChunks = Math.ceil(message.length / chunkSize);
    const chunks = new Array(numChunks);

    for (let i = 0, j = 0; i < numChunks; ++i, j += chunkSize) {
        chunks[i] = message.substr(j, chunkSize);
    }
    return chunks;
};