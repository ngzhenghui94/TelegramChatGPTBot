import { ChatGPTAPI } from 'chatgpt'
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import moment from "moment-timezone";
import { rateLimit } from "./src/rateLimit.js"
import { addUserToSubscription } from "./src/subscription.js"
import { queryStableDiffusion } from './src/stableDiffusion.js';
import { getUserRequestInfo } from "./src/userInfo.js"
import { Redis } from 'ioredis';
import Jimp from "jimp"
import fs from "fs"
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

const bot = new TelegramBot(process.env.TELEGRAMBOTAPIKEY, { polling: true });
const logger = new TelegramBot(process.env.LOGAPIKEY)
const telegramAdminId = process.env.ADMINID
// const stripe = new Stripe(process.env.STRIPEKEY);
const redis = new Redis(process.env.REDIS_URL); // initialize Redis client 
const teleSripeProductKey = process.env.STRIPETESTKEY


const api = new ChatGPTAPI({
    apiKey: process.env.OPENAPIKEY,
    debug: false,
    temperature: 1
})

let idArray = []
let objArray = {}

// Listen for any kind of message. 
bot.on('message', async (msg) => {

    // Logs the msg - for debugging
    console.log(JSON.stringify(msg))
    let now = moment().format("DD/MM/YY HH:mm")
    await bot.sendChatAction(msg.chat.id, "typing")
    const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);
    // Check if the msg contains content/text
    let msgContent;
    if (msg.caption) {
        msgContent = msg.caption
    } else if (msg.text) {
        if (msg.text.startsWith('/')) {
            return;
        } else {
            msgContent = msg.text
        }
    }
    // Check if the user is rate-limited
    if (await rateLimit(msg)) {
        await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 5 questions please wait 10 minute. Please wait and try again later or /subscribe.");
        await logger.sendMessage(telegramAdminId, "@ " + now + " User has reached rate limit. " + JSON.stringify(msg.from))
        clearInterval(typingInterval);
        return;
    }

    if (idArray.includes(msg.chat.id)) {
        try {
            if (msgContent) {
                await api.sendMessage(`${msgContent}`, {
                    parentMessageId: objArray[msg.chat.id][0],
                    // lastSent: moment().format('YYYY-MM-DD HH:mm:ss')
                }).then(async (res) => {
                    if (res.detail.usage.total_tokens >= 1500) {
                        objArray[msg.chat.id] = [0]
                        await logger.sendMessage(telegramAdminId, `@${now} Logger: Token exceeded for ${JSON.stringify(msg.chat)}`)
                    } else {
                        objArray[msg.chat.id] = [res.id]
                    }
                    await bot.sendMessage(msg.chat.id, res.text, { reply_to_message_id: msg.message_id })
                    await logger.sendMessage(telegramAdminId, msgContent + " - " + res.text + JSON.stringify(msg.from))
                    clearInterval(typingInterval);
                })
            } else {
                await bot.sendMessage(msg.chat.id, "I could not read your message", { reply_to_message_id: msg.message_id })
                await logger.sendMessage(telegramAdminId, `@${now} Logger: Message error ${JSON.stringify(msg)}`)
                clearInterval(typingInterval);
            }

        } catch (e) {
            // Tell the user there was an error
            await bot.sendMessage(msg.chat.id, `Sorry there was an error. Please try again later or use the /reset command.${e}`, { reply_to_message_id: msg.message_id })
            await logger.sendMessage(telegramAdminId, `@${now} There was an error logged. ${e} ----- ${msgContent}`)
            clearInterval(typingInterval);
        }
    } else {
        // If this is the "First Convo" with the bot, then we need to create a new conversation
        try {
            // Add the user to the idArray
            idArray.push(msg.chat.id)
            // Sends ChatGPT the message from the Telegram User
            await api.sendMessage(`${msgContent}`).then(async (res) => {
                await bot.sendMessage(msg.chat.id, res.text, { reply_to_message_id: msg.message_id })
                await logger.sendMessage(telegramAdminId, msgContent + " - " + res.text + JSON.stringify(msg.from))
                objArray[msg.chat.id] = [res.id]
                clearInterval(typingInterval);
            })
        } catch (e) {
            // Tell the user there was an error
            await bot.sendMessage(msg.chat.id, `Sorry there was an error. Please try again later or use the /reset command. ${e}`, { reply_to_message_id: msg.message_id })
            await logger.sendMessage(telegramAdminId, `@${now} There was an error logged. ${e} ----- ${msgContent}`)
            clearInterval(typingInterval);
        }
    }
});


bot.onText(/^\/reset$/i, async (msg) => {
    try {
        await api.sendMessage("Reset my conversation", {
            parentMessageId: objArray[msg.chat.id][0],
            // lastSent: moment().format('YYYY-MM-DD HH:mm:ss')
        })
        objArray[msg.chat.id] = []
        console.log(objArray)
        console.log(idArray)
        await bot.sendMessage(msg.chat.id, "Convo reset.")
        await logger.sendMessage(telegramAdminId, "Convo reset initiated by " + JSON.stringify(msg.from))
    } catch (e) {
        await bot.sendMessage(msg.chat.id, "Sorry, there was an error. You may not have a convo to rest." + e)
        await logger.sendMessage(telegramAdminId, "Convo reset initiated by " + JSON.stringify(msg.from) + " has failed.")
    }
});

bot.onText(/^\/subscribe$/i, async (msg) => {
    const chatId = msg.chat.id;
    // Send a message with a payment button
    await bot.sendInvoice(
        chatId,
        'Telegram GPT Subscription',
        '1 Day Unlimited Telegram GPT Query',
        chatId,
        teleSripeProductKey,
        'USD',
        [
            {
                label: 'Base',
                amount: 500
            }
        ]
    ).then(async () => {
        // Send a message with a payment button
        await bot.sendInvoice(
            chatId,
            'Telegram GPT Subscription',
            '7 Day Unlimited Telegram GPT Query',
            chatId,
            teleSripeProductKey,
            'USD',
            [
                {
                    label: 'Base',
                    amount: 1000
                }
            ]
        ).then(async () => {
            // Send a message with a payment button
            await bot.sendInvoice(
                chatId,
                'Telegram GPT Subscription',
                '30 Day Unlimited Telegram GPT Query',
                chatId,
                teleSripeProductKey,
                'USD',
                [
                    {
                        label: 'Base',
                        amount: 2500
                    }
                ]
            );
        })
    })
})



bot.on('pre_checkout_query', (query) => {
    const chatId = query.from.id;

    // Answer the pre-checkout query to confirm payment
    bot.answerPreCheckoutQuery(query.id, true);

    // Send a message to notify the user that payment is being processed
    bot.sendMessage(chatId, 'Payment processing...');
});


// Handle successful payment
bot.on('successful_payment', async (payment) => {
    const chatId = payment.chat.id;
    // Add the chatId into mysql db
    // addChatId(chatId)
    await addUserToSubscription(chatId, payment.successful_payment.total_amount)
    console.log(payment)
    bot.sendMessage(chatId, 'Payment successful');
})

// Reset redis cache on reset command
bot.onText(/^\/resetcache$/i, (msg) => {
    if (msg.chat.id == telegramAdminId) {
        idArray = []
        objArray = []
        redis.flushdb((err, result) => {
            if (err) {
                console.error(err);
                return;
            }
            console.log("Redis database has been reset");
        });
        bot.sendMessage(msg.chat.id, "Cache reset.")
    } else {
        bot.sendMessage(msg.chat.id, "You do not have permission to reset cache.")
    }
})

bot.onText(/^\/seeredis$/i, async (msg) => {
    if (msg.chat.id == telegramAdminId) {
        try {
            let keys = await redis.keys('*');
            let valuePromises = keys.map(async key => {
                let value = await redis.get(key);
                console.log(`Key: ${key}, Value: ${value}`);
                return `Key: ${key}, Value: ${value}\n`;
            });

            let values = await Promise.all(valuePromises);
            let returnMsg = values.join("");
            await bot.sendMessage(msg.chat.id, returnMsg);
        } catch (err) {
            console.error(err);
        }
    } else {
        bot.sendMessage(msg.chat.id, "You do not have permission to reset cache.")
    }
});

bot.onText(/^\/subscription$/i, async (msg) => {
    const userInfo = await getUserRequestInfo()
    await bot.sendMessage(msg.chat.id, JSON.stringify(userInfo))
})


async function blobToBuffer(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

bot.onText(/^\/image/i, async (msg) => {
    // Check if the user is rate-limited
    if (await rateLimit(msg)) {
        await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 5 questions please wait 10 minute. Please wait and try again later or /subscribe.");
        await logger.sendMessage(telegramAdminId, "@ " + now + " User has reached rate limit. " + JSON.stringify(msg.from))
        return;
    }

    let data = (msg.text).replace(/\/image /g, "")
    let imageBlob = await queryStableDiffusion(data)
    const imageBuffer = await blobToBuffer(imageBlob);
    const image = await Jimp.read(imageBuffer);

    const imagePath = './image.jpg';
    const imageJpg = await image.writeAsync(imagePath);

    await bot.sendPhoto(msg.chat.id, imagePath);
    // Remember to delete the image file after sending it.
    await fs.promises.unlink(imagePath);
})


// addUserToSubscription(telegramAdminId)