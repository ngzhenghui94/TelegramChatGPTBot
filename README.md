# TelegramChatGPTBot
1. Make sure you have NodeJS installed (https://nodejs.org/en).
2. Install the NodeJs Packages using this command:
```
npm install
```
3. Create a .env file in the following format.
```
APIKEY=""
TELEGRAMBOTAPIKEY=""
ADMINID=""
LOGAPIKEY=""
````
These keys are not included in the code as it is sensitive and different for everyone.
To obtain the first key (OpenAI API Key), login to your ChatGPT account via this URL (https://platform.openai.com/account/api-keys).
Create your own OpenAI Secret Key. Copy and paste that key to the .env file. Now your .env file should look like this:
```
APIKEY="ABCDEFGwf10231jhndwqkfewfewkflno12e1231"
TELEGRAMBOTAPIKEY=""
ADMINID=""
LOGAPIKEY=""
```
The next key is from Telegram. Open your Telegram App and talk to @BotFather (https://t.me/BotFather) to create a new bot. 
The @BotFather will issue you an API Key/Token. Copy and paste that key/token to the .env file. Now your .env file should look like this:
```
APIKEY="ABCDEFGwf10231jhndwqkfewfewkflno12e1231"
TELEGRAMBOTAPIKEY="6182194447:AAEKfXJryApepKvLulX4t2BCKJ8Od0evFtA"
ADMINID=""
LOGAPIKEY=""
```
5. Obtain your Telegram ID from this Telegram Bot -> https://t.me/userinfobot, paste your Telegram ID in the ADMINID variable
```
```
6. If you want to log the activities to track usage or debug, setup a 2nd Telegram Bot from @BotFather and obtain another API Key/Token. Paste the 2nd Telegram Bot Token in the LOGAPIKEY variable.
```
```
4. Run the following command to run the Telegram Bot.
```
node index.js
````

