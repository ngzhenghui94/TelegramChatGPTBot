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
            requestInfo.subScriptionEndDate = requestInfo.subscriptionDate + 86400000
        } else if (amount == 1000) {
            requestInfo.subscriptionPackage = "Week"
            requestInfo.subScriptionEndDate = requestInfo.subscriptionDate + 604800000
        } else if (amount == 2500) {
            requestInfo.subscriptionPackage = "Month"
            requestInfo.subScriptionEndDate = requestInfo.subscriptionDate + 18144000000
        } else {
            requestInfo.subscriptionPackage = "Custom"
            requestInfo.subScriptionEndDate = requestInfo.subscriptionDate + (amount * 7257600)
        }
        console.log(JSON.stringify(requestInfo))
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return
    } catch (err) {
        console.log(err)
    }
}

export const removeUserFromSubscription = async (userId) => {
    try {
        console.log("Removing User from Sub - " + userId)
        const requestInfo = await getUserRequestInfo(userId);
        requestInfo.isSubscriber = false;
        requestInfo.subscriptionDate = null;
        requestInfo.subscriptionPackage = null;
        requestInfo.subScriptionEndDate = null;
        console.log(JSON.stringify(requestInfo))
        await redis.set(`user: ${userId}`, JSON.stringify(requestInfo));
        return
    } catch (err) {
        console.log(err)
    }
}

export const checkSubscription = async (msg) => {
    const userInfo = await getUserRequestInfo(msg.chat.id)
    if (userInfo.isSubscriber == true){
        const subDate = userInfo.subscriptionDate
        const subPackage = userInfo.subscriptionPackage
        const subEndDate = userInfo.subScriptionEndDate
        const timeDelta = Math.floor((subEndDate - Date.now())/1000)
        let returnMsg = ""
        if (timeDelta < 86400){
            returnMsg = (timeDelta / 60 / 60).toFixed(2) + " hours."
        } else if (timeDelta >= 86400) {
            returnMsg = (timeDelta / 60 / 60 /24).toFixed(2) + " days."
        }
        return {
            isSubscriber: true,
            msg: "Your current subscription expiries in: " + returnMsg
        }
    } else{
        return {
            isSubscriber: false,
            msg: "You do not have any active subscription."
        }
    }
}