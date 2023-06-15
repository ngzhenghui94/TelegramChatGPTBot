import dotenv from "dotenv";
dotenv.config();

let huggingFaceToken = process.env.HUGGINGFACEKEY;

export const queryStableDiffusion = async (data) => {
    try {
        const response = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1-base", {
            headers: { Authorization: `Bearer ${huggingFaceToken}` },
            method: "POST",
            body: JSON.stringify(data),
        })
        const result = await response.blob();
        return result;
    } catch (err) {
        console.err(`[queryStableDiffusion] Caught Error: ${e}`)
    }
}
