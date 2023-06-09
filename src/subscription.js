import { mongoClient, mongoDbName, mongoDbCollection } from "./mongodb.js"
import { getUsersnameFromMsg } from "./userInfo.js"
import moment from "moment-timezone"

export const createSubscriptionObject = async (userId, msg, amount) => {
    try {
        const userName = await getUsersnameFromMsg(msg);
        const subscriptionDate = Date.now();
        let subObj = {
            username: userName,
            userId: parseInt(userId),
            isSubscriber: true,
            subscriptionDate: subscriptionDate,
            subscriptionDateParsed: moment(subscriptionDate).format("DD/MMM/YYYY HH:mm"),
            subscriptionEndDate: null,
            subscriptionEndDateParsed: null,
            subscriptionPackage: null
        };
        const subscriptionTimes = {
            1098: 2629800000,
            9800: 31556926000,
            default: amount * 2629800
        };
        subObj.subscriptionPackage = (amount == 1098 ? "Month" : (amount == 9800 ? "Year" : "Custom"));
        subObj.subscriptionEndDate = subscriptionDate + (subscriptionTimes[amount] || subscriptionTimes.default);
        subObj.subscriptionEndDateParsed = moment(subObj.subscriptionEndDate).format("DD/MMM/YYYY HH:mm");
        await mongoClient.connect();
        await mongoClient.db(mongoDbName).collection(mongoDbCollection).updateOne(
            { "userId": parseInt(userId) },
            { $set: subObj },
            { upsert: true });
        await mongoClient.close();
        return;
    } catch (err) {
        console.error(`[createSubscriptionObject] Caught Error: ${err}`)
    }
}


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
        console.error(`[removeUserFromSubscription] Caught Error: ${err}`)
    }
};

export const getUserSubscription = async (userId) => {
    try {
        await mongoClient.connect()
        const result = await mongoClient.db(mongoDbName).collection(mongoDbCollection).findOne({
            "userId": parseInt(userId)
        })
        // console.log(result)
        await mongoClient.close()
        return result;
    } catch (err) {
        console.error(`[getUserSubscription] Caught Error: ${err}`)
    }
}

export const checkSubscription = async (userId) => {
    try {
        const subscriptionInfo = await getUserSubscription(parseInt(userId))
        if (subscriptionInfo && subscriptionInfo.isSubscriber == true) {
            const subEndDate = subscriptionInfo.subscriptionEndDate
            const timeDelta = Math.floor((subEndDate - Date.now()) / 1000)
            let returnMsg = ""
            if (timeDelta < 86400) {
                returnMsg = (timeDelta / 60 / 60).toFixed(2) + " hours."
            } else if (timeDelta >= 86400) {
                returnMsg = (timeDelta / 60 / 60 / 24).toFixed(2) + " days."
            }
            return {
                isSubscriber: true,
                msg: "Your current subscription expiries in: " + returnMsg
            }
        } else {
            return {
                isSubscriber: false,
                msg: "You do not have any active subscription."
            }
        }
    } catch (err) {
        console.error(`[checkSubscription] Caught Error: ${err}`)
        return {
            isSubscriber: false,
            msg: "You do not have any active subscription."
        }
    }

}

export const setSubscriptionState = async (userId, state) => {
    try {
        await mongoClient.connect();
        let subObj = {};
        subObj.isSubscriber = state;
        const result = await mongoClient.db(mongoDbName).collection(mongoDbCollection).updateOne(
            { "userId": parseInt(userId) },
            { $set: subObj });
        await mongoClient.close();
        return result;
    } catch (err) {
        console.error(`[setSubscriptionState] Caught Error: ${err}`)
    }
}

export const getAllSubscription = async () => {
    try {
        await mongoClient.connect();
        const result = await mongoClient.db(mongoDbName).collection(mongoDbCollection).find({}).toArray();
        await mongoClient.close();
        return result;
    } catch (err) {
        console.error(`[getAllSubscription] Caught Error: ${err}`)
    }
}