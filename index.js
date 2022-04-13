const mysql = require('mysql')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const helpers = require('./helpers')
const options = require('./options')
const {bot} = require('./bot')
const callbacks = require('./callbacks')
const functions = require('./functions')
const db = require('./init_db')();
const sha1 = require('sha1');
const {querySQL} = require("./functions");
require('dotenv').config()
process.env["NTBA_FIX_350"] = 1;

bot.setMyCommands([
    {command: '/start', description: 'Начало'},
    {command: '/admin', description: 'Действия админа'},
])

bot.on('message', async function (msg) {
    const chatId = msg.from.id;
    const text = msg.text
    if (text === '/start') return start(msg)
    if (text === '/admin') return adminPanel(msg, chatId)
    if (text && text.includes("_") && text.split("_")[0] === '/new') return createAdmin(msg, chatId)
    let user = await functions.getUser(msg);

    if (!user.admin && !user.phone) {//запись контактов шаг 2
        if (helpers.validatePhoneNumber(msg, chatId)) {
            user = await savePhone(msg, user, chatId)//добавили поле у пользователя
            await functions.verifyUser(user);
        }

    } else if (!user.admin && !user.digits) {//Запись данных автомобиля шаг 3

        if (helpers.validateDigits(msg, chatId)) {
            user = await saveDigits(msg, user, chatId)
            user && await functions.verifyUser(user)
        }

    } else if (!user.admin && !user.photo) {//добавить фото автомобиля

        if (msg.photo || msg.document) {
            await saveImage(msg, user, chatId)
        }

    } else { //если не регистрация , шаг 4+
        try {
            bot.deleteMessage(chatId, msg.message_id);//удаления текста который писал пользователь чтобы не засорять чат
            if (user.admin) {
                let order = await functions.getSql('orders', '(title is null or description is null) and user_id=' + user.id);
                if (order && order.length > 0) {//условие для админов если создан заказ но нет описания или названия
                    order = order[0];
                    if (!order.title) {
                        if (helpers.validateOrderTitle(msg, chatId, order)) {
                            await functions.saveOrderTitle(msg, chatId, order)
                        }
                    } else if (!order.description) {
                        if (helpers.validateOrderDesc(msg, chatId, order)) {
                            await functions.saveOrderDesc(msg, chatId, order)
                        }
                    }
                }
            }
            if ((msg.photo || msg.document) && !user.admin) {// если пользователь хочет завершить задание
                let condition = `SELECT * from execution_order
                                WHERE chat_id = '${chatId}' and status = 2 `
                let execution_order = await querySQL(condition)
                if (execution_order.length) {
                    execution_order = execution_order[0]
                    const {order_id} = execution_order
                    condition = `SELECT * from orders 
                            WHERE id = '${order_id}'`
                    let order = await querySQL(condition)
                    order = order[0]
                    condition = `SELECT  * from users 
                            WHERE id = ${order.user_id}`
                    let logist = await querySQL(condition)
                    logist = logist[0]
                    let biggestImage = null
                    if (msg.photo) {
                        biggestImage = msg.photo[msg.photo.length - 1]
                        await bot.sendPhoto(logist.chat_id, biggestImage.file_id, {
                            parse_mode: "HTML",
                            caption: "<b>✅Водитель завершил задание </b> \n<b>Задание</b>:"+order.title+"\n<b>Описание</b>:"+order.description+"\n<b>Исполнитель:</b>"+user.name+"\n<b>Телефон:</b>"+user.phone
                        })
                    } else if (msg.document) {
                        biggestImage = msg.document.file_id
                        await bot.sendDocument(logist.chat_id, biggestImage, {
                            parse_mode: "HTML",
                            caption: "<b>✅Водитель завершил задание </b> \n<b>Задание</b>:"+order.title+"\n<b>Описание</b>:"+order.description+"\n<b>Исполнитель:</b>"+user.name+"\n<b>Телефон:</b>"+user.phone
                        })
                    }
                    db.query("UPDATE `orders` SET status=3 WHERE id=" + order.id);
                    db.query("DELETE FROM `execution_order` WHERE order_id=" + order.id);
                    db.query("INSERT INTO `orders_end`(`id_user`, `order_id`) VALUES (" + user.id + "," + order.id + ")");
                    bot.sendMessage(chatId, "<b>" + order.title + "</b>\n\n" + order.description + "\n\nЗадание завершено ✅", options.mainMenu)
                }
            }
        } catch (err) {
            console.log(err)
        }


        switch (text) {
            case "Поиск заказа":
                const checkOrders =await functions.querySQL(`SELECT * FROM orders`)
                if(!checkOrders.length){
                return  bot.sendMessage(chatId, "😴<b>Корзина заказов пуста</b>",options.mainMenu);
                }
                var execution_order = await functions.getSql('execution_order', 'user_id=' + user.id);//поиск активных заказов
                if (execution_order.length > 0) {
                    let order = await functions.getSql('orders', 'id=' + execution_order[0].order_id);
                    bot.sendMessage(chatId, "Сначало завершите задание:\n\n<b>" + order[0].title + "</b>\n\n" + order[0].description, options.mainMenu);
                    return;
                }
                let messages = await functions.getSql('finedOrder', 'chat_id=' + chatId);
                if (messages.length > 0) {//удаление сообщения
                    bot.deleteMessage(chatId, messages[0].message_id);
                    db.query("DELETE FROM `finedOrder` WHERE chat_id=" + chatId);
                }

                let deleteChoosedRegions = `UPDATE finedOrder
                         SET region_id = '[]' 
                         WHERE chat_id = '${chatId}' `;
                await db.query(deleteChoosedRegions)

                await functions.findOrder(chatId);//если нет активных заказов предлагаем найти заказ
                break;
            case "Просмотр задания":
                var execution_order = await functions.getSql('execution_order', 'user_id=' + user.id);
                if (execution_order.length > 0) {
                    let order = await functions.getSql('orders', 'id=' + execution_order[0].order_id);

                    bot.sendMessage(chatId, `Ваше задание: \n<b>Название</b> ${order[0].title} \n<b>Описание</b> ${order[0].description}`, options.mainMenu);
                    return;
                }
                break;
            case"Настройки":
                const result = await functions.getSql("vehicles", "digits='" + user.digits + "'");
                const {vendor, model, model_year, kind, color} = result[0]
                let vehicleInfo = "\n\n<b>Информация о ТС:</b> \nМодель: <b>" + vendor + " " + model + " " + model_year + "</b>\nТип: <b>" + kind + "</b>\nЦвет: <b>" + color + "</b>";
                const photo = user.photo
                await bot.sendPhoto(chatId, photo, {parse_mode: "HTML", caption: vehicleInfo})
                await bot.sendMessage(chatId, "<b>Настройки</b>", JSON.parse(JSON.stringify({
                    ...options.settings,
                    chat_id: chatId
                })));

                return
                break;
            case "Мои задания":
                var execution_order = await functions.getSql('execution_order', 'user_id=' + user.id);
                if (execution_order.length > 0) {
                    let order = await functions.getSql('orders', 'id=' + execution_order[0].order_id);
                    completeOrder = {
                        parse_mode: "HTML",
                        reply_markup: JSON.stringify({
                            one_time_keyboard: true,
                            inline_keyboard: [
                                [{
                                    text: '✅ Завершить задание',
                                    callback_data: `completeOrder_` + order[0].id + "_" + user.id
                                },
                                    {text: '🔙 Назад', callback_data: 'backToMenu_'}],
                            ]
                        })
                    }
                    bot.sendMessage(chatId, `Ваше задание: \n<b>Название</b> : ${order[0].title} \n<b>Описание</b> : ${order[0].description}`, completeOrder);
                    return;
                } else {
                    bot.sendMessage(chatId, "<b>У вас пока нет заданий</b>", options.mainMenu)
                }
                return
                break;
            default:
                // return bot.sendMessage(chatId, "<b>Главное меню</b>", options.mainMenu);
                break;
        }

    }

});

var callback_query_click = [];
bot.on('callback_query', async function (msg) {
    let answerCallback = {};
    const chatId = msg.message.chat.id;

    if (callback_query_click[chatId]) {
        bot.answerCallbackQuery(msg.id, answerCallback);
        return;
    }
    setTimeout(function () {
        callback_query_click[chatId] = false;
    }, 5 * 1000);//от повторных кликов

    callback_query_click[chatId] = true;
    const entry = msg.data.split("_")[0]
    const func = callbacks[entry]
    await func(msg, chatId)

    callbackEnd(chatId, msg.id, answerCallback);
    return;
});

function callbackEnd(chatId, id, answerCallback = {}) {
    callback_query_click[chatId] = false;
    bot.answerCallbackQuery(id, answerCallback);//обязательный ответ в телеграмме
}

async function start(msg) {
    const user = await functions.getUser(msg);

    const res = await functions.verifyUser(user);
    if (res) {
        bot.sendMessage(user.chat_id, "<b>Главное меню</b>", options.mainMenu);
    }
}

async function createAdmin(msg, chatId) {
    try {
    const command = msg.text.split("_")[0]
    let digits = msg.text.split("_")[1]
    const accessPermissions = ['464824652', '131861501','587094194']
    const sha = sha1(String(digits + "_" + Math.random()*100))

        if (!digits) return bot.sendMessage(chatId, "Вы не указали номер")
        digits = helpers.toENG(digits)
        let sql = `SELECT * FROM users
               WHERE digits = '${digits}'`
        let user = await functions.querySQL(sql)
        if (!user.length) {
            bot.sendMessage(chatId, "Пользователь не найден")
        }
        user = user[0]
        sql = `SELECT * FROM admins
               WHERE user_id='${user.id}'`
        const res = await functions.querySQL(sql)
        if(res.length){
          return   bot.sendMessage(chatId,'Такой пользователь уже существует')
        }
        if (accessPermissions.find(item => chatId == item)) {
            sql = `INSERT INTO admins (link , user_id ,status)  VALUES('${sha}' ,'${user.id}', '1')`
            db.query(sql);
            return bot.sendMessage(chatId, "✅ <b>Успешно создан</b>",options.default);
        }else{
            return bot.sendMessage(chatId , "<b>У вас недостаточно прав</b>",options.default)
        }
    } catch (err) {
        console.log(err)
        bot.sendMessage(chatId, "❌ Произошла ошибока")
    }

}

async function adminPanel(msg, chatId) {
    const user = await functions.getUser(msg);
    if (user.admin) {
        const inline_keyboard = [];
        inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
        inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
        inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);

        const result = {
            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.sendMessage(chatId, "<b>Что вас интересует?</b>", result)
    }
}

async function savePhone(msg, user, chatId) {

    if (msg.contact) {
        db.query("UPDATE `users` SET phone='" + msg.contact.phone_number + "' WHERE chat_id=" + chatId);
        user.phone = msg.contact.phone_number;
    } else {
        user.phone = msg.text;
        db.query("UPDATE `users` SET phone=" + mysql.escape(msg.text) + " WHERE chat_id=" + chatId);
    }
    return user
}

async function saveDigits(msg, user, chatId) {
    let url = "https://baza-gai.com.ua/nomer/" + helpers.toENG(msg.text);

    try {
        const response = await axios.get(url, {
            headers: {
                "Accept": "application/json",
                "X-Api-Key": process.env.GAI_KEY
            }
        })
        console.log(response)
        if (response.status === 200 && response.data) {
            console.log("auto found");
            const {digits, model, model_year, vendor, operations} = response.data
            await db.query("UPDATE `users` SET digits=" + mysql.escape(digits) + " WHERE chat_id=" + chatId);
            let vehicle = await functions.getSql('vehicles', 'digits=' + mysql.escape(digits));
            if (vehicle.length <= 0) {
                await db.query("INSERT INTO `vehicles`(`digits`, `vendor`, `model`, `model_year`, `kind`, `color`) VALUES (" + mysql.escape(digits) +
                    "," + mysql.escape(vendor) +
                    "," + mysql.escape(model) +
                    "," + mysql.escape(model_year) +
                    "," + mysql.escape(operations[0].kind.ua) +
                    "," + mysql.escape(operations[0].color.ua) + ")");
            }
            user.digits = digits;
            return user
        }
    } catch (err) {
        console.log('[ERROR]', err);
        await bot.sendMessage(user.chat_id, "Транспорт с номерным знаком: <b>" + msg.text + "</b> не найден.", options.default);
        // await bot.sendMessage(msg.chat.id, "<b>Повторите попытку или заполните форму</b>", options.fillForm)
        return false
    }
}

async function saveImage(msg, user, chatId) {
    try {
        let type = ''
        let biggestImage = null

        if (msg.photo) {
            biggestImage = msg.photo[msg.photo.length - 1]
            type = 'photo'
        } else if (msg.document) {
            biggestImage = msg.document.thumb
            type = 'document'
        }
        if (!biggestImage) return

        const fileName = await functions.uploadLocalImage(biggestImage)//сохраняем локальнo и получаем название файла
        const location = await functions.uploadToS3(fileName, chatId)
        let sql = `UPDATE users
                   SET photo = '${location}'
                   WHERE chat_id = '${chatId}'`;
        db.query(sql)//сохраняем ссылку на image в бд
        fs.unlinkSync(path.join('public', 'images', `${fileName}`))

        const condition = `SELECT vehicles.vendor ,
                                          vehicles.model ,
                                          vehicles.model_year ,
                                          vehicles.color ,
                                          vehicles.kind
                                   FROM users, vehicles
                                   WHERE users.digits=vehicles.digits and users.chat_id='${chatId}'`
        const userVehicle = await functions.querySQL(condition)
        const {vendor, model, model_year, color, kind} = userVehicle[0]
        await bot.sendMessage(user.chat_id, "Ваш транспорт:<b>" +
            "</b>\nТип: <b>" +
            kind +
            "</b>\nЦвет: <b>" +
            color +
            "</b>", {parse_mode: "HTML"});

        if (type === 'photo') await bot.sendPhoto(chatId, biggestImage.file_id, {
            parse_mode: "HTML",
            caption: "<b>" + vendor + " " + model + " " + model_year + "</b>"
        })
        if (type === 'document') await bot.sendDocument(chatId, msg.document.file_id, {
            parse_mode: "HTML",
            caption: "<b>" + vendor + " " + model + " " + model_year + "</b>"
        })

        user.photo = fileName

        if (await functions.verifyUser(user)) {
            bot.sendMessage(user.chat_id, "<b>🎉Регистрация завершена, можете начать поиск</b>", options.mainMenu);
        }
    } catch (err) {
        console.log('[ERROR]', err)
        bot.sendMessage(user.chat_id, "<b>Что-то пошло не так , повторите попытку снова</b>", options.default);
        return false
    }
}