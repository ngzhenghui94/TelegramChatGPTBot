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
    debug: false,
    temperature: 1.4,
    promptPrefix: "",
})

let idArray = []
let objArray = {}

// Listen for any kind of message. 
bot.on('message', async (msg) => {
    // Logs the msg - for debugging
    let now = moment().format("DD/MM/YY HH:mm")
    await bot.sendChatAction(msg.chat.id, "typing")
    // Check if the user is rate-limited

    if (await rateLimit(msg.chat.id)) {
        await bot.sendMessage(msg.chat.id, "You have reached the maximum requests of 6 questions please wait 10 minute. Please wait and try again later.");
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
                await api.sendMessage(`${msgContent} (Reply in English)`, {
                    parentMessageId: objArray[msg.chat.id][0],
                }).then(async (res) => {
                    if (res.detail.usage.total_tokens >= 1500) {
                        objArray[msg.chat.id] = [0]
                    } else {
                        objArray[msg.chat.id] = [res.id]
                    }
                    await bot.sendMessage(msg.chat.id, res.text, { reply_to_message_id: msg.message_id })
                })
            } else {
                await bot.sendMessage(msg.chat.id, "I could not read your message", { reply_to_message_id: msg.message_id })
                await logger.sendMessage(telegramAdminId, `@${now} Logger: Message error ${msg}`)
            }

        } catch (e) {
            // Tell the user there was an error
            await bot.sendMessage(msg.chat.id, `Sorry there was an error. Please try again later or use the /reset command.${e}`, { reply_to_message_id: msg.message_id })
            await logger.sendMessage(telegramAdminId, `@${now} There was an error logged. ${e}`)
        }
    } else {
        // If this is the "First Convo" with the bot, then we need to create a new conversation
        try {
            // Add the user to the idArray
            idArray.push(msg.chat.id)
            // Sends ChatGPT the message from the Telegram User
            await api.sendMessage(`${msgContent} (Reply in English)`).then(async (res) => {
                await bot.sendMessage(msg.chat.id, res.text, { reply_to_message_id: msg.message_id })
                objArray[msg.chat.id] = [res.id]
            })
        } catch (e) {
            // Tell the user there was an error
            await bot.sendMessage(msg.chat.id, `Sorry there was an error. Please try again later or use the /reset command. ${e}`, { reply_to_message_id: msg.message_id })
            await logger.sendMessage(telegramAdminId, `@${now} There was an error logged. ${e}`)
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
        await bot.sendMessage(msg.chat.id, "Convo reset.")
    } catch (e) {
        await bot.sendMessage(msg.chat.id, "Sorry, there was an error. You may not have a convo to rest." + e)
        await logger.sendMessage(telegramAdminId, "Convo reset initiated by " + JSON.stringify(msg.from) + " has failed.")
    }
});

