

// Check if the message is from a private chat
export const privateChatOnly = async (msg) => {
    try {
        if (msg.chat.type == "private") {
            return true
        } else {
            return false
        }
    } catch (err) {
        console.error(`[privateChatOnly] Caught Error: ${err}`)
    }
}