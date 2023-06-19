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

// OpenAI Query
export const queryOpenAI = async (api, msg, bot, logger, groupMsg) => {
    // console.log("QueryOpenAI: " + JSON.stringify(msg))
    const userId = msg.from.id;
    const userRequestInfo = await getUserRequestInfo(userId);
    const maxTeleMessageLength = 3096;
    await bot.sendChatAction(msg.chat.id, "typing");
    const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);

    try {
        let msgContent;
        // Check if Private Msg or Group Msg
        if (msg.chat.type == "private") {
            // For Telegram Msg that was forwarded (with a pic + text)
            if (msg.caption) {
                msgContent = msg.caption;
            } else if (msg.text) {
                if (msg.text.startsWith('/')) {
                    clearInterval(typingInterval);
                    return;
                } else {
                    msgContent = msg.text;
                }
            }
        } else if (msg.chat.type == "group") {
            msgContent = groupMsg;
            userId = msg.chat.id;
        } 
        
        // bot.on('message') kept responding to /subscribe payment success message
        if (msg.succesful_payment) {
            clearInterval(typingInterval);
            return
        }

        // Check if the user is rate-limited
        if (await rateLimit(msg)) {
            await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 10 questions please wait 30 minute. Please wait and try again later or /subscribe for unlimited query");
            clearInterval(typingInterval);
            return;
        }

        // Query OpenAI with User's Message.
        await api.sendMessage(`${msgContent}`, {
            parentMessageId: userRequestInfo.lastMessageId
        }).then(async (res) => {
            let chatGPTAns = res.text;

            // Check if the user has exceeded the token limit (this is done to keep the token usage low without affecting users' experience)
            if (res.detail.usage.total_tokens >= 1500) {
                userRequestInfo.lastMessageId = null;
            } else {
                userRequestInfo.lastMessageId = res.id;
            }

            // If the res text from OpenAI is too Long (exceeding Telegram's 4096 char limit), split it into chunks and send it to the user
            if (res.text.length > maxTeleMessageLength) {
                console.log("Message too long... Fixing...")
                const chunks = chunkMessage(res.text, maxTeleMessageLength);
                for (let i = 0; i < chunks.length; i++) {
                    await bot.sendMessage(userId, chunks[i]);
                }
            } else {
                // Else, query OpenAI for prompts
                await queryOpenAIPrompt(api, msg, bot, chatGPTAns)
            }
            
            // Update redis with .lastMessageId, it is used for OpenAI to keep track of convo
            await redis.set(`user: ${userId}`, JSON.stringify(userRequestInfo));
            clearInterval(typingInterval);
            return;
        });
    } catch (err) {
        console.error(`[queryOpenAI] Caught Error: ${err}`)
        clearInterval(typingInterval);
        return;
    }
}

// Query OpenAI for prompts in order to further the conversation
export const queryOpenAIPrompt = async (api, msg, bot, chatGPTAns) => {
    const userId = msg.from.id;
    const userRequestInfo = await getUserRequestInfo(userId);
    await bot.sendChatAction(msg.chat.id, "typing");
    const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);
    let newInlineKeyboardOpts = JSON.parse(JSON.stringify(inlineKeyboardOpts));

    try {
        // Query OpenAI for prompts.
        await api.sendMessage(`Given this message: ${msg.text}, Generate me three concise (2-3 words) prompts I can ask you (ChatGPT) to further the conversation.`, {
            parentMessageId: userRequestInfo.lastMessageId
        }).then(async (res) => {
            // Format the prompts from OpenAI into an array
            let additionalItems = res.text.split(/\d\.\s*/).slice(1).map(s => s.replace(/"/g, '').replace(/\n/g, ''));

            // Loop through your array
            additionalItems.forEach((item, index) => {
                // Push each item into a separate sub-array in newInlineKeyboardOpts
                newInlineKeyboardOpts[index + 1].push({ text: item, callback_data: index + 1 });
            });

            // Send the prompts to the user with the original answer
            await bot.sendMessage(userId, chatGPTAns, {
                reply_to_message_id: msg.message_id, reply_markup: {
                    inline_keyboard: newInlineKeyboardOpts
                }
            });
            clearInterval(typingInterval);
        })
        clearInterval(typingInterval);
    } catch (err) {
        console.error(`[queryOpenAIPrompt] Caught Error: ${err}`)
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
        return;
    }
}
