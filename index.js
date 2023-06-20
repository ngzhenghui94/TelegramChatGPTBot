import { ChatGPTAPI } from 'chatgpt'
import TelegramBot from "node-telegram-bot-api"
import dotenv from "dotenv"
import moment from "moment-timezone"
import Redis from "ioredis"
import { getUserRequestInfo, getUsersnameFromMsg } from "./src/userInfo.js"
import { rateLimit } from "./src/rateLimit.js"
import { blobToBuffer, checkRedis, checkUserOnRedis, resetRedis } from "./src/redisUtilities.js"
import { createSubscriptionObject, checkSubscription, removeUserFromSubscription, getAllSubscription, setSubscriptionState } from "./src/subscription.js"
import { queryStableDiffusion, queryOpenAI, inlineKeyboardOpts, queryOpenAIPrompt } from './src/query.js'
import { privateChatOnly } from "./src/utilities.js"
import Jimp from "jimp"
import fs from "fs"
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

const bot = new TelegramBot(process.env.TELEGRAMBOTAPIKEY, { polling: true });
const logger = new TelegramBot(process.env.LOGAPIKEY)
const telegramAdminId = process.env.ADMINID
const teleSripeProductKey = process.env.TELESTRIPEKEY
const redis = new Redis(process.env.REDIS_URL);
const gptApiKey = process.env.OPENAPIKEY
const gptModel = process.env.GPTMODEL

const api = new ChatGPTAPI({
    apiKey: gptApiKey,
    debug: false,
    completionParams: {
        model: gptModel,
        temperature: 1.2,
    }
})

// Get the bot's Telegram handler
const botInfo = await bot.getMe();
const botUsername = botInfo.username;
const botUsernameRegex = new RegExp('@' + botUsername, 'i');

// Bot will respond to itself in Telegram Group Chat when users query it via @<BotUsername> [Message]
bot.onText(botUsernameRegex, async (msg, parameter) => {
    try {
        let groupMsg = parameter[1]
        if (msg.chat.type == "group") {
            await queryOpenAI(api, msg, bot, logger, groupMsg)
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[@bot] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[@${botUsername}] Caught Error: ${err}`)
    }
})

// Matches "@bot" command
bot.onText(/@bot (.+)/, async (msg, parameter) => {
    try {
        let groupMsg = parameter[1]
        if (msg.chat.type == "group") {
            await queryOpenAI(api, msg, bot, logger, groupMsg)
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[@bot] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[@bot] Caught Error: ${err}`)
    }
});

// Listen for any kind of message. 
bot.on('message', async (msg) => {
    await logger.sendMessage(telegramAdminId, `${await getUsersnameFromMsg(msg)}: msg obj: ${JSON.stringify(msg)}`);
    try {
        if (msg.chat.type == "private") {
            await queryOpenAI(api, msg, bot, logger)
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[message] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[message] Caught Error: ${err}`)
    }
});

// Handle callback queries
bot.on('callback_query', async function onCallbackQuery(callbackQuery) {
    try {
        const action = callbackQuery.data;
        const msg = callbackQuery.message;

        await bot.sendChatAction(msg.chat.id, "typing");
        const typingInterval = setInterval(async () => await bot.sendChatAction(msg.chat.id, 'typing'), 5000);
        let userId = msg.chat.id
        let userRequestInfo = await getUserRequestInfo(userId);

        let msgContent = "";
        if (action === 'Retry') {
            msgContent = "Tell me another - " + msg.reply_to_message.text;
        } else if (action == "Surprise") {
            msgContent = "Surprise me!";
        } else if (action == "Explain") {
            msgContent = "Explain and elaborate" + msg.reply_to_message.text;
        } else {
            msgContent = msg.reply_markup.inline_keyboard[action][0].text;
        }
        await api.sendMessage(msgContent, {
            parentMessageId: userRequestInfo.lastMessageId
        }).then(async (res) => {
            let chatGPTAns = res.text
            if (res.detail.usage.total_tokens >= 1500) {
                userRequestInfo.lastMessageId = null;
            } else {
                userRequestInfo.lastMessageId = res.id;
            }
            await redis.set(`user: ${userId}`, JSON.stringify(userRequestInfo));
            await api.sendMessage(`Given this message: ${msg.text}, Generate me three concise (2-3 words) prompts I can ask you (ChatGPT) to further the conversation.`, {
                parentMessageId: userRequestInfo.lastMessageId
            }).then(async (res) => {

                let additionalItems = res.text.split(/\d\.\s*/).slice(1).map(s => s.replace(/"/g, '').replace(/\n/g, ''));

                let newInlineKeyboardOpts = JSON.parse(JSON.stringify(inlineKeyboardOpts));
                // Loop through your array
                additionalItems.forEach((item, index) => {
                    // Push each item into a separate sub-array in inlineKeyboardOpts
                    newInlineKeyboardOpts[index + 1].push({ text: item, callback_data: index + 1 });
                });
                // console.log(additionalItems)
                await bot.sendMessage(userId, chatGPTAns, {
                    reply_to_message_id: msg.message_id, reply_markup: {
                        inline_keyboard: newInlineKeyboardOpts
                    }
                });
                clearInterval(typingInterval);
            })
            clearInterval(typingInterval);
            return;
        });
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[callback_query] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[callback_query] Caught Error: ${err}`)
    }
});

bot.onText(/^\/image/i, async (msg) => {
    const userId = msg.from.id;

    try {
        // Check if the user is rate-limited
        if (await rateLimit(msg)) {
            await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 10 questions please wait 30 minute. Please wait and try again later or /subscribe.");
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
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/image] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/image] Caught Error: ${err}`)
    }
})


bot.onText(/^\/reset$/i, async (msg) => {
    const userId = msg.from.id;

    try {
        if (await privateChatOnly(msg) === false) {
            await bot.sendMessage(msg.chat.id, "Sorry, this command is only available in private chat.")
            return;
        }
        let userRequestInfo = await getUserRequestInfo(userId);
        await api.sendMessage("Reset my conversation", {
            parentMessageId: userRequestInfo.lastMessageId
        }).then(async () => {
            userRequestInfo.lastMessageId = null;
            await redis.set(`user: ${userId}`, JSON.stringify(userRequestInfo));
            await bot.sendMessage(msg.chat.id, "Convo reset.")
            await logger.sendMessage(telegramAdminId, "Convo reset initiated by " + JSON.stringify(msg.from))
        })
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/reset] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/reset] Caught Error: ${err}`)
    }
});

bot.onText(/^\/subscribe$/i, async (msg) => {
    const userId = msg.chat.id;
    try {
        if (await privateChatOnly(msg) === false) {
            await bot.sendMessage(msg.chat.id, "Sorry, this command is only available in private chat.")
            return;
        }
        const hasSubscription = await checkSubscription(userId)
        console.log(`Subscribe:  ${JSON.stringify(msg)}`)
        if (hasSubscription.isSubscriber != true) {
            // Send a message with a payment button
            await bot.sendInvoice(
                userId,
                'Telegram ChatGPT Subscription (30 Days)',
                '30 days unlimited telegram ChatGPT query',
                userId,
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
                    userId,
                    'Telegram ChatGPT Subscription (1 Year)',
                    '1 year unlimited telegram ChatGPT query',
                    userId,
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
            return;
        } else {
            bot.sendMessage(userId, "You have an active subscription.");
            return;
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/subscribe] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/subscribe] Caught Error: ${err}`)
    }
})


bot.on('pre_checkout_query', async (msg) => {
    const userId = msg.from.id;
    try {
        // Answer the pre-checkout query to confirm payment
        bot.answerPreCheckoutQuery(msg.id, true);
        console.log(`Pre_Checkout_Query:  ${JSON.stringify(msg)}`)
        // Send a message to notify the user that payment is being processed
        bot.sendMessage(userId, 'Payment processing...');
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/pre_checkout_query] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/pre_checkout_query] Caught Error: ${err}`)
    }
});

// Handle successful payment
bot.on('successful_payment', async (msg) => {
    const userId = msg.chat.id;
    try {
        await createSubscriptionObject(userId, msg, msg.successful_payment.total_amount)
        console.log(`Successful_Payment:  ${JSON.stringify(msg)}`)
        bot.sendMessage(userId, 'Payment successful');
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/successful_payment] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/successful_payment] Caught Error: ${err}`)
    }
})

// Reset redis cache on reset command
bot.onText(/^\/resetredis$/i, async (msg) => {
    const userId = msg.chat.id;
    try {
        if (msg.chat.id == telegramAdminId) {
            await resetRedis()
            await bot.sendMessage(msg.chat.id, "Cache reset.")
        } else {
            await bot.sendMessage(msg.chat.id, "You do not have permission to reset cache.")
        }
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/resetredis] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/resetredis] Caught Error: ${err}`)
    }
})

bot.onText(/^\/seeredis|\/checkredis$/i, async (msg) => {
    const userId = msg.chat.id;
    try {
        if (msg.chat.id == telegramAdminId) {
            const returnMsg = await checkRedis()
            await bot.sendMessage(msg.chat.id, returnMsg);
            return;
        } else {
            await bot.sendMessage(msg.chat.id, "You do not have permission to reset cache.")
            return;
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/seeredis] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/seeredis] Caught Error: ${err}`)
    }
});

bot.onText(/^\/redis (.+)/i, async (msg, parameter) => {
    const userId = msg.chat.id;
    try {
        if (msg.chat.id == telegramAdminId) {
            let telegramId = parameter[1]
            const returnMsg = await checkUserOnRedis(telegramId)
            await bot.sendMessage(msg.chat.id, returnMsg);
            return;
        } else {
            await bot.sendMessage(msg.chat.id, "You do not have permission to check user.")
            return;
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/redis] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/redis] Caught Error: ${err}`)
    }
});

bot.onText(/^\/subscription$/i, async (msg) => {
    const userId = msg.chat.id;
    try {
        if (await privateChatOnly(msg) === false) {
            await bot.sendMessage(msg.chat.id, "Sorry, this command is only available in private chat.")
            return;
        }
        const subscriptionInfo = await checkSubscription(userId)
        await bot.sendMessage(msg.chat.id, `Telegram ID: ${userId}\n\n${subscriptionInfo.msg}`)
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/subscription] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/subscription] Caught Error: ${err}`)
    }
})

bot.onText(/^\/addSubscriber (.+) (.+)/i, async (msg, parameter) => {
    const userId = msg.chat.id;
    try {
        const telegramId = parameter[1]
        const amountToAdd = parameter[2]
        if (msg.chat.id == telegramAdminId) {
            await createSubscriptionObject(telegramId, msg, amountToAdd)
            await bot.sendMessage(msg.chat.id, "Added Telegram ID: " + telegramId + " with $" + (amountToAdd / 10).toFixed(2) + " of subscription")
        } else {
            await bot.sendMessage(msg.chat.id, "You do not have permission.")
        }
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/addSubscriber] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/addSubscriber] Caught Error: ${err}`)
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
        return;
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/removeSubscriber] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/removeSubscriber] Caught Error: ${err}`)
    }
})

bot.on(/^\/disableSubscription (.+)/i, async (msg, parameter) => {
    try {
        if (msg.chat.id == telegramAdminId) {
            const telegramId = parameter[1]
            const result = await setSubscriptionState(telegramId, false)
            if (result) {
                await bot.sendMessage(msg.chat.id, "Subscription disabled for id: " + telegramId)
            } else {
                await bot.sendMessage(msg.chat.id, "Subscription disable fail for id: " + telegramId)
            }
        } else {
            await bot.sendMessage(msg.chat.id, "Sorry you do not have permission to disable subscription.")
            await logger.sendMessage(telegramAdminId, "Non-Admin tried to disable subscription " + e)
            return;
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/disableSubscription] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/disableSubscription] Caught Error: ${err}`)
    }
})

bot.on(/^\/enableSubscription (.+)/i, async (msg, parameter) => {
    try {
        if (msg.chat.id == telegramAdminId) {
            const telegramId = parameter[1]
            const result = await setSubscriptionState(telegramId, true)
            if (result) {
                await bot.sendMessage(msg.chat.id, "Subscription enabled for id: " + telegramId)
                return;
            } else {
                await bot.sendMessage(msg.chat.id, "Subscription enabled fail for id: " + telegramId)
                return;
            }
        } else {
            await bot.sendMessage(msg.chat.id, "Sorry you do not have permission to enabled subscription.")
            await logger.sendMessage(telegramAdminId, "Non-Admin tried to enabled subscription " + e)
            return;
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/enableSubscription] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/enableSubscription] Caught Error: ${err}`)
    }
})

bot.onText(/^\/getAllSubscription$/i, async (msg) => {
    try {
        if (msg.chat.id == telegramAdminId) {
            const results = await getAllSubscription()

            const returnSub = results.map(result => ({
                username: result.username,
                userId: result.userId,
                subscriptionEndDateParsed: result.subscriptionEndDateParsed
            }));

            console.log(returnSub)
            await bot.sendMessage(msg.chat.id, JSON.stringify(returnSub))
            return;
        } else {
            await bot.sendMessage(msg.chat.id, "Sorry you do not have permission to check all the subscriptions")
            return;
        }
    } catch (err) {
        // Tell the user there was an error
        await bot.sendMessage(userId, `Sorry there was an error. Please try again later or use the /reset command. ${err}`, { reply_to_message_id: msg.message_id });
        await logger.sendMessage(telegramAdminId, `[/getAllSubscription] Error logged by - ${msg.chat.id}. ${err} ----- ${JSON.stringify(msg)}`);
        console.error(`[/getAllSubscription] Caught Error: ${err}`)
    }
})


bot.onText(/^\/start$/i, async (msg) => {
    const welcomeText = `
    Hello! I'm your personal AI Chat bot. 🤖
    
I'm here to help you with a variety of tasks. Here's what I can do:

1. Answer your questions (chat normally with me! or use @bot <description> or @myusername [message]in group chat)🧐
2. Generate images from text (use /image <description>)🎨
3. Check your subscription status (/subscription)💳

Simply chat with me normally! Alternatively, to see a list of commands, you can use /help.

How can I assist you today?`;

    await queryOpenAIPrompt(api, msg, bot, welcomeText)
    return;
});

bot.onText(/^\/help$/i, async (msg) => {
    const commonCommands = `
    Here's a list of commands that you can use:

1. /help - Shows the list of commands.
2. /reset - Soft reset the current conversation with the bot.
3. /subscribe - Show subscription options for unlimited queries.
4. /subscription - Check your current subscription status.
5. /image - Generates an image based on the provided text.
6. @${botUsername} [message] - Used in group chat to talk to the bot. For example, @bot How does the internet work?
7. @bot [message] - Used in group chat to talk to the bot. For example, @bot How does the internet work?

Please, remember to not start your query with a "/" if you want to talk to the bot. Messages starting with "/" are interpreted as commands.
    `;

    const adminCommands = `
Additional Administrator Commands:

1. /resetredis - Administrator command to reset Redis cache.
2. /seeredis or /checkredis - Administrator command to see Redis cache contents.
3. /addSubscriber <telegramId> <amountToAdd> - Administrator command to manually add a subscriber.
4. /removeSubscriber <telegramId> - Administrator command to manually remove a subscriber.
5. /disableSubscriber <telegramId>
6. /enableSubscriber <telegramId>
7. /getAllSubscription`;

    const helpText = msg.chat.id == telegramAdminId ? commonCommands + adminCommands : commonCommands;

    await bot.sendMessage(msg.chat.id, helpText);
    return;
});
