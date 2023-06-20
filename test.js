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

bot.sendMessage(60384692, "I know life can be tough, but please do not end you life! Keep going, it will get better!")