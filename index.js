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
require('dotenv').config()
process.env["NTBA_FIX_350"] = 1;

bot.setMyCommands([
    {command: '/start', description: 'начало регистрации'},
    {command: '/new', description: 'создание админа'},
    {command: '/admin', description: 'действия админа'},
])

bot.on('message', async function (msg) {
    const chatId = msg.from.id;
    const text = msg.text
    if (text === '/start') return start(msg)
    if (text === '/new') return createAdmin(msg, chatId)
    if (text === '/admin') return adminPanel(msg, chatId)
    if (text === '/search') return searchOrder(msg, chatId)

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
            return;
        }
        switch (msg.text) {
            case "Поиск заказа":
                var execution_order = await functions.getSql('execution_order', 'user_id=' + user.id);//поиск активных заказов
                if (execution_order.length > 0) {
                    let order = await functions.getSql('orders', 'id=' + execution_order[0].order_id);
                    bot.sendMessage(chatId, "Сначала завершите задание:\n\n<b>" + order[0].title + "</b>\n\n" + order[0].description, options.default);
                    return;
                }
                var messages = await functions.getSql('finedOrder', 'chat_id=' + chatId);
                if (messages.length > 0) {//удаление сообщения
                    bot.deleteMessage(chatId, messages[0].message_id);
                    db.query("DELETE FROM `finedOrder` WHERE chat_id=" + chatId);
                }
                console.log("menu");

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
                    bot.sendMessage(chatId, "Ваше задание:\n\n<b>" + order[0].title + "</b>\n\n" + order[0].description, options.default);
                    return;
                }
                break;
            case"Настройки":
                const result = await functions.getSql("vehicles", "digits='" + user.digits + "'");
                const {vendor, model, model_year, kind, color} = result[0]
                let vehicleInfo = "\n\n<i>Информация о ТС:</i> \nМодель: <b>" + vendor + " " + model + " " + model_year + "</b>\nТип: <b>" + kind + "</b>\nЦвет: <b>" + color + "</b>";
                const photo = user.photo
                await bot.sendPhoto(chatId, photo, {parse_mode: "HTML", caption: vehicleInfo})
                await bot.sendMessage(chatId, "<b>Настройки</b>", JSON.parse(JSON.stringify({
                    ...options.settings,
                    chat_id: chatId
                })));
                return
                break;
            default:
                return bot.sendMessage(chatId, "<b>Главное меню</b>", options.mainMenu);
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
        const func =  callbacks[entry]
        await func(msg,chatId)

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
    if (chatId == '287363909') {
        db.query("INSERT INTO `admins`(`link`) VALUES ('" + sha1(Math.random()) + "')");
        const newOrg = await functions.getSql("admins", "user_id is NULL");
        let txt = "";
        for (let i = 0; i < newOrg.length; i++) {
            txt += (i + 1) + ". https://t.me/SvoiLogisticsBot?start=" + newOrg[i].link + "\n";
        }
        bot.sendMessage(chatId, txt);
    }
}

async function adminPanel(msg, chatId) {
    const user = await functions.getUser(msg);
    if (user.admin) {
        const inline_keyboard = [];
        inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
        inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
        inline_keyboard.push([{text: "Отправиь задание", callback_data: "sendOrder_"}]);
        inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);

        const result = {
            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.sendMessage(chatId, "<b>Что вас интересует?</b>", result)
    }
}

async function searchOrder(msg, chatId) {
    const user = await functions.getUser(msg);
    const verify = await functions.verifyUser(user);
    if (!verify) return

    let finedOrder = await functions.getSql("finedOrder", "chat_id = " + chatId)//ищет пользователся в поиске
    let rangeRegions = JSON.parse(finedOrder[0].region_id)//выбранные регионы

    const sql = `SELECT * FROM orders_regions , orders
                 WHERE orders_regions.status=1 and orders.status=1
                 AND orders.id =orders_regions.order_id and FIND_IN_SET(orders_regions.region_id, '${rangeRegions}')`
    const orders = await functions.querySQL(sql)//формируем запросы на заказы по заданным регионам
    let inline_keyboard = [];
    for (var i = 0; i < orders.length; i++) {
        inline_keyboard.push([{text: orders[i].title, callback_data: "order_" + orders[i].id}]);//делаем кнопки по регионам
    }
    inline_keyboard.push([{text: "❌Отстановить поиск❌", callback_data: "stop_"}]);

    let setStatusInProcess = `UPDATE finedOrder
                              SET status = '1'
                              WHERE chat_id = '${chatId}' `;
    await db.query(setStatusInProcess)//меняем статус пользователя  на активный

    let text = "<b>Поиск заданий</b>\nРайон(-ы):"
    if (orders.length > 0)
        text += "\n\nИли выберете из списка ниже:";
    let result = {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.sendMessage(chatId, text, result)
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
        const response = await axios.get(url, {headers: {"Accept": "application/json", "X-Api-Key": process.env.GAI_KEY}})
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
        await bot.deleteMessage(chatId, msg.message_id)
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
            bot.sendMessage(user.chat_id, "<b>Регистрация завершена, можете начать поиск</b>", options.mainMenu);
        }
    } catch (err) {
        console.log('[ERROR]', err)
        bot.sendMessage(user.chat_id, "<b>Что-то пошло не так , повторите попытку снова</b>", options.default);
        return false
    }
}