import TelegramBot from "node-telegram-bot-api"
import dotenv from "dotenv"
import { ChatGPTAPI } from 'chatgpt'
dotenv.config()


export const secondTry = async (gpt, msg, bot) => {
    try {
        console.log("Second Try:  " + JSON.stringify(msg))
        await gpt.sendMessage(msg.text + " (Reply in English)", {
            parentMessageId: objArray[msg.chat.id][0]
        }).then(async (res) => {
            console.log(res.text)
            await bot.sendMessage(msg.chat.id, res.text)
            await logger.sendMessage(telegramAdminId, "Second Try trigger success.")
        })

    } catch (e) {
        await logger.sendMessage(telegramAdminId, "Second Try trigger failed" + e)
    }
}


