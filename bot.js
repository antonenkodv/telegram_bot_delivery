const TelegramBot = require("node-telegram-bot-api");
require('dotenv').config()
const token = process.env.TG_TOKEN || '5139671689:AAFvA6HncyBNIQrfbTMTvWDSgUREepfyx2Y';//SvoiLogistics

const bot = new TelegramBot(token, {
    polling: true,
    filepath: false,
});

module.exports={bot}