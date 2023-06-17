import dotenv from "dotenv";
import Redis from "ioredis";
dotenv.config();

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client

// Helper function to get user request info from Redis
export const getUserRequestInfo = async (userId) => {
    try {
        let requestInfo = await redis.get(`user: ${userId}`);
        if (requestInfo) {
            requestInfo = JSON.parse(requestInfo);
        } else {
            requestInfo = { count: 0 };
        }
        return requestInfo;
    } catch (err) {
        console.error(`[getUserRequestInfo] Caught Error: ${err}`)
    }
};

// Helper function to get user's username from msg, if their privacy is set, set username to "Anonymous User"
export const getUsersnameFromMsg = async (msg) => {
    try {
        let username = "";
        if (!msg.from.first_name && !msg.from.username) {
            username = "Anonymous User"
        } else if (msg.from.first_name) {
            username = msg.from.first_name
        } else if (msg.from.username) {
            username = msg.from.username
        } else {
            username = "Anonymous User"
        }
        return username;
    } catch (err) {
        console.error(`[getUsersnameFromMsg] Caught Error: ${err}\n\n ${msg}`)
    }
}
