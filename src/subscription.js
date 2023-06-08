import { getUserRequestInfo } from "./userInfo.js";
import { Redis } from 'ioredis';
const redis = new Redis(process.env.REDIS_URL); // initialize Redis client 

export const addUserToSubscription = async (userId, amount) => {
    try {
        console.log("Adding User to Sub - " + userId)
        const requestInfo = await getUserRequestInfo(userId);
        requestInfo.isSubscriber = true;
        requestInfo.subscriptionDate = Date.now();
        if (amount == 500) {
            requestInfo.subscriptionPackage = "Day"
        } else if (amount == 1000) {
            requestInfo.subscriptionPackage = "Week"
        } else if (amount == 2500) {
            requestInfo.subscriptionPackage = "Month"
        }
        console.log(JSON.stringify(requestInfo))
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return
    } catch (err) {
        console.log(err)
    }
}