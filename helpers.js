const {bot} = require('./bot.js')
module.exports = {

    toENG(text) {
        text = text.toUpperCase();
        let eng = {
            'А': 'A',
            'В': 'B',
            'Е': 'E',
            'К': 'K',
            'Н': 'H',
            'Р': 'P',
            'С': 'C',
            'Т': 'T',
            'І': 'I',
            'М': 'M',
            'О': 'O',
            'Х': 'X'
        };

        for (let i in eng) {
            text = text.replace(new RegExp(i, 'g'), eng[i]);
        }
        return text;
    },
    validatePhoneNumber(msg,chatId){
        if (!msg.contact && !msg.text.match(/^\+380\d{3}\d{2}\d{2}\d{2}$/)) {
            let result = {
                parse_mode: "HTML",
                reply_markup: JSON.stringify({
                    keyboard: [
                        [{
                            text: "Поделится контактом",
                            request_contact: true
                        }]
                    ]
                })
            };
            bot.sendMessage(chatId, "Не верный формат, отправьте номер телефона в вормате: <b>+380xxxxxxxxx</b>\nИли поделитесь контактом", result);
            return false
        }
        return true
    },
    validateDigits(msg,chatId){
        if (msg.text.length > 8) {
             bot.sendMessage(chatId, "Не верный формат, номер не может быть длиннее 8-ми символов", {parse_mode:"HTML"});
             return false
        }
        return true
    },
    validateOrderTitle(msg,chatId,order){
        if (msg.text.length > 35) {
            let result = {
                chat_id: chatId,
                message_id: order.message_id,
                parse_mode: "HTML"
            };
            bot.editMessageText("Введите название задания <b>до 35 символов</b>\nИспользовано: <b>" + msg.text.length + "</b> символов ", result);
            return false
        }
        return true
    },
    validateOrderDesc(msg,chatId,order){
        if (msg.text.length > 700) {
            var result = {
                chat_id: chatId,
                message_id: order.message_id,
                parse_mode: "HTML"
            };
            bot.editMessageText("Введите описание задания <b>до 700 символов</b>\nИспользовано: <b>" + msg.text.length + "</b> символов ", result);
            return false
        }
        return true
    }
}