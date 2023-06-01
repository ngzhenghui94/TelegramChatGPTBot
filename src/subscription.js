import mysql from "mysql2"
import moment from "moment-timezone";

const connection = mysql.createConnection({
    database: "telesubscription",
    user: "root",
    password: "root",
    port: 11115,
})

export const addChatId = async (chatId) => {
    let now = moment().unix()
    try {

        connection.execute(`INSERT INTO subscriptions (teleid, dateadded) VALUES (${chatId}, ${now})`, async (res) => {
            console.log(await res)
        })

        return
    } catch (e) {
        console.log(e)
    }
}