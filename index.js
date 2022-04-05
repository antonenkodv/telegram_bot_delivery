const mysql = require('mysql')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const helpers = require('./helpers')
const options = require('./options')
const {bot} = require('./bot')
const sha1 = require('sha1');
const promisify = require('util').promisify;
require('dotenv').config()
const {DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE, GAI_KEY} = process.env

let key = GAI_KEY;// ключ от базы он на 1000 проверок
let mysqlInfo = {
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_DATABASE,
    charset: 'utf8mb4_general_ci'
};
const aws = {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    region: process.env.REGION
}
let AWS = require('aws-sdk');
AWS.config.setPromisesDependency();
AWS.config.update(aws)
const s3 = new AWS.S3()


process.env["NTBA_FIX_350"] = 1;

function handleDisconnect() {
    db = mysql.createConnection(mysqlInfo); // Recreate the connection, since // the old one cannot be reused
    db.connect(function (err) { // The server is either down
        if (err) { // or restarting (takes a while sometimes).
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
        } // to avoid a hot loop, and to allow our node script to
    }); // process asynchronous requests in the meantime.
    // If you're also serving http, display a 503 error.
    db.on('error', function (err) {
        console.log('db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
            handleDisconnect(); // lost due to either server restart, or a
        } else { // connnection idle timeout (the wait_timeout
            throw err; // server variable configures this)
        }
    });
}

handleDisconnect();

bot.setMyCommands([
    {command: '/start', description: 'начало регистрации'},
    {command: '/new', description: 'создание админа'},
    {command: '/admin', description: 'действия админа'},
])

bot.on('message', async function (msg, match) {
    const chatId = msg.from.id;
    const text = msg.text
    if (text === '/start') return start(msg)
    if (text === '/new') return createAdmin(msg, chatId)
    if (text === '/admin') return adminPanel(msg, chatId)
    if (text === '/search') return searchOrder(msg, chatId)

    let user = await getUser(msg);

    if (!user.admin && !user.phone) {//запись контактов шаг 2

        if (helpers.validatePhoneNumber(msg, chatId)) {
            user = await savePhone(msg, user, chatId)//добавили поле у пользователя
            await verifyUser(user);
        }

    } else if (!user.admin && !user.digits) {//Запись данных автомобиля шаг 3

        if (helpers.validateDigits(msg, chatId)) {
            user = await saveDigits(msg, user, chatId)
            user && await verifyUser(user)
        }

    } else if (!user.admin && !user.photo) {//добавить фото автомобиля

        if (msg.photo || msg.document) {
            await saveImage(msg, user, chatId)
        }

    } else { //если не регистрация , шаг 4+

        bot.deleteMessage(chatId, msg.message_id);//удаления текста который писал пользователь чтобы не засорять чат
        if (user.admin) {
            let order = await getSql('orders', '(title is null or description is null) and user_id=' + user.id);
            if (order && order.length > 0) {//условие для админов если создан заказ но нет описания или названия
                order = order[0];
                if (!order.title) {
                    if (helpers.validateOrderTitle(msg, chatId, order)) {
                        await saveOrderTitle(msg, chatId, order)
                    }
                } else if (!order.description) {
                    if (helpers.validateOrderDesc(msg, chatId, order)) {
                        await saveOrderDesc(msg, chatId, order)
                    }
                }
            }
            return;
        }
        switch (msg.text) {
            case "Поиск заказа":
                var execution_order = await getSql('execution_order', 'user_id=' + user.id);//поиск активных заказов
                if (execution_order.length > 0) {
                    let order = await getSql('orders', 'id=' + execution_order[0].order_id);
                    bot.sendMessage(chatId, "Сначала завершите задание:\n\n<b>" + order[0].title + "</b>\n\n" + order[0].description, options.default);
                    return;
                }
                var messages = await getSql('finedOrder', 'chat_id=' + chatId);
                if (messages.length > 0) {//удаление сообщения
                    bot.deleteMessage(chatId, messages[0].message_id);
                    db.query("DELETE FROM `finedOrder` WHERE chat_id=" + chatId);
                }
                console.log("menu");

                let deleteChoosedRegions = `UPDATE finedOrder
                         SET region_id = '[]'
                         WHERE chat_id = '${chatId}' `;
                await db.query(deleteChoosedRegions)

                await finedOrder(chatId);//если нет активных заказов предлагаем найти заказ
                break;
            case "Просмотр задания":
                var execution_order = await getSql('execution_order', 'user_id=' + user.id);
                if (execution_order.length > 0) {
                    let order = await getSql('orders', 'id=' + execution_order[0].order_id);
                    bot.sendMessage(chatId, "Ваше задание:\n\n<b>" + order[0].title + "</b>\n\n" + order[0].description, options.default);
                    return;
                }
                break;
            case"Настройки":
                const result = await getSql("vehicles", "digits='" + user.digits + "'");
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

bot.on('callback_query', async function (msg) {
    var answerCallback = {};
    const chatId = msg.message.chat.id;
    if (callback_query_click[chatId]) {
        bot.answerCallbackQuery(msg.id, answerCallback);
        return;
    }
    setTimeout(function () {
        callback_query_click[chatId] = false;
    }, 5 * 1000);//от повторных кликов

    callback_query_click[chatId] = true;
    if (msg.data.indexOf('holdOrder_') == 0) {//админы
        var orders = await getSql('orders_regions, orders', 'orders.status=1 and orders_regions.status=1 AND orders.id=orders_regions.order_id', 'orders.title, orders.id');
        var inline_keyboard = [];
        for (var i = 0; i < orders.length; i++) {
            inline_keyboard.push([{text: orders[i].title, callback_data: "order_" + orders[i].id}]);
        }
        inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        var text = "<b>Активные задания</b>";
        bot.editMessageText(text, result);
    }
    if (msg.data.indexOf('completionOrder_') == 0) {//
        var order = parseInt(msg.data.split('_')[1]);
        var user_id = parseInt(msg.data.split('_')[2]);
        var inline_keyboard = [];
        inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText(getEntities(msg.message.text, msg.message.entities) + "\n\nЗадание завершено ✅", result);

        var user = await getSql('users', 'id=' + user_id);
        var order = await getSql('orders', 'id=' + order);
        var messages = await getSql('messages', 'order_id=' + order[0].id + ' and user_id=' + user_id);
        if (messages.length > 0) {
            bot.deleteMessage(user[0].chat_id, messages[0].message_id);
            db.query("DELETE FROM `messages` WHERE id=" + messages[0].id);
        }
        db.query("UPDATE `orders` SET status=3 WHERE id=" + order[0].id);
        db.query("DELETE FROM `execution_order` WHERE order_id=" + order[0].id);
        db.query("INSERT INTO `orders_end`(`id_user`, `order_id`) VALUES (" + user[0].id + "," + order[0].id + ")");

        bot.sendMessage(user[0].chat_id, "<b>" + order[0].title + "</b>\n\n" + order[0].description + "\n\nЗадание завершено ✅", options.mainMenu)
    }
    if (msg.data.indexOf('executionOrder_') == 0) {//
        var order = parseInt(msg.data.split('_')[1]);
        var user_id = parseInt(msg.data.split('_')[2]);
        var inline_keyboard = [];
        inline_keyboard.push([{text: "✅ Завершить", callback_data: "completionOrder_" + order + "_" + user_id}]);
        inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        var user = await getSql("users", "id=" + user_id);
        var vehicle = await getSql("vehicles", "digits='" + user[0].digits + "'");
        var order = await getSql("orders", "id=" + order);
        if (vehicle.length > 0) {
            var vehicleInfo = "\n\n<i>Информация о машине:</i> \nМодель: <b>" + vehicle[0].vendor + " " + vehicle[0].model + " " + vehicle[0].model_year + "</b>\nТип: <b>" + vehicle[0].kind + "</b>\nЦвет: <b>" + vehicle[0].color + "</b>";
        } else {
            var vehicleInfo = "\n\n<i>Информация о машине не найдена</i>";
        }
        bot.editMessageText("<i>Задание:</i>\n<b>" + order[0].title + "</b>\n\n" + order[0].description + "\n\n<i>Исполнитель:</i>\nИмя: <b>" + user[0].name + "</b>\nTelegram: @" + user[0].username + "\nНомер телефона: <b>" + user[0].phone + "</b>\nНомер машины: <b>" + user[0].digits + "</b>" + vehicleInfo, result);
    }
    if (msg.data.indexOf('acceptOrder_') == 0) {//
        var orders = await getSql('execution_order,orders', 'execution_order.status=1 and orders.status=2 and orders.id = execution_order.order_id', 'orders.title, orders.id, execution_order.user_id');
        var inline_keyboard = [];
        for (var i = 0; i < orders.length; i++) {
            inline_keyboard.push([{
                text: orders[i].title,
                callback_data: "executionOrder_" + orders[i].id + "_" + orders[i].user_id
            }]);
        }
        inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText("<b>Задания на выполнении</b>\nДля просмотра полной информации или подтверждения выполнения, нажмите на задание", result);
    }
    if (msg.data.indexOf('adminMenu_') == 0) {//
        var inline_keyboard = [];
        inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
        inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
        inline_keyboard.push([{text: "Отправить задание", callback_data: "sendOrder_"}]);
        inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText("<b>Что вас интересует?</b>", result);
    }
    if (msg.data.indexOf('sendOrder_') == 0) {//пользователь выбирает задание затем регион и нажимает отправить в регион только для админов
        var id = parseInt(msg.data.split('_')[1]);
        var region = parseInt(msg.data.split('_')[2]);
        var text = "<b>Что вас интересует?</b>";
        var inline_keyboard = [];
        if (!id) {// значит админ еще не выбрал задание
            var orders = await getSql('orders', 'status=0 and title is not null and description is not null');
            for (var i = 0; i < orders.length; i++) {
                inline_keyboard.push([{text: orders[i].title, callback_data: "sendOrder_" + orders[i].id}]);
            }
            text = "<b>Выберете задание для отправки</b>";
        } else if (!region) {//значит регион не выбран , отправляем админу выбор регионов
            var regions = await getSql('regions', 'status=1');
            for (var i = 0; i < regions.length; i++) {
                inline_keyboard.push([{
                    text: regions[i].title,
                    callback_data: "sendOrder_" + id + "_" + regions[i].id
                }]);
            }
            text = "<b>Выберете район по каторому будет отправка</b>";
        } else {//значит регион выбран , оформляем задание и записываем в базу
            var checkActiv = await getSql('orders_regions', 'region_id=' + region + ' and order_id=' + id);
            if (checkActiv.length <= 0) {
                db.query("INSERT INTO `orders_regions`(`region_id`, `order_id`) VALUES (" + region + "," + id + ")");//на этом этапе записываем orders_regions
                db.query("UPDATE `orders` SET `status`=1 WHERE id=" + id);//переводим в статус режима ожидания пока задание кто-то возьмет

                var regions = await getSql('finedOrder', 'status=1 and region_id=' + region);
                text = "Пользователей ожидающих задания в этом районе: <b>" + regions.length + "</b>\nИдет отправка, ожидайте ...";
                var result = {
                    chat_id: chatId,
                    message_id: msg.message.message_id,

                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({inline_keyboard})
                };
                bot.editMessageText(text, result);
                var sends = await sendOrders(id, region);
                console.log(sends)
                text = "Пользователей ожидающих задания в этом районе: <b>" + regions.length + "</b>\nОтправленно сообщений: <b>" + sends + "</b>";
            } else {
                text = "<b>Вы уже отправляли это задание, ожидайте ответа</b>";
            }
        }
        inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText(text, result);
    }
    if (msg.data.indexOf('deleteOrder_') == 0) {
        var id = parseInt(msg.data.split('_')[1]);
        db.query("DELETE FROM `orders` WHERE id=" + id);
        editMessages(id);
        var inline_keyboard = [];
        inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
        inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
        inline_keyboard.push([{text: "Отправиь задание", callback_data: "sendOrder_"}]);
        inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText("<b>Что вас интересует?</b>", result);
    }
    if (msg.data.indexOf('createOrder_') == 0) {
        var id = parseInt(msg.data.split('_')[1]);
        var user = await getUser(msg, 1);
        if (id) {
            var order = await getSql('orders', 'id=' + id);
            if (!order[0].description) {
                db.query("UPDATE `orders` SET `title`=null WHERE id=" + order[0].id);
                var text = "Введите название задания (до 35 символов)";
                var inline_keyboard = [];
                var result = {
                    chat_id: chatId,
                    message_id: msg.message.message_id,

                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({inline_keyboard})
                };
                bot.editMessageText(text, result);
            } else {
                db.query("UPDATE `orders` SET `description`=null WHERE id=" + order[0].id);
                var inline_keyboard = [];
                inline_keyboard.push([{text: order[0].title, callback_data: "_"}]);
                inline_keyboard.push([{
                    text: "🔄 Отменить",
                    callback_data: "createOrder_" + order[0].id
                }, {text: "Удалить ❌", callback_data: "deleteOrder_" + order[0].id}]);
                var result = {
                    chat_id: chatId,
                    message_id: msg.message.message_id,

                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({inline_keyboard})
                };
                bot.editMessageText("Название: \n<b>" + order[0].title + "</b> \nПроверьте ниже⬇️ \nТак будет выглядеть  название в списке. \n\n<b>Введите описание до 700 символов</b>", result);
            }

        } else if (user.admin) {
            var order = await getSql('orders', '(title is null or description is null) and user_id=' + user.id);
            if (order.length <= 0 || !order[0].title) {
                if (order.length > 0 && !order[0].title)
                    var text = "<b>Вы не закончили настройку задания</b>\n\nВведите название задания (до 35 символов)";
                else {
                    var text = "Введите название задания (до 35 символов)";
                    db.query("INSERT INTO `orders`(`user_id`) VALUES (" + user.id + ")");
                }
                var inline_keyboard = [];
                var result = {
                    chat_id: chatId,
                    message_id: msg.message.message_id,

                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({inline_keyboard})
                };
                bot.editMessageText(text, result).then(async function (callback) {
                    var newOrder = await getSql('orders', 'title is null and user_id=' + user.id)
                    db.query("UPDATE `orders` SET `message_id`='" + callback.message_id + "' WHERE id=" + newOrder[0].id);
                });
            } else if (!order[0].description) {
                var text = "<b>Вы не закончили настройку задания</b>\n\nВведите описание задания (до 700 символов)";
                var inline_keyboard = [];
                var result = {
                    chat_id: chatId,
                    message_id: msg.message.message_id,

                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({inline_keyboard})
                };
                bot.editMessageText(text, result);
            }
        }

    }
    if (msg.data.indexOf('getOrdet_') == 0) {
        let id = parseInt(msg.data.split('_')[1]);
        let user = await getSql("users", "chat_id=" + chatId);
        let vehicle = await getSql("vehicles", "digits='" + user[0].digits + "'");
        db.query("DELETE FROM `orders_regions` WHERE order_id=" + id);
        db.query("UPDATE `orders` SET status=2 WHERE id=" + id);
        db.query("DELETE FROM `messages` WHERE chat_id=" + chatId + " and order_id=" + id);
        db.query("INSERT INTO `execution_order`(`order_id`, `user_id`, `message_id`, `chat_id`) VALUES ('" + id + "','" + user[0].id + "','" + msg.message.message_id + "','" + chatId + "')");
        editMessages(id);
        var messages = await getSql('finedOrder', 'chat_id=' + chatId);
        if (messages.length > 0) {
            bot.deleteMessage(chatId, messages[0].message_id);
            db.query("DELETE FROM `finedOrder` WHERE chat_id=" + chatId);
        }
        bot.deleteMessage(chatId, msg.message.message_id);
        if (vehicle.length > 0) {
            var vehicleInfo = "\n\n<i>Информация о машине:</i> \nМодель: <b>" + vehicle[0].vendor + " " + vehicle[0].model + " " + vehicle[0].model_year + "</b>\nТип: <b>" + vehicle[0].kind + "</b>\nЦвет: <b>" + vehicle[0].color + "</b>";
        } else {
            var vehicleInfo = "\n\n<i>Информация о машине не найдена</i>";
        }
        bot.sendMessage(chatId, getEntities(msg.message.text, msg.message.entities) + "\n\n✅ <b>Вы получили задание</b>", options.taskView);
        var admins = await getSql('admins,users', 'admins.user_id = users.id', 'users.chat_id');
        var sends;
        for (var i = 0; i < admins.length; i++) {
            sends = await forSend(admins[i].chat_id, "<i>Задание:</i>\n" + getEntities(msg.message.text, msg.message.entities) + "\n\n<i>Исполнитель:</i>\nИмя: " + user[0].name + "\nTelegram: @" + user[0].username + "\nНомер телефона: " + user[0].phone + "\nНомер машины: " + user[0].digits + vehicleInfo, result)
        }

    }
    if (msg.data.indexOf('order_') == 0) {
        var id = parseInt(msg.data.split('_')[1]);
        var order = await getSql("orders", "id=" + id);
        var user = await getUser(msg, 1);
        var messages = await getSql('messages', 'order_id=' + id + ' and chat_id=' + chatId);
        if (messages.length > 0) {
            bot.deleteMessage(chatId, messages[0].message_id);
            db.query("DELETE FROM `messages` WHERE chat_id=" + chatId);
        }

        if (order.length <= 0) {
            bot.sendMessage(chatId, "К сожалению задание больше не доступно", result);
            if (order.length > 0)
                editMessages(order[0].id);
            return;
        }
        var inline_keyboard = [];
        if (user.admin)
            inline_keyboard.push([{text: "Удалить ❌", callback_data: "deleteOrder_" + order[0].id}]);
        inline_keyboard.push([{text: "Взять задание", callback_data: "getOrdet_" + id}]);
        var result = {
            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.sendMessage(chatId, "<b>" + order[0].title + "</b>\n\n" + order[0].description, result).then(function (callback) {
            db.query("INSERT INTO `messages`(`message_id`, `chat_id`, `order_id`) VALUES ('" + callback.message_id + "','" + chatId + "','" + id + "')");
        });
    }
    if (msg.data.indexOf('stop_') == 0) {
        var inline_keyboard = [];
        var result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        db.query("DELETE FROM `finedOrder` WHERE chat_id=" + chatId);
        bot.editMessageText("Поиск остановлен", result).then(function () {
            bot.sendMessage(chatId, "<b>Главное меню</b>", options.mainMenu);
        });
    }
    if (msg.data.indexOf('finedOrder_') == 0) {// после выбора района

        const fromChatId = msg.from.id
        let choosedRegion = parseInt(msg.data.split('_')[1]);//регион который выбрал пользователь

        let flags = await getSql("finedOrder", "chat_id = " + fromChatId);
        flags = JSON.parse(flags[0].region_id)

        if (!flags.find(item => item == choosedRegion)) flags.push(choosedRegion)
        else return

        let addRegion = `UPDATE finedOrder
                         SET region_id = '[${flags}]'
                         WHERE chat_id = '${fromChatId}' `;
        await db.query(addRegion)
        await finedOrder(chatId, flags, msg.message.message_id)
    }
    if (msg.data.indexOf('changeAuto_') == 0) {
        try {
            bot.deleteMessage(chatId, msg.message.message_id)
            bot.deleteMessage(chatId, msg.message.message_id - 1)
            let user = await getUser(msg, 1)
            const {digits} = user
            let sql = `DELETE FROM vehicles
                   WHERE digits = '${digits}'`
            await db.query(sql)
            sql = `UPDATE users
               SET digits = null , photo = null
               WHERE chat_id = '${chatId}'`
            await db.query(sql)
            user.digits = null
            await verifyUser(user)
        } catch (err) {
            console.log(err)
            bot.sendMessage(chatId, "Ошибка!Попробуйте еще раз...")
        }
    }
    if (msg.data.indexOf('backToMenu_') == 0) {
        bot.deleteMessage(chatId, msg.message.message_id)
        bot.deleteMessage(chatId, msg.message.message_id - 1)
        bot.sendMessage(chatId, "<b>Главное меню</b>", options.mainMenu);
    }
    if (msg.data.indexOf('enterData_') == 0) {
        const chatId = msg.from.id
        const sql = `UPDATE users
                     SET auto_fill = false
                     WHERE chat_id= '${chatId}'`;
        await db.query(sql)
        const user = await getUser(msg, 1)
        await verifyUser(user)
    }
    callbackEnd(chatId, msg.id, answerCallback);
    return;
});

function callbackEnd(chatId, id, answerCallback = {}) {
    global_message_id = id
    callback_query_click[chatId] = false;
    bot.answerCallbackQuery(id, answerCallback);//обязательный ответ в телеграмме
}

var callback_query_click = [];

async function editMessages(order) {
    var messages = await getSql('messages', 'order_id=' + order);
    if (messages.length > 0) {
        var result = {
            chat_id: messages[0].chat_id,
            message_id: messages[0].message_id,

            parse_mode: "HTML"
        };
        bot.editMessageText("Задание забрали в работу", result);
        db.query("DELETE FROM `messages` WHERE id=" + messages[0].id);
        setTimeout(function () {
            editMessages(order);
        }, 300);
    }
}

async function finedOrder(chatId, flags = [], messageId) {
    var regions = await getSql('regions', 'status=1');//получаем все регионы
    var inline_keyboard = [];
    for (var i = 0; i < regions.length; i++) {
        text = flags && flags.length && flags.find(item => item == i + 1) ? "✅ " + `${regions[i].title}` : "➖ " + `${regions[i].title}`
        const district = {text, callback_data: "finedOrder_" + regions[i].id}
        inline_keyboard.push([district]);
    }//делаем пуш для кнопок всех регионов

    let result = {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };

    if (flags.length) {// после нажатия на регион
        result = {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: JSON.stringify({inline_keyboard}),
            parse_mode: "HTML"
        };
        await bot.editMessageText("<b>1.Выберете район(-ы) </b><b>\n 2.Для поиска введите /search</b>", result)

    } else {// после нажатия на клавишу Поиск заказа
        bot.sendMessage(chatId, "<b>1.Выберете район(-ы) </b><b>\n2.Для поиска введите /search</b>", result)//отправляем районы поиска пользователю
            .then(async function (callback) {//сохраняем новый  finedOrder
                console.log(callback)
                if (!flags.length) {
                    var user = await getSql("users", "chat_id=" + chatId);
                    await db.query("INSERT INTO `finedOrder`(`user_id`,`message_id`, `chat_id`) VALUES ('" + user[0].id + "','" + callback.message_id + "','" + chatId + "')");
                }
            });
    }
}

async function sendOrders(order, region, i = 0) {// отвечает за рассылку сообщений
    var order = order;
    var region = region;
    var i = i;
    order = await getSql('orders', 'id=' + order);
    order = order[0];
    var fineders = await getSql('finedOrder', 'status=1 and region_id=' + region);

    return new Promise(resolve => {

        if (fineders.length > i) {
            console.log("send");
            var inline_keyboard = [];
            inline_keyboard.push([{text: "Взять задание", callback_data: "getOrdet_" + order.id}]);
            var result = {

                parse_mode: "HTML",
                reply_markup: JSON.stringify({inline_keyboard})
            };
            bot.sendMessage(fineders[i].chat_id, "<b>" + order.title + "</b>\n" + order.description, result).then(async function (callback) {
                db.query("INSERT INTO `messages`(`user_id`, `message_id`, `chat_id`, `order_id`) VALUES (" + fineders[i].user_id + "," + callback.message_id + "," + fineders[i].chat_id + "," + order.id + ")");
                setTimeout(async function () {
                    var send_i = await sendOrders(order.id, region, i + 1);
                    resolve(send_i);
                }, 300);
            }, function (err) {
                console.log(err);
            });
        } else {
            console.log("End");
            resolve(i);
        }
    });
}

function forSend(chatId, text, result) {
    return new Promise(resolve => {
        bot.sendMessage(chatId, text, result).then(function (callback) {
            setTimeout(function () {
                resolve(true);
            }, 300);
        }, function (err) {
            console.log(err);
            setTimeout(function () {
                resolve(false);
            }, 300);
        })
    });
}

let global_message_id = 0

function getSql(table, params = 1, select = '*') {
    return new Promise(resolve => {
        db.query("SELECT " + select + " FROM " + table + " WHERE " + params, function (err, result, fields) {
            if (err) {
                console.log("ERROR 6102: " + err);
                resolve(false);
                return;
            }
            resolve(result);
        });
    });
}

function getUser(msg, type = 0) {
    return new Promise(resolve => {
        if (msg.text && type == 0)
            var url = msg.text.split(' ')[1];
        else
            var url = false;
        if (type == 0)
            var chatId = msg.chat.id;
        else
            var chatId = msg.message.chat.id;
        db.query("SELECT * FROM users WHERE chat_id=" + chatId, async function (err, user, fields) {

            if (err) {
                console.log("ERROR 77: " + err);
                resolve(false);
                return;
            }
            if (user.length <= 0) {
                db.query("INSERT INTO `users`(`name`,`chat_id`,`username`) VALUES (" + mysql.escape(msg.from.first_name) + ",'" + chatId + "'," + mysql.escape(msg.from.username) + ")");
                console.log("Registration end");
                var user = await getSql("users", "chat_id = " + chatId);
                user = user[0];
                if (url) {
                    var ref = await getSql('users', 'chat_id=' + mysql.escape(url));
                    if (ref.length <= 0) {
                        db.query("INSERT INTO `users`(`name`,`chat_id`,`ref_url`,`username`) VALUES (" + mysql.escape(msg.from.first_name) + ",'" + chatId + "'," + mysql.escape(url) + "," + mysql.escape(msg.from.username) + ")");
                    } else {
                        db.query("INSERT INTO `users`(`name`,`chat_id`,`ref`,`username`) VALUES (" + mysql.escape(msg.from.first_name) + ",'" + chatId + "'," + mysql.escape(url) + "," + mysql.escape(msg.from.username) + ")");
                    }
                }
            } else
                user = user[0];
            if (url) {
                var adminCheck = await getSql("admins", "user_id=" + user.id);
                if (adminCheck.length <= 0) {
                    var admin = await getSql("admins", "link = " + mysql.escape(url) + " and user_id is NULL");
                    if (admin.length > 0) {
                        db.query("UPDATE `admins` SET `user_id`= " + user.id + ", `status`= 1 WHERE id=" + admin[0].id);
                        admin = await getSql("admins", "user_id = " + user.id);
                        user.admin = true;
                    } else
                        user.admin = false;
                } else {
                    user.admin = true;
                }
            } else {
                var admin = await getSql("admins", "user_id = " + user.id);
                if (admin.length > 0)
                    user.admin = true;
                else
                    user.admin = false;

            }
            resolve(user);
        });
    });
}

function verifyUser(user) {
    return new Promise(resolve => {
        if (!user.phone)
            resolve(phoneMessage(user))
        else if (!user.digits)
            resolve(digitsMessage(user))
        else if (!user.photo)
            resolve(imageMessage(user))
        else if (!user.digits || !user.phone || !user.photo)
            resolve(false);
        else {
            resolve(true);
        }
    });
}

function phoneMessage(user) {
    if (user.phone) {
        db.query("UPDATE `users` SET `phone`=NULL WHERE id=" + user.id)
    }

    bot.sendMessage(user.chat_id, "<b>Отправьте ваш номер телефона</b>", options.shareContact);
    return false
}

function digitsMessage(user) {
    if (user.digits) {
        db.query("UPDATE `users` SET `digits`=NULL WHERE id=" + user.id)
    }

    bot.sendMessage(user.chat_id, "<b>Напишите гос. номер вашего автомобиля</b>", options.default);
    return false
}


function imageMessage(user) {
    if (user.photo) {
        db.query("UPDATE `users` SET `photo`=NULL WHERE id=" + user.id)
    }

    bot.sendMessage(user.chat_id, "<b>Прикрепите фотографию автомобиля</b>", options.default);
    return false
}

async function putToBucket(file, key) {
    const s3 = new AWS.S3({
        params:
            {Bucket: 'posters.images'}
    })
    var params = {
        Key: `${key}`,
        Body: file,
        ACL: 'public-read',
    }

    await s3.upload(params).promise().then(response => console.log(response, 'Item was upload'),
        err => {
            throw new Error(err)
        })
}

async function uploadLocalImage(image) {

    const {file_id: fileId, file_unique_id: uniqueId} = image
    const filePath = path.join('public', 'images', `${uniqueId}.jpg`)
    const writeStream = fs.createWriteStream(filePath)
    const imageFile = await bot.getFile(fileId);
    const fileLink = await bot.getFileLink(imageFile.file_id)

    const response = await axios({
        url: fileLink,
        method: 'GET',
        responseType: 'stream'
    })

    return new Promise((resolve, reject) => {
        response.data.pipe(writeStream)
            .on('finish', (_) => resolve(`${uniqueId}.jpg`))
            .on('error', err => reject(err))
    })
}

async function start(msg) {
    const user = await getUser(msg);
    const res = await verifyUser(user);
    if (res) {
        bot.sendMessage(user.chat_id, "<b>Главное меню</b>", options.mainMenu);
    }
}

async function adminPanel(msg, chatId) {
    const user = await getUser(msg);
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

async function createAdmin(msg, chatId) {
    // if (chatId == '287363909') {
        db.query("INSERT INTO `admins`(`link`) VALUES ('" + sha1(Math.random()) + "')");
        const newOrg = await getSql("admins", "user_id is NULL");
        let txt = "";
        for (let i = 0; i < newOrg.length; i++) {
            txt += (i + 1) + ". https://t.me/SvoiLogisticsBot?start=" + newOrg[i].link + "\n";
        }
        bot.sendMessage(chatId, txt);
    // }
}

async function searchOrder(msg, chatId) {
    const user = await getUser(msg);
    const verify = await verifyUser(user);
    if (!verify) return

    let finedOrder = await getSql("finedOrder", "chat_id = " + chatId)//ищет пользователся в поиске
    let rangeRegions = JSON.parse(finedOrder[0].region_id)//выбранные регионы

    const sql = `SELECT * FROM orders_regions , orders
                 WHERE orders_regions.status=1 and orders.status=1
                 AND orders.id =orders_regions.order_id and FIND_IN_SET(orders_regions.region_id, '${rangeRegions}')`
    const orders = await querySQL(sql)//формируем запросы на заказы по заданным регионам
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
        const response = await axios.get(url, {headers: {"Accept": "application/json", "X-Api-Key": key}})
        console.log(response)
        if (response.status === 200 && response.data) {
            console.log("auto found");
            const {digits, model, model_year, vendor, operations} = response.data
            await db.query("UPDATE `users` SET digits=" + mysql.escape(digits) + " WHERE chat_id=" + chatId);
            let vehicle = await getSql('vehicles', 'digits=' + mysql.escape(digits));
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

async function uploadToS3(fileName) {
    const readFile = promisify(fs.readFile);
    const data = await readFile(path.join('public', 'images', `${fileName}`));//скачиваем файл

    return s3.upload({
        Bucket: 'svoi.images',
        Key: `${fileName}`,
        Body: data,
        ContentType: 'image/png',
        ACL: 'public-read',
        CacheControl: 'max-age=0',
    })
        .promise()
        .then(response => response.Location,
            err => {
                throw new Error(err)
            })
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

        const fileName = await uploadLocalImage(biggestImage)//сохраняем локальнo и получаем название файла
        const location = await uploadToS3(fileName, chatId)
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
        const userVehicle = await querySQL(condition)
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

        if (await verifyUser(user)) {
            bot.sendMessage(user.chat_id, "<b>Регистрация завершена, можете начать поиск</b>", options.mainMenu);
        }
    } catch (err) {
        console.log('[ERROR]', err)
        bot.sendMessage(user.chat_id, "<b>Что-то пошло не так , повторите попытку снова</b>", options.default);
        return false
    }
}

async function saveOrderTitle(msg, chatId, order) {
    let inline_keyboard = [];
    inline_keyboard.push([{text: msg.text, callback_data: "_"}]);
    inline_keyboard.push([{
        text: "🔄 Отменить",
        callback_data: "createOrder_" + order.id
    }, {text: "Удалить ❌", callback_data: "deleteOrder_" + order.id}]);
    let result = {
        chat_id: chatId,
        message_id: order.message_id,
        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.editMessageText("Название: \n<b>" + msg.text + "</b> \nПроверьте ниже⬇️ \nТак будет выглядеть  название в списке. \n\n<b>Введите описание до 700 символов</b>", result);
    db.query("UPDATE `orders` SET `title`=" + mysql.escape(msg.text) + " WHERE id=" + order.id);

}

function getEntities(text, entities) {
    if (entities == undefined)
        return text;
    text = text.split('');
    for (var i = 0; i < entities.length; i++) {
        switch (entities[i].type) {
            case "bold":
                text[entities[i].offset] = '<b>' + text[entities[i].offset];
                text[entities[i].offset + entities[i].length - 1] = text[entities[i].offset + entities[i].length - 1] + '</b>';

                break;
            case "code":
                text[entities[i].offset] = '<code>' + text[entities[i].offset];
                text[entities[i].offset + entities[i].length - 1] = text[entities[i].offset + entities[i].length - 1] + '</code>';
                break;
            case "italic":
                text[entities[i].offset] = '<i>' + text[entities[i].offset];
                text[entities[i].offset + entities[i].length - 1] = text[entities[i].offset + entities[i].length - 1] + '</i>';
                break;
            case "pre":
                text[entities[i].offset] = '<pre>' + text[entities[i].offset];
                text[entities[i].offset + entities[i].length - 1] = text[entities[i].offset + entities[i].length - 1] + '</pre>';
                break;
            case "underline":
                text[entities[i].offset] = '<u>' + text[entities[i].offset];
                text[entities[i].offset + entities[i].length - 1] = text[entities[i].offset + entities[i].length - 1] + '</u>';
                break;
            case "strikethrough":
                text[entities[i].offset] = '<s>' + text[entities[i].offset];
                text[entities[i].offset + entities[i].length - 1] = text[entities[i].offset + entities[i].length - 1] + '</s>';
                break;
        }
    }

    var newText = "";
    for (var i = 0; i < text.length; i++) {
        newText += text[i];
    }
    return newText;
}

async function saveOrderDesc(msg, chatId, order) {
    let inline_keyboard = [];
    inline_keyboard.push([{text: order.title, callback_data: "_"}]);
    inline_keyboard.push([{
        text: "🔄 Отменить",
        callback_data: "createOrder_" + order.id
    }, {text: "Удалить ❌", callback_data: "deleteOrder_" + order.id}]);
    inline_keyboard.push([{text: "✅ Отправить", callback_data: "sendOrder_" + order.id}]);
    let result = {
        chat_id: chatId,
        message_id: order.message_id,
        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.editMessageText("<b>Название:</b> \n" + order.title + " \n\n<b>Описание:</b> \n" + getEntities(msg.text, msg.entities), result);
    db.query("UPDATE `orders` SET `description`=" + mysql.escape(getEntities(msg.text, msg.entities)) + " WHERE id=" + order.id);
}

function querySQL(condition) {
    return new Promise((resolve, reject) => {
        db.query(condition, (err, result) => {
            if (err) console.log(err)
            resolve(result)
        })
    })
}