const {bot} = require("./bot");
const options = require("./options");
const functions = require("./functions");
const db = require("./init_db")();
const helpers = require('./helpers')

const city = {
    1: "Александровский",
    2: "Заводской",
    3: "Комунарский",
    4: "Днепровский",
    5: "Вознесеновксий",
    6: "Хортицкий",
    7: "Шевченковский"
}

async function holdOrder(msg, chatId) {
    const orders = await functions.getSql('orders_regions, orders', 'orders.status=1 and orders_regions.status=1 AND orders.id=orders_regions.order_id', 'orders.title, orders.id');
    const inline_keyboard = [];
    for (let i = 0; i < orders.length; i++) {
        inline_keyboard.push([{text: orders[i].title, callback_data: "order_" + orders[i].id}]);
    }
    inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
    const result = {
        chat_id: chatId,
        message_id: msg.message.message_id,

        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    const text = "<b>Активные задания</b>";
    bot.editMessageText(text, result);
}

async function completeOrder(msg, chatId) {
    let order = parseInt(msg.data.split('_')[1]);
    const user_id = parseInt(msg.data.split('_')[2]);

    const user = await functions.getSql('users', 'id=' + user_id);
    order = await functions.getSql('orders', 'id=' + order);
    if (await functions.isAdmin(user[0].id)) {
        const messages = await functions.getSql('messages', 'order_id=' + order[0].id + ' and user_id=' + user_id);
        if (messages.length > 0) {
            bot.deleteMessage(user[0].chat_id, messages[0].message_id);
            db.query("DELETE FROM `messages` WHERE id=" + messages[0].id);
        }
        db.query("UPDATE `orders` SET status=3 WHERE id=" + order[0].id);
        db.query("DELETE FROM `execution_order` WHERE order_id=" + order[0].id);
        db.query("INSERT INTO `orders_end`(`id_user`, `order_id`) VALUES (" + user[0].id + "," + order[0].id + ")");
        bot.sendMessage(user[0].chat_id, "<b>" + order[0].title + "</b>\n\n" + order[0].description + "\n\nЗадание завершено ✅", options.mainMenu)
    } else {
        db.query("UPDATE `execution_order` SET status=2  WHERE order_id=" + order[0].id);
        options.default.chat_id = chatId
        options.default.message_id = msg.message.message_id
        bot.editMessageText("<b>Прикрепите фотографию с места прибытия</b>", options.default);
    }

}

async function executionOrder(msg, chatId) {
    let vehicleInfo;
    let order = parseInt(msg.data.split('_')[1]);
    const user_id = parseInt(msg.data.split('_')[2]);
    const inline_keyboard = [];
    inline_keyboard.push([{text: "✅ Завершить", callback_data: "completeOrder_" + order + "_" + user_id}]);
    inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
    const result = {
        chat_id: chatId,
        message_id: msg.message.message_id,

        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    const user = await functions.getSql("users", "id=" + user_id);
    const vehicle = await functions.getSql("vehicles", "digits='" + user[0].digits + "'");
    order = await functions.getSql("orders", "id=" + order);
    if (vehicle.length > 0) {
        vehicleInfo = "\n\n<b>Информация о машине:</b> \nМодель: <b>" + vehicle[0].vendor + " " + vehicle[0].model + " " + vehicle[0].model_year + "</b>\nТип: <b>" + vehicle[0].kind + "</b>\nЦвет: <b>" + vehicle[0].color + "</b>";
    } else {
        vehicleInfo = "\n\n<b>Информация о машине не найдена</b>";
    }
    bot.editMessageText("<b>Задание:</b>" + order[0].title + "\n<b>Описание:</b>" + order[0].description + "\n<b>Исполнитель:</b> \n<b>Имя</b>" + user[0].name + "\n<b>Telegram: @</b>" + user[0].username + "\n<b>Номер телефона:</b>" + user[0].phone + "\n</b>Номер машины: <b>" + user[0].digits + "</b>" + vehicleInfo, result);
}

async function acceptOrder(msg, chatId) {
    const orders = await functions.getSql('execution_order,orders', 'execution_order.status=1  or execution_order.status=2  and orders.status=2 and orders.id = execution_order.order_id', 'orders.title, orders.id, execution_order.user_id');
    const inline_keyboard = [];
    for (let i = 0; i < orders.length; i++) {
        inline_keyboard.push([{
            text: orders[i].title,
            callback_data: "executionOrder_" + orders[i].id + "_" + orders[i].user_id
        }]);
    }
    inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
    const result = {
        chat_id: chatId,
        message_id: msg.message.message_id,

        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.editMessageText("<b>Задания на выполнении</b>\nДля просмотра полной информации или подтверждения выполнения, нажмите на задание", result);
}

async function adminMenu(msg, chatId) {
    const inline_keyboard = [];
    inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
    inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
    inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);
    const result = {
        chat_id: chatId,
        message_id: msg.message.message_id,

        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.editMessageText("<b>Что вас интересует?</b>", result);
}

async function sendOrder(msg, chatId) {
    const id = parseInt(msg.data.split('_')[1]);
    const region = parseInt(msg.data.split('_')[2]);
    const destination = parseInt(msg.data.split('_')[3])
    let text = "<b>Что вас интересует?</b>";
    const inline_keyboard = [];
    if (!id) {// значит админ еще не выбрал задание
        const orders = await functions.getSql('orders', 'status=0 and title is not null and description is not null');
        for (let i = 0; i < orders.length; i++) {
            inline_keyboard.push([{text: orders[i].title, callback_data: "sendOrder_" + orders[i].id}]);
        }
        text = "<b>Выберете задание для отправки</b>";
    } else if (!region) {//значит регион не выбран , отправляем админу выбор регионов
        const regions = await functions.getSql('regions', 'status=1');
        for (let i = 0; i < regions.length; i++) {
            inline_keyboard.push([{
                text: regions[i].title,
                callback_data: `sendOrder_${id}_${regions[i].id}`
            }]);
        }
        text = "<b>🌆Выберите район отправки </b>";
    } else if (!destination) {
        const regions = await functions.getSql("regions")
        for (let i = 0; i < regions.length; i++) {
            inline_keyboard.push([{
                text: regions[i].title,
                callback_data: `saveDestination_${id}_${region}_${regions[i].id}`
            }])
        }
        text = "<b>🌆 Выберете район пункта назначения</b>"
    } else {//значит регион выбран , оформляем задание и записываем в базу
        const checkActiv = await functions.getSql('orders_regions', 'region_id=' + region + ' and order_id=' + id);
        if (checkActiv.length <= 0) {
            db.query("INSERT INTO `orders_regions`(`region_id`, `order_id`) VALUES (" + region + "," + id + ")");//на этом этапе записываем orders_regions
            db.query("UPDATE `orders` SET `status`=1 WHERE id=" + id);//переводим в статус режима ожидания пока задание кто-то возьмет

            const regions = await functions.getSql('finedOrder', 'status=1 and region_id=' + region);
            text = "Пользователей ожидающих задания в этом районе: <b>" + regions.length + "</b>";
            const result = {
                chat_id: chatId,
                message_id: msg.message.message_id,

                parse_mode: "HTML",
                reply_markup: JSON.stringify({inline_keyboard})
            };
            bot.editMessageText(text, result);
            await sendOrders(id, region);
            text = "Пользователей ожидающих задания в этом районе: <b>" + regions.length;
        } else {
            text = "<b>Вы уже отправляли это задание, ожидайте ответа</b>";
        }
    }
    inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
    const result = {
        chat_id: chatId,
        message_id: msg.message.message_id,

        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.editMessageText(text, result);
}

async function sendOrders(order, region, i = 0) {// отвечает за рассылку сообщений
    order = await functions.getSql('orders', 'id=' + order);
    order = order[0];
    const fineders = await functions.getSql('finedOrder', 'status=1 and region_id=' + region);

    return new Promise(resolve => {

        if (fineders.length > i) {
            console.log("send");
            const inline_keyboard = [];
            inline_keyboard.push([{text: "Взять задание", callback_data: "getOrder_" + order.id}]);
            const result = {

                parse_mode: "HTML",
                reply_markup: JSON.stringify({inline_keyboard})
            };
            bot.sendMessage(fineders[i].chat_id, "<b>" + order.title + "</b>\n" + order.description, result).then(async function (callback) {
                db.query("INSERT INTO `messages`(`user_id`, `message_id`, `chat_id`, `order_id`) VALUES (" + fineders[i].user_id + "," + callback.message_id + "," + fineders[i].chat_id + "," + order.id + ")");
                setTimeout(async function () {
                    const send_i = await sendOrders(order.id, region, i + 1);
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

async function deleteOrder(msg, chatId) {
    const id = parseInt(msg.data.split('_')[1]);
    db.query("DELETE FROM `orders` WHERE id=" + id);
    editMessages(id, 'delete');
    const inline_keyboard = [];
    inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
    inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
    inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);
    const result = {
        chat_id: chatId,
        message_id: msg.message.message_id,

        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.editMessageText("<b>Что вас интересует?</b>", result);
}

async function createOrder(msg, chatId) {
    const id = parseInt(msg.data.split('_')[1]);
    const user = await functions.getUser(msg, 1);
    let text = "";
    if (id) {
        const order = await functions.getSql('orders', 'id=' + id);
        if (!order[0].description) {
            db.query("UPDATE `orders` SET `title`=null WHERE id=" + order[0].id);
            text = "✍️Введите название задания (до 35 символов)";
            const inline_keyboard = [];
            const result = {
                chat_id: chatId,
                message_id: msg.message.message_id,

                parse_mode: "HTML",
                reply_markup: JSON.stringify({inline_keyboard})
            };
            bot.editMessageText(text, result);
        } else {
            db.query("UPDATE `orders` SET `description`=null WHERE id=" + order[0].id);
            const inline_keyboard = [];
            // inline_keyboard.push([{text: order[0].title, callback_data: "_"}]);
            inline_keyboard.push([{
                text: "🔄 Отменить",
                callback_data: "createOrder_" + order[0].id
            }, {text: "Удалить ❌", callback_data: "deleteOrder_" + order[0].id}]);
            const result = {
                chat_id: chatId,
                message_id: msg.message.message_id,

                parse_mode: "HTML",
                reply_markup: JSON.stringify({inline_keyboard})
            };
            bot.editMessageText(`<b>Название задания:  ${order[0].title} </b> 
                                    \n<b>✍️Введите описание до 700 символов</b>`, result);
        }

    } else if (user.admin) {
        const order = await functions.getSql('orders', '(title is null or description is null) and user_id=' + user.id);
        if (order.length <= 0 || !order[0].title) {
            if (order.length > 0 && !order[0].title)
                text = "<b>Вы не закончили настройку задания</b>\n\n✍️ Введите название задания (до 35 символов)";
            else {
                text = "✍️Введите название задания (до 35 символов)";
                db.query("INSERT INTO `orders`(`user_id`) VALUES (" + user.id + ")");
            }
            const inline_keyboard = [];
            const result = {
                chat_id: chatId,
                message_id: msg.message.message_id,

                parse_mode: "HTML",
                reply_markup: JSON.stringify({inline_keyboard})
            };
            bot.editMessageText(text, result).then(async function (callback) {
                const newOrder = await functions.getSql('orders', 'title is null and user_id=' + user.id)
                db.query("UPDATE `orders` SET `message_id`='" + callback.message_id + "' WHERE id=" + newOrder[0].id);
            });
        } else if (!order[0].description) {
            text = "<b>Вы не закончили настройку задания</b>\n✍️Введите описание задания (до 700 символов)";
            const inline_keyboard = [];
            const result = {
                chat_id: chatId,
                message_id: msg.message.message_id,
                parse_mode: "HTML",
                reply_markup: JSON.stringify({inline_keyboard})
            };
            bot.editMessageText(text, result);
        }
    }
}

async function getOrder(msg, chatId) {
    const id = parseInt(msg.data.split('_')[1]);
    const user = await functions.getSql("users", "chat_id=" + chatId);
    const vehicle = await functions.getSql("vehicles", "digits='" + user[0].digits + "'");
    let vehicleInfo = "";
    db.query("DELETE FROM `orders_regions` WHERE order_id=" + id);
    db.query("UPDATE `orders` SET status=2 WHERE id=" + id);
    db.query("DELETE FROM `messages` WHERE chat_id=" + chatId + " and order_id=" + id);
    db.query("INSERT INTO `execution_order`(`order_id`, `user_id`, `message_id`, `chat_id`) VALUES ('" + id + "','" + user[0].id + "','" + msg.message.message_id + "','" + chatId + "')");
    editMessages(id);
    const messages = await functions.getSql('finedOrder', 'chat_id=' + chatId);
    if (messages.length > 0) {
        bot.deleteMessage(chatId, messages[0].message_id);
        db.query("DELETE FROM `finedOrder` WHERE chat_id=" + chatId);
    }
    if (vehicle.length > 0) {
        vehicleInfo = "\n\n<b>Информация о машине:</b> \nМодель: <b>" + vehicle[0].vendor + " " + vehicle[0].model + " " + vehicle[0].model_year + "</b>\nТип: <b>" + vehicle[0].kind + "</b>\nЦвет: <b>" + vehicle[0].color + "</b>";
    } else {
        vehicleInfo = "\n\n<b>Информация о машине не найдена</b>";
    }
    bot.sendMessage(chatId, functions.getEntities(msg.message.text, msg.message.entities) + "\n\n ✅<b>Вы получили задание</b>\n\n<b> 📞 В ближайшее время с Вами свяжется наш сотрудник </b>", options.taskView);

    let condition = `SELECT * FROM users, orders
                WHERE orders.id = '${id}' and orders.user_id=users.id`

    let logistChatId = await functions.querySQL(condition)

    let result = {

        parse_mode: "HTML",
        reply_markup: JSON.stringify({
            one_time_keyboard: true,
            keyboard: [
                [{
                    text: "Просмотр задания"
                }]
            ]
        })
    };
    await functions.forSend(logistChatId[0].chat_id, "<b>Задание:</b>\n" + functions.getEntities(msg.message.text, msg.message.entities) + "\n<b>Исполнитель:</b>" + user[0].name + "\n<b>Telegram: @</b>" + user[0].username + "\n<b>Номер телефона:</b> " + user[0].phone + "\n<b>Номер машины:</b> " + user[0].digits + vehicleInfo, result)

}

async function order(msg, chatId) {
    const id = parseInt(msg.data.split('_')[1]);
    const order = await functions.getSql("orders", "id=" + id);
    const user = await functions.getUser(msg, 1);
    const messages = await functions.getSql('messages', 'order_id=' + id + ' and chat_id=' + chatId);
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
    const inline_keyboard = [];

    inline_keyboard.push([{text: "🔙 Назад", callback_data: "backToList_"}, {
        text: "Взять задание",
        callback_data: "getOrder_" + id
    }]);
    if (user.admin) {
        inline_keyboard.push([{text: "Удалить ❌", callback_data: "deleteOrder_" + order[0].id}]);
    }
    const result = {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    bot.sendMessage(chatId, "<b>" + order[0].title + "</b>\n\n" + order[0].description, result).then(function (callback) {
        db.query("INSERT INTO `messages`(`message_id`, `chat_id`, `order_id`) VALUES ('" + callback.message_id + "','" + chatId + "','" + id + "')");
    });
}

async function stop(msg, chatId) {
    const inline_keyboard = [];
    const result = {
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

async function finedOrder(msg, chatId) {
    const fromChatId = msg.from.id
    const choosedRegion = parseInt(msg.data.split('_')[1]);//регион который выбрал пользователь
    let attemp = false

    let flags = await functions.getSql("finedOrder", "chat_id = " + fromChatId);
    flags = JSON.parse(flags[0].region_id)

    if (!flags.find(item => item == choosedRegion)) flags.push(choosedRegion)
    else {
        const idx = flags.findIndex(item => item == choosedRegion)
        flags.splice(idx , 1)
       attemp = !flags.length ? true : false
    }

    const addRegion = `UPDATE finedOrder
                         SET region_id = '[${flags}]'
                         WHERE chat_id = '${fromChatId}' `;
    await db.query(addRegion)
    await functions.findOrder(chatId, flags, msg.message.message_id,attemp)
}

async function destinationOrder(msg, chatId) {//при первом открытии списка прибытия
    const regions = await functions.getSql("regions")
    const sql = `SELECT * FROM finedOrder
                 WHERE chat_id = '${chatId}'`
    const finedOrder = await functions.querySQL(sql)
    const rangeRegions = finedOrder.length ?  JSON.parse(finedOrder[0].region_id) : null
    if (rangeRegions && !rangeRegions.length){
        return bot.answerCallbackQuery( msg.id, {text: 'Выберите район отправки',show_alert:true});
    }
    const inline_keyboard = []
    for (let i = 0; i < regions.length; i++) {
        inline_keyboard.push([{
            text: regions[i].title,
            callback_data: `saveDestinationOrder_${regions[i].id}`
        }])
    }
    inline_keyboard.push([{text: "🔍Поиск", callback_data: "searchOrder_"}])
    let result = {
        chat_id: chatId,
        message_id: msg.message.message_id,
        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    await bot.editMessageText("<b>Выберете район(-ы) прибытия </b>", result)

}

async function saveDestinationOrder(msg, chatId) {// при открытии списка больше 1
    const choosedRegion = parseInt(msg.data.split('_')[1]);//регион который выбрал пользователь
    const result = await functions.getSql("finedOrder", "chat_id = " + chatId);
    let destinationFlags = JSON.parse(result[0].destination_id)
    if (!destinationFlags.find(item => item == choosedRegion)) destinationFlags.push(choosedRegion)
    else {
        const idx = destinationFlags.findIndex(item => item == choosedRegion)
        destinationFlags.splice(idx , 1)
    }

    const addRegion = `UPDATE finedOrder
                       SET destination_id = '[${destinationFlags}]'
                       WHERE chat_id = '${chatId}' `;
    await db.query(addRegion)
    await refreshList(chatId, destinationFlags, msg.message.message_id)

    async function refreshList(chatId, destinationFlags, messageId) {
        const regions = await functions.getSql('regions', 'status=1');
        const inline_keyboard = [];
        for (let i = 0; i < regions.length; i++) {
            text = destinationFlags && destinationFlags.length && destinationFlags.find(item => item == i + 1) ? "✅ " + `${regions[i].title}` : "➖ " + `${regions[i].title}`
            const district = {text, callback_data: "saveDestinationOrder_" + regions[i].id}
            inline_keyboard.push([district]);
        }
        inline_keyboard.push([{text: "🔍Поиск", callback_data: "searchOrder_"}])
        let result = {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: JSON.stringify({inline_keyboard}),
            parse_mode: "HTML"
        };
        await bot.editMessageText("<b>Выберете район(-ы) прибытия </b>", result)
    }
}

async function saveDestination(msg, chatId) {//после сохранения
    const orderId = msg.data.split("_")[1]
    const region = msg.data.split("_")[2]
    const destination = msg.data.split("_")[3]
    let condition = `SELECT * FROM orders 
                       WHERE id = '${orderId}'`
    let order = await functions.querySQL(condition)
    order = order[0]
    condition = `UPDATE orders 
                 SET destination = '${destination}'
                 WHERE id  = '${orderId}'`
    db.query(condition)

    const inline_keyboard = []
    inline_keyboard.push([{text: "Удалить ❌", callback_data: "deleteOrder_" + orderId}, {
        text: "✅ Создать", callback_data: "sendOrder_" + orderId + "_" + region + "_" + destination
    }]);
    const result = {
        chat_id: chatId,
        message_id: order.message_id,
        parse_mode: "HTML",
        reply_markup: JSON.stringify({inline_keyboard})
    };
    return bot.editMessageText("<b>Название задания: </b>" + order.title + "\n<b>Описание:</b>" + order.description + "\n<b>Район отправки:</b>" + city[region] + "\n<b>Район прибытия: </b>" + city[destination], result)

}

async function searchOrder(msg, chatId) {
    const user = await functions.getUser(msg, 1);
    const verify = await functions.verifyUser(user);
    if (!verify) return

    let finedOrder = await functions.getSql("finedOrder", "chat_id = " + chatId)//ищет пользователся в поиске
    if (!finedOrder.length) {
        bot.sendMessage(chatId, "<b>Пожалуйста,выберите регион</b>", options.searchOrder)
        return
    }
    let rangeRegions = JSON.parse(finedOrder[0].region_id)//выбранные регионы
    let rangeDestinations = JSON.parse(finedOrder[0].destination_id)//множество значений

    let inline_keyboard = [];
    let text = ""

    if (!rangeDestinations.length){
        return bot.answerCallbackQuery( msg.id, {text: 'Выберите район , в который хотите доставить заказ',show_alert:true});
    }

    let sql = `SELECT * FROM orders_regions , orders
                 WHERE orders_regions.status=1 and orders.status=1
                 AND orders.id =orders_regions.order_id and FIND_IN_SET(orders_regions.region_id, '${rangeRegions}')
                 AND orders.destination IN(${rangeDestinations}) `

    const orders = await functions.querySQL(sql)

    text += "<b>Откуда: </b>" + helpers.formateTextRegions(rangeRegions, city)
    text += "\n<b>Куда: </b>" + helpers.formateTextRegions(rangeDestinations , city)
    if (!orders.length) {
        text += "\n<b>По вашему запросу ничего не найдено</b>"
        inline_keyboard.push([{text: "🔄 Обновить", callback_data: "searchOrder_"}])
        inline_keyboard.push([{text: "🔙 Вернуться в гланое меню", callback_data: "stop_"}]);
        options.default.chat_id = chatId
        options.default.message_id = msg.message.message_id
        options.default.reply_markup = JSON.stringify({inline_keyboard})
        return bot.editMessageText(text,  options.default)
    } else {
        text+="\n<b>Всего найдено заказов: </b>"+orders.length
        for (var i = 0; i < orders.length; i++) {
            inline_keyboard.push([{text: orders[i].title, callback_data: "order_" + orders[i].id}]);//делаем кнопки по регионам
        }
        inline_keyboard.push([{text: "🔄 Обновить", callback_data: "searchOrder_"}])
        inline_keyboard.push([{text: "🔙 Вернуться в главное меню", callback_data: "stop_"}]);


        let setStatusInProcess = `UPDATE finedOrder
                              SET status = '1'
                              WHERE chat_id = '${chatId}' `;
        await db.query(setStatusInProcess)//меняем статус пользователя  на активный

        if (orders.length > 0)
            text += "\n\n<b>Выберете из списка ниже:</b>";

        options.default.chat_id = chatId
        options.default.message_id = msg.message.message_id
        options.default.reply_markup =  JSON.stringify({inline_keyboard})

        return bot.editMessageText(text, options.default)
            .then(callback=> console.log(callback))
            .catch(err=>console.log(err))
    }
}

async function changeAuto(msg, chatId) {
    try {
        const user = await functions.getUser(msg, 1)
        const {digits} = user
        let sql = `DELETE FROM vehicles
                   WHERE digits = '${digits}'`
        await db.query(sql)
        sql = `UPDATE users
               SET digits = null , photo = null
               WHERE chat_id = '${chatId}'`
        await db.query(sql)
        user.digits = null
        await functions.verifyUser(user)
    } catch (err) {
        console.log(err)
        bot.sendMessage(chatId, "Ошибка!Попробуйте еще раз...")
    }
}

async function backToMenu(msg, chatId) {
    bot.sendMessage(chatId, "<b>Главное меню</b>", options.mainMenu)
}

async function enterData(msg) {
    const chatId = msg
    const sql = `UPDATE users
                     SET auto_fill = false
                     WHERE chat_id= '${chatId}'`;
    await db.query(sql)
    const user = await functions.getUser(msg, 1)
    await functions.verifyUser(user)
}

async function editMessages(order, type) {
    let messages = await functions.getSql('messages', 'order_id=' + order);
    if (messages.length > 0) {
        let result = {
            chat_id: messages[0].chat_id,
            message_id: messages[0].message_id,

            parse_mode: "HTML"
        };
        bot.editMessageText(type === 'delete' ? "✅ Задание было удалено" : "Задание забрали в работу", result);
        db.query("DELETE FROM `messages` WHERE id=" + messages[0].id);
        setTimeout(function () {
            editMessages(order);
        }, 300);
    }
}

async function backToList(msg, chatId) {
    bot.deleteMessage(chatId, msg.message.message_id)
}


module.exports = {
    holdOrder,
    completeOrder,
    executionOrder,
    acceptOrder,
    adminMenu,
    sendOrder,
    sendOrders,
    deleteOrder,
    createOrder,
    getOrder,
    order,
    stop,
    finedOrder,
    changeAuto,
    backToMenu,
    enterData,
    editMessages,
    backToList,
    saveDestination,
    destinationOrder,
    saveDestinationOrder,
    searchOrder
}

