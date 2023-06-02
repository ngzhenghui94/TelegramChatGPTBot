
import axios from "axios"

export const queryStableDiffusion = async (data) => {
    console.log(data)
    const response = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1-base", {
        headers: { Authorization: "Bearer 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" },
        method: "POST",
        body: JSON.stringify(data),
    })
    const result = await response.blob();
    console.log(result)
    return result;
}