import { getUserRequestInfo } from "./userInfo.js";
import { Redis } from 'ioredis';
import { mongoClient, mongoDbName, mongoDbCollection } from "./mongodb.js"
import { getUsersnameFromMsg } from "./userInfo.js"
import moment from "moment-timezone"

const redis = new Redis(process.env.REDIS_URL); // initialize Redis client 

export const addUserToSubscription = async (msg, amount) => {
    try{    
        let userId = msg.chat.id
        let userName = await getUsersnameFromMsg(msg)
        console.log("Adding User as subscriber - " + userName)
        let subObj = {}
        subObj.username = userName
        subObj.userId = parseInt(userId)
        subObj.isSubscriber = true
        subObj.subscriptionDate = Date.now();
        subObj.subscriptionDateParsed = moment(Date.now()).format("DD/MMM/YYYY HH:mm");
        if (amount == 1098) {
            subObj.subscriptionPackage = "Month"
            subObj.subScriptionEndDate = subObj.subscriptionDate + 2592000000
        
        } else if (amount == 9800) {
            subObj.subscriptionPackage = "Week"
            subObj.subScriptionEndDate = subObj.subscriptionDate + 31104000000
        } else {
            subObj.subscriptionPackage = "Custom"
            subObj.subScriptionEndDate = subObj.subscriptionDate + (amount * 2360655)
        }
        subObj.subScriptionEndDateParsed = moment(subObj.subScriptionEndDate).format("DD/MMM/YYYY HH:mm");
        await mongoClient.connect();
        await mongoClient.db(mongoDbName).collection(mongoDbCollection).updateOne(
            { "userId": parseInt(userId) }, 
            { $set: subObj }, 
            { upsert: true });
        await mongoClient.close();
        return;
    } catch (err) {
        console.log(err);
    }
};


export const addUserToSubscriptionById = async (userId, amount) => {
    try{    
        console.log("Adding User as subscriber by ID - " + userId)
        let subObj = {}
        subObj.username = "Manually Added"
        subObj.userId = parseInt(userId)
        subObj.isSubscriber = true
        subObj.subscriptionDate = Date.now();
        subObj.subscriptionDateParsed = moment(Date.now()).format("DD/MMM/YYYY HH:mm");
        if (amount == 1098) {
            subObj.subscriptionPackage = "Month"
            subObj.subScriptionEndDate = subObj.subscriptionDate + 2592000000
        
        } else if (amount == 9800) {
            subObj.subscriptionPackage = "Week"
            subObj.subScriptionEndDate = subObj.subscriptionDate + 31104000000
        } else {
            subObj.subscriptionPackage = "Custom"
            subObj.subScriptionEndDate = subObj.subscriptionDate + (amount * 2360655)
        }
        subObj.subScriptionEndDateParsed = moment(subObj.subScriptionEndDate).format("DD/MMM/YYYY HH:mm");
        await mongoClient.connect();
        await mongoClient.db(mongoDbName).collection(mongoDbCollection).updateOne(
            { "userId": parseInt(userId) }, 
            { $set: subObj }, 
            { upsert: true });
        await mongoClient.close();
        return;
    } catch (err) {
        console.log(err);
    }
};

export const removeUserFromSubscription = async (userId) => {
    try {
        console.log("Removing User from Sub - " + userId);
        await mongoClient.connect();
        const result = await mongoClient.db(mongoDbName).collection(mongoDbCollection).deleteOne(
            { "userId": parseInt(userId) });
        await mongoClient.close();
        console.log(`Deleted ${result.deletedCount} item.`)
        return;
    } catch (err) {
        console.log(err);
    }
};

export const getUserSubscription = async (userId) => {
    try{
        await mongoClient.connect()
        const result = await mongoClient.db(mongoDbName).collection(mongoDbCollection).findOne({
            "userId": parseInt(userId)
        })
        console.log(result)
        await mongoClient.close()
        return result;
    }catch (err){
        console.log(err)
    }
}

export const checkSubscription = async (userId) => {
    try{
        const subscriptionInfo = await getUserSubscription(parseInt(userId))
        if (subscriptionInfo && subscriptionInfo.isSubscriber == true){
            const subEndDate = subscriptionInfo.subScriptionEndDate
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
    } catch (err) {
        console.log(err)
        return {
            isSubscriber: false,
            msg: "You do not have any active subscription."
        }
    }

}