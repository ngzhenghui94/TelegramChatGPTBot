import { ChatGPTAPI } from 'chatgpt'
import TelegramBot from "node-telegram-bot-api"
import dotenv from "dotenv"
import moment from "moment-timezone"
import Redis from "ioredis"
import { getUserRequestInfo, getUsersnameFromMsg } from "./src/userInfo.js"
import { rateLimit } from "./src/rateLimit.js"
import { blobToBuffer, checkRedis, checkUserOnRedis, resetRedis } from "./src/utilities.js"
import { addUserToSubscription, checkSubscription, removeUserFromSubscription } from "./src/subscription.js"
import { queryStableDiffusion } from './src/stableDiffusion.js'
import Jimp from "jimp"
import fs from "fs"
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

const bot = new TelegramBot(process.env.TELEGRAMBOTAPIKEY, { polling: true });
const logger = new TelegramBot(process.env.LOGAPIKEY)
const telegramAdminId = process.env.ADMINID
const teleSripeProductKey = process.env.TELESTRIPEKEY
const redis = new Redis(process.env.REDIS_URL);

const api = new ChatGPTAPI({
    apiKey: process.env.OPENAPIKEY,
    debug: false,
    completionParams: {
        model: 'gpt-3.5-turbo',
        temperature: 1,
        top_p: 0.8
    }
})


// Matches "!bot" command
bot.onText(/!bot (.+)/, async (msg, match) => {
    const userName = await getUsersnameFromMsg(msg)
    try {
        if (msg.chat.type == "group") {
            // Logs the msg - for debugging
            console.log(JSON.stringify(msg));
            let now = moment().format("DD/MM/YY HH:mm");
            await bot.sendChatAction(msg.chat.id, "typing");
            const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);

            // The 'match' is an array with the message text and the captured "message"
            // message will contain the string after "!bot "
            const msgContent = match[1];

            // Check if the user is rate-limited
            if (await rateLimit(msg)) {
                await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 5 questions please wait 20 minute. Please wait and try again later or /subscribe for unlimited query");
                await logger.sendMessage(telegramAdminId, `At: ${now}, ${userName} has reached rate limit. ${JSON.stringify(msg)}`);
                clearInterval(typingInterval);
                return;
            }

            let userId = msg.from.id;
            let userRequestInfo = await getUserRequestInfo(userId);
            if (msgContent) {
                await api.sendMessage(`${msgContent}`, {
                    parentMessageId: userRequestInfo.lastMessageId
                }).then(async (res) => {
                    if (res.detail.usage.total_tokens >= 1500) {
                        userRequestInfo.lastMessageId = null;
                        await logger.sendMessage(telegramAdminId, `@${now} Logger: Token exceeded for ${JSON.stringify(msg.chat)}`);
                    } else {
                        userRequestInfo.lastMessageId = res.id;
                    }
                    await redis.set(`user: ${userId}`, JSON.stringify(userRequestInfo));
                    await bot.sendMessage(userId, res.text, { reply_to_message_id: msg.message_id });
                    await logger.sendMessage(telegramAdminId, `${userName}: ${msgContent}\n\nChatGPT:${res.text}\nmsg obj: ${JSON.stringify(msg)}`);
                    clearInterval(typingInterval);
                    return;
                });
            } else {
                await bot.sendMessage(userId, "I could not process this message. !bot is only available in group chat.", { reply_to_message_id: msg.message_id });
                await logger.sendMessage(telegramAdminId, `At: ${now}, unable to process msg from ${userName} - !bot command. \n ${JSON.stringify(msg)}`);
                clearInterval(typingInterval);
                return;
            }   
        } 
    } catch (e) {
        // Log error, send error msg
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${e}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `At: ${now}, error logged by - ${userName}. ${e} ----- ${JSON.stringify(msg)}`);
        clearInterval(typingInterval);
        return;
    }
});

// Listen for any kind of message. 
bot.on('message', async (msg) => {
    const userName = await getUsersnameFromMsg(msg)
    if (msg.chat.type == "private") {
        // Logs the msg - for debugging
        console.log(JSON.stringify(msg));
        let now = moment().format("DD/MM/YY HH:mm");
        await bot.sendChatAction(msg.chat.id, "typing");
        const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);
        let msgContent;
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

        // Check if the user is rate-limited
        if (await rateLimit(msg)) {
            await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 5 questions please wait 20 minute. Please wait and try again later or /subscribe for unlimited query");
            await logger.sendMessage(telegramAdminId, `At: ${now}, ${userName} has reached rate limit. ${JSON.stringify(msg)}`);
            clearInterval(typingInterval);
            return;
        }

        let userId = msg.from.id;
        let userRequestInfo = await getUserRequestInfo(userId);

        try {
            if (msgContent) {
                await api.sendMessage(`${msgContent}`, {
                    parentMessageId: userRequestInfo.lastMessageId
                }).then(async (res) => {
                    if (res.detail.usage.total_tokens >= 1500) {
                        userRequestInfo.lastMessageId = null;
                        await logger.sendMessage(telegramAdminId, `At: ${now}, ${userName} exceeded token > 1500. resetting their convo. ${JSON.stringify(msg)}`);
                    } else {
                        userRequestInfo.lastMessageId = res.id;
                    }
                    await redis.set(`user: ${userId}`, JSON.stringify(userRequestInfo));
                    await bot.sendMessage(userId, res.text, { reply_to_message_id: msg.message_id });
                    await logger.sendMessage(telegramAdminId, `${userName}: ${msgContent}\n\nChatGPT:${res.text}\nmsg obj: ${JSON.stringify(msg)}`);
                    clearInterval(typingInterval);
                    return;
                });
            } else {
                await bot.sendMessage(userId, "I could not process this message.", { reply_to_message_id: msg.message_id });
                await logger.sendMessage(telegramAdminId, `At: ${now}, unable to process msg from ${userName} - !bot command. \n ${JSON.stringify(msg)}`);
                clearInterval(typingInterval);
                return;
            }
        } catch (e) {
            // Tell the user there was an error
            await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${e}`, { reply_to_message_id: msg.message_id });
            await logger.sendMessage(telegramAdminId, `At: ${now}, error logged by - ${userName}. ${e} ----- ${JSON.stringify(msg)}`);    
            clearInterval(typingInterval);
            return;
        }
        clearInterval(typingInterval);
    }
});



bot.onText(/^\/reset$/i, async (msg) => {
    try {
        await api.sendMessage("Reset my conversation", {
            parentMessageId: objArray[msg.chat.id][0],
            // lastSent: moment().format('YYYY-MM-DD HH:mm:ss')
        })
        objArray[msg.chat.id] = []
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
        'Telegram ChatGPT Subscription (30 Days)',
        '30 days unlimited telegram ChatGPT query',
        chatId,
        teleSripeProductKey,
        'USD',
        [
            {
                label: 'Base',
                amount: 1098
            }
        ]
    ).then(async () => {
        // Send a message with a payment button
        await bot.sendInvoice(
            chatId,
            'Telegram ChatGPT Subscription (1 Year)',
            '1 year unlimited telegram ChatGPT query',
            chatId,
            teleSripeProductKey,
            'USD',
            [
                {
                    label: 'Base',
                    amount: 9800
                }
            ]
        );
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
bot.onText(/^\/resetredis$/i, async (msg) => {
    if (msg.chat.id == telegramAdminId) {
        idArray = []
        objArray = []
        await resetRedis()
        await bot.sendMessage(msg.chat.id, "Cache reset.")
    } else {
        await bot.sendMessage(msg.chat.id, "You do not have permission to reset cache.")
    }
})

bot.onText(/^\/seeredis|\/checkredis$/i, async (msg) => {
    if (msg.chat.id == telegramAdminId) {
        try {
            const returnMsg = await checkRedis()
            await bot.sendMessage(msg.chat.id, returnMsg);
        } catch (err) {
            console.error(err);
        }
    } else {
        await bot.sendMessage(msg.chat.id, "You do not have permission to reset cache.")
    }
});

bot.onText(/^\/redis (.+)/i, async (msg, parameter) => {
    let telegramId = parameter[1]
    if (msg.chat.id == telegramAdminId) {
        try {
            const returnMsg = await checkUserOnRedis(telegramId)
            await bot.sendMessage(msg.chat.id, returnMsg);
        } catch (err) {
            console.error(err);
        }
    } else {
        await bot.sendMessage(msg.chat.id, "You do not have permission to check user.")
    }
});

bot.onText(/^\/subscription$/i, async (msg) => {
    const subscriptionInfo = await checkSubscription(msg)
    await bot.sendMessage(msg.chat.id, subscriptionInfo.msg)
})

bot.onText(/^\/addSubscriber (.+) (.+)/i, async (msg, parameter) => {
    try {
        const telegramId = parameter[1]
        const daysToAdd = parameter[2]
        if (msg.chat.id == telegramAdminId) {
            await addUserToSubscription(telegramId, daysToAdd)
            await bot.sendMessage(msg.chat.id, "Added Telegram ID: " + telegramId + " with " + daysToAdd + " day subscription")
        } else {
            await bot.sendMessage(msg.chat.id, "You do not have permission.")
        }
    } catch (e) {
        await bot.sendMessage(msg.chat.id, "Sorry, there was an error. Please try again later.")
        await logger.sendMessage(telegramAdminId, "Error adding subscriber: " + e)
    }
})

bot.onText(/^\/removeSubscriber (.+)/i, async (msg, parameter) => {
    try {
        const telegramId = parameter[1]
        if (msg.chat.id == telegramAdminId) {
            await removeUserFromSubscription(telegramId)
            await bot.sendMessage(msg.chat.id, "Removed Telegram ID: " + telegramId + "  from subscription")
        } else {
            await bot.sendMessage(msg.chat.id, "You do not have permission.")
        }
    } catch (e) {
        await bot.sendMessage(msg.chat.id, "Sorry, there was an error. Please try again later.")
        await logger.sendMessage(telegramAdminId, "Error removing subscriber: " + e)
    }
})

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
    const randomId = Math.floor(Math.random() * 1000000000);
    const imagePath = `./image-${randomId}.jpg`;

    await bot.sendPhoto(msg.chat.id, imagePath);
    // Remember to delete the image file after sending it.
    await fs.promises.unlink(imagePath);
})


bot.onText(/^\/start$/i, async (msg) => {
    const welcomeText = `
    Hello! I'm your personal AI Chat bot. 🤖
    I'm here to help you with a variety of tasks. Here's what I can do:
    1. Answer your questions (chat normally with me! or use !bot <description> in group chat)🧐
    2. Generate images from text (use /image <description>)🎨
    3. Check your subscription status (/subscription)💳

    Simply chat with me normally! Alternatively, to see a list of commands, you can use /help.

    How can I assist you today?
    `;

    await bot.sendMessage(msg.chat.id, welcomeText);
});

bot.onText(/^\/help$/i, async (msg) => {
    const commonCommands = `
    Here's a list of commands that you can use:

        1. /help - Shows the list of commands.
        2. /reset - Reset the current conversation with the bot.
        3. /subscribe - Show subscription options for unlimited queries.
        4. /subscription - Check your current subscription status.
        5. /image - Generates an image based on the provided text.

    Please, remember to not start your query with a "/" if you want to talk to the bot. Commands starting with "/" are interpreted as commands.
    `;

    const adminCommands = `
    Additional Administrator Commands:

    1. /resetredis - Administrator command to reset Redis cache.
    2. /seeredis or /checkredis - Administrator command to see Redis cache contents.
    3. /addSubscriber <telegramId> <daysToAdd> - Administrator command to manually add a subscriber.
    4. /removeSubscriber <telegramId> - Administrator command to manually remove a subscriber.
    `;

    const helpText = msg.chat.id == telegramAdminId ? commonCommands + adminCommands : commonCommands;

    await bot.sendMessage(msg.chat.id, helpText);
});
