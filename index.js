import { ChatGPTAPI } from 'chatgpt'
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import moment from "moment-timezone";
moment.tz.setDefault("Asia/Singapore");
dotenv.config()

//Create a .env file, with the following variables:
//TELEGRAMBOTAPIKEY=""
//APIKEY=""

const bot = new TelegramBot(process.env.TELEGRAMBOTAPIKEY, { polling: true });

const api = new ChatGPTAPI({
    apiKey: process.env.APIKEY,
    debug: true,
    temperature: 1.4,
    promptPrefix: "",
})

let idArray = []
let objArray = {}

// Listen for any kind of message. 
bot.on('message', async (msg) => {
    // Logs the msg - for debugging
    console.log(msg)
    const textMsg = msg.text
    if (idArray.includes(msg.chat.id)) {
        try {
            let res = await api.sendMessage(msg.text, {
                parentMessageId: objArray[msg.chat.id][0],
                // lastSent: moment().format('YYYY-MM-DD HH:mm:ss')
            })
            // Logs the response from ChatGPT - for debugging
            console.log(res)
            if (res.detail.usage.total_tokens >= 1000) {
                console.log("reseting convo")
                objArray[msg.chat.id] = [0]
            } else {
                console.log("convo within token")
                objArray[msg.chat.id] = [res.id]
            }
            // Sends the response from ChatGPT to the Telegram User
            bot.sendMessage(msg.chat.id, res.text)
        } catch (e) {
            // Tell the user there was an error
            bot.sendMessage(msg.chat.id, "Sorry there was an error. Please try again later or use the /reset command." + e)
        }
    } else {
        // If this is the "First Convo" with the bot, then we need to create a new conversation
        try {
            // Add the user to the idArray
            idArray.push(msg.chat.id)
            // Sends ChatGPT the message from the Telegram User
            let res = await api.sendMessage(msg.text)
            // Logs the response from ChatGPT - for debugging
            console.log(res)
            objArray[msg.chat.id] = [res.id]
            // Sends the response from ChatGPT to the Telegram User
            bot.sendMessage(msg.chat.id, res.text)
        } catch (e) {
            bot.sendMessage(msg.chat.id, "Sorry there was an error. Please try again or use the /reset command." + e)
        }
    }
});


bot.onText(/^\/reset$/i, async (msg) => {
    try {
        let res = await api.sendMessage("reset my conversation", {
            parentMessageId: objArray[msg.chat.id][0],
            // lastSent: moment().format('YYYY-MM-DD HH:mm:ss')
        })
        objArray[msg.chat.id] = [0]
        console.log(res)
        bot.sendMessage(msg.chat.id, "Convo reset.")
    } catch (e) {
        bot.sendMessage(msg.chat.id, "Sorry, there was an error. You may not have a convo to rest." + e)
    }
});
