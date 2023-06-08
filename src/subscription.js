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

export const checkSubscription = async (msg) => {
    const userInfo = await getUserRequestInfo(msg.chat.id)
    if (userInfo.isSubscriber == true){
        const subDate = userInfo.subscriptionDate
        const subPackage = userInfo.subscriptionPackage
        let expiryDate;
        if (subPackage == "Day"){
            expiryDate = subDate + 86400000 
        }else if(subPackage == "Week"){
            expiryDate = subDate + 604800000
        }else if(subPackage == "Month"){
            expiryDate = subDate + 18144000000
        }
        const timeDelta = Math.floor((expiryDate - Date.now())/1000)
        let returnMsg = ""
        if (timeDelta < 86400){
            returnMsg = (timeDelta / 60 / 60) + " hours."
        } else if (timeDelta >= 86400) {
            returnMsg = (timeDelta / 60 / 60 /24) + " days."
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