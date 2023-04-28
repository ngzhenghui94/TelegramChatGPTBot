import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
dotenv.config()

const logger = new TelegramBot(process.env.LOGAPIKEY)
const userRequests = {};

export const rateLimit = (userId) => {
    const rateLimitRequests = 5
    const timeWindow = 10 * 60 * 1000; // 10 minute in milliseconds
    // if (logger) logger.sendMessage("Rate Limit Tracker: " + JSON.stringify(userRequests))
    if (!userRequests[userId]) {
        userRequests[userId] = { count: 1, startTime: Date.now() };
        return false;
    } else if (userRequests[userId].count < rateLimitRequests) {
        userRequests[userId].count += 1;
        return false;
    } else if (userRequests[userId].count >= rateLimitRequests) {
        if (userRequests[userId].blockTime) {
            const elapsedTime = Date.now() - userRequests[userId].blockTime;
            if (elapsedTime < timeWindow) {
                return true
            } else {
                delete userRequests[userId].blockTime;
                userRequests[userId].count = 1
                return false;
            }
        } else {
            userRequests[userId].blockTime = Date.now()
            return false;
        }
    }
}