import dotenv from "dotenv";
import Redis from "ioredis";
dotenv.config();

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client

// Helper function to get user request info from Redis
export const getUserRequestInfo = async (userId) => {
    let requestInfo = await redis.get(`user: ${userId}`);
    if (requestInfo) {
        requestInfo = JSON.parse(requestInfo);
    } else {
        requestInfo = { count: 0 };
    }
    return requestInfo;
};


export const getUsersnameFromMsg = async (msg) => {
    let username = "";
    if (msg.from.first_name){
        username = msg.from.first_name
    } else if (msg.from.username) {
        username = msg.from.username
    } else {
        username = "Anonymous User"
    }
    return username;
}