# TelegramChatGPTBot
A Telegram bot that responds to queries with response from OpenAI/ChatGPT

# Features
* Responds to queries with response via OpenAI/ChatGPT.
* Rate-limiting tracked via in-mem Redis
* Paid Subscription Model

# Installation
1. Make sure you have NodeJS installed (https://nodejs.org/en).
2. Install the NodeJs Packages using this command:
```
npm install
```
3. Install Redis on your server (i.e Debian)
```
sudo apt install redis-server 
```
4. Create a .env file in the following format.
```
OPENAPIKEY=""
TELEGRAMBOTAPIKEY=""
ADMINID=""
LOGAPIKEY=""
TELESTRIPEKEY="" <-Obtain from BotFather -> Select your Telegram Bot -> Under Payment Tab, link STRIPE and get the API Key
HUGGINGFACEKEY="" <-Obtain from HuggingFace to use /image command to generate images
WHITELIST=1111111,2222222,33333333 <-Telegram User ID of whitelisted users (no rate limit)
BLACKLIST=4444444,5555555 <-Telegram User ID of blacklisted users (will not be able to use the bot)
````
These keys are not included in the code as it is sensitive and different for everyone.
To obtain the first key (OpenAI API Key), login to your ChatGPT account via this URL (https://platform.openai.com/account/api-keys).
Create your own OpenAI Secret Key. Copy and paste that key to the .env file.
The next key is from Telegram. Open your Telegram App and talk to @BotFather (https://t.me/BotFather) to create a new bot. 

The @BotFather will issue you an API Key/Token. Copy and paste that key/token to the .env file.
5. Obtain your Telegram ID from this Telegram Bot -> https://t.me/userinfobot, paste your Telegram ID in the ADMINID variable

6. If you want to log the activities to track usage or debug, setup a 2nd Telegram Bot from @BotFather and obtain another API Key/Token. Paste the 2nd Telegram Bot Token in the LOGAPIKEY variable.


4. Run the following command to run the Telegram Bot.
```
node index.js
````

