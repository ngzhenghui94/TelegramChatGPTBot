import { Redis } from 'ioredis';
import { rateLimit } from './rateLimit.js';
import { getUserRequestInfo, getUsersnameFromMsg } from "./userInfo.js"
import dotenv from "dotenv"
import moment from "moment-timezone"
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

const redis = new Redis(process.env.REDIS_URL);
const telegramAdminId = process.env.ADMINID;
const huggingFaceToken = process.env.HUGGINGFACEKEY;

export const inlineKeyboardOpts = [[{ text: "Retry", callback_data: "Retry" }, { text: "Elaborate", callback_data: "Explain" }],
[],
[],
[]]

export const queryOpenAI = async (api, msg, bot, logger, groupMsg) => {
    let userId = msg.from.id;
    const userName = await getUsersnameFromMsg(msg);
    const userRequestInfo = await getUserRequestInfo(userId);
    const maxTeleMessageLength = 3096;
    const now = moment().format("DD/MM/YY HH:mm");
    let newInlineKeyboardOpts = JSON.parse(JSON.stringify(inlineKeyboardOpts));

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
            let chatGPTAns = res.text;

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
                await logger.sendMessage(telegramAdminId, `${userName}: ${msgContent}\n\nChatGPT: ${res.text}\n\nmsg obj: ${JSON.stringify(msg)}`);
                await api.sendMessage(`Given this message: ${msg.text}, Generate me three concise (2-3 words) prompts I can ask you (ChatGPT) to further the conversation.`, {
                    parentMessageId: userRequestInfo.lastMessageId
                }).then(async (res) => {
                    let additionalItems = res.text.split(/\d\.\s*/).slice(1).map(s => s.replace(/"/g, '').replace(/\n/g, ''));

                    // Loop through your array
                    additionalItems.forEach((item, index) => {
                        // Push each item into a separate sub-array in inlineKeyboardOpts
                        newInlineKeyboardOpts[index + 1].push({ text: item, callback_data: index + 1 });
                    });

                    await bot.sendMessage(userId, chatGPTAns, {
                        reply_to_message_id: msg.message_id, reply_markup: {
                            inline_keyboard: newInlineKeyboardOpts
                        }
                    });
                    clearInterval(typingInterval);
                })
                clearInterval(typingInterval);
            }
            await redis.set(`user: ${userId}`, JSON.stringify(userRequestInfo));
            clearInterval(typingInterval);
            return;
        });
    } catch (err) {
        console.error(`[queryOpenAI] Caught Error: ${err}`)
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


export const queryStableDiffusion = async (data) => {
    try {
        const response = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1-base", {
            headers: { Authorization: `Bearer ${huggingFaceToken}` },
            method: "POST",
            body: JSON.stringify(data),
        })
        const result = await response.blob();
        return result;
    } catch (err) {
        console.error(`[queryStableDiffusion] Caught Error: ${err}`)
    }
}
