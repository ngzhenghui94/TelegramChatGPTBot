# TelegramChatGPTBot
A Telegram bot that responds to queries with response from OpenAI/ChatGPT

# Features
* Responds to queries with response via OpenAI/ChatGPT.
* Rate-limiting tracked via in-memory Redis
* Paid Subscription Model tracked via MongoDB
* Intelligent Prompts

# Demo
https://web.telegram.org/k/#@Tg_OpenAi_GPT_Bot
<p>
    <img src="./demo.gif"/>
</p>

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
4. Create an account and database on MongoDB
```
mongodb.com
```
6. Rename the .env.example file to .env
```
OPENAPIKEY=""
TELEGRAMBOTAPIKEY=""
ADMINID=""
LOGAPIKEY=""
TELESTRIPEKEY="" <-Obtain from BotFather -> Select your Telegram Bot -> Under Payment Tab, link STRIPE and get the API Key
HUGGINGFACEKEY="" <-Obtain from HuggingFace to use /image command to generate images
WHITELIST=1111111,2222222,33333333 <-Telegram User ID of whitelisted users (no rate limit)
BLACKLIST=4444444,5555555 <-Telegram User ID of blacklisted users (will not be able to use the bot)
MONGODBURI = "mongodb+srv://<username>:<password>@<url>/?retryWrites=true&w=majority" # replace with your MongoDB URI
MONGODBNAME = "" # MongoDB Database Name
MONGODBCOLLECTION = "" MongoDB Collection Name
RATELIMITQNS = 10 # number of req before ratelimit kicks in.
RAETLIMITTIMER = 20 # in minutes
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

