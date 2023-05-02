import { ChatGPTAPI } from 'chatgpt'
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import moment from "moment-timezone";
import { rateLimit } from "./src/rateLimit.js"
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

const bot = new TelegramBot(process.env.TELEGRAMBOTAPIKEY, { polling: true });
const logger = new TelegramBot(process.env.LOGAPIKEY)
const telegramAdminId = process.env.ADMINID

const api = new ChatGPTAPI({
    apiKey: process.env.OPENAPIKEY,
    debug: true,
    temperature: 1.4,
    promptPrefix: "",
})

let idArray = []
let objArray = {}

// Listen for any kind of message. 
bot.on('message', async (msg) => {
    // Logs the msg - for debugging

    await bot.sendChatAction(msg.chat.id, "typing")
    // Check if the user is rate-limited
    if (rateLimit(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 5 questions please wait 10 minute. Please wait and try again later.");
        await logger.sendMessage(telegramAdminId, "User has reached rate limit. " + JSON.stringify(msg.from))
        return;
    }

    // Check if the msg contains content/text
    let msgContent;
    if (msg.caption) {
        msgContent = msg.caption
    } else if (msg.text) {
        msgContent = msg.text
    }


    if (idArray.includes(msg.chat.id)) {
        try {
            if (msgContent) {
                await api.sendMessage(msgContent + " (Reply in English)", {
                    parentMessageId: objArray[msg.chat.id][0],
                    // lastSent: moment().format('YYYY-MM-DD HH:mm:ss')
                }).then(async (res) => {
                    if (res.detail.usage.total_tokens >= 1500) {
                        objArray[msg.chat.id] = [0]
                        logger.sendMessage(telegramAdminId, `Logger: Token exceeded for ${JSON.stringify(msg.chat)}`)
                    } else {
                        objArray[msg.chat.id] = [res.id]
                    }
                    await bot.sendMessage(msg.chat.id, res.text)
                    await logger.sendMessage(telegramAdminId, msgContent + " - " + res.text + JSON.stringify(msg.from))
                })
            } else {
                await bot.sendMessage(msg.chat.id, "I could not read your message")
            }

        } catch (e) {
            // Tell the user there was an error
            await bot.sendMessage(msg.chat.id, "Sorry there was an error. Please try again later or use the /reset command." + e)
            await logger.sendMessage(telegramAdminId, "There was an error logged." + e)
           
        }
    } else {
        // If this is the "First Convo" with the bot, then we need to create a new conversation
        try {
            // Add the user to the idArray
            idArray.push(msg.chat.id)
            // Sends ChatGPT the message from the Telegram User
            await api.sendMessage(msgContent).then(async (res) => {
                await bot.sendMessage(msg.chat.id, res.text)
                await logger.sendMessage(telegramAdminId, msgContent + " - " + res.text + JSON.stringify(msg.from))
                objArray[msg.chat.id] = [res.id]
            })

        } catch (e) {
            // Tell the user there was an error
            await bot.sendMessage(msg.chat.id, "Sorry there was an error. Please try again later or use the /reset command." + e)
            await logger.sendMessage(telegramAdminId, "There was an error logged." + e)

        }
    }
});


bot.onText(/^\/reset$/i, async (msg) => {
    try {
        let res = await api.sendMessage("Reset my conversation", {
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

