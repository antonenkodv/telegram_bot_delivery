const TelegramBot = require("node-telegram-bot-api");
require('dotenv').config()
const token = "5172791238:AAHOt_TTbcinTONWun3vSlfe-6uuLJrlT0E" ;//SvoiLogistics

const bot = new TelegramBot(token, {
    polling: true,
    filepath: false,
});

module.exports={bot}