const {bot} = require("./bot");
const options = require("./options");
const functions = require("./functions")
const initDB = require("./init_db");

const db = initDB.handleDisconnect();

module.exports = {
    async callOrder(msg, chatId) {
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
    },
    async completeOrder(msg, chatId) {
        let order = parseInt(msg.data.split('_')[1]);
        const user_id = parseInt(msg.data.split('_')[2]);
        const inline_keyboard = [];
        inline_keyboard.push([{text: '🔙 Меню', callback_data: "adminMenu_"}]);
        const result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText(functions.getEntities(msg.message.text, msg.message.entities) + "\n\nЗадание завершено ✅", result);

        const user = await functions.getSql('users', 'id=' + user_id);
        order = await functions.getSql('orders', 'id=' + order);
        const messages = await functions.getSql('messages', 'order_id=' + order[0].id + ' and user_id=' + user_id);
        if (messages.length > 0) {
            bot.deconsteMessage(user[0].chat_id, messages[0].message_id);
            db.query("DELETE FROM `messages` WHERE id=" + messages[0].id);
        }
        db.query("UPDATE `orders` SET status=3 WHERE id=" + order[0].id);
        db.query("DELETE FROM `execution_order` WHERE order_id=" + order[0].id);
        db.query("INSERT INTO `orders_end`(`id_user`, `order_id`) VALUES (" + user[0].id + "," + order[0].id + ")");

        bot.sendMessage(user[0].chat_id, "<b>" + order[0].title + "</b>\n\n" + order[0].description + "\n\nЗадание завершено ✅", options.mainMenu)
    },
    async executionOrder(msg, chatId) {
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
            vehicleInfo = "\n\n<i>Информация о машине:</i> \nМодель: <b>" + vehicle[0].vendor + " " + vehicle[0].model + " " + vehicle[0].model_year + "</b>\nТип: <b>" + vehicle[0].kind + "</b>\nЦвет: <b>" + vehicle[0].color + "</b>";
        } else {
            vehicleInfo = "\n\n<i>Информация о машине не найдена</i>";
        }
        bot.editMessageText("<i>Задание:</i>\n<b>" + order[0].title + "</b>\n\n" + order[0].description + "\n\n<i>Исполнитель:</i>\nИмя: <b>" + user[0].name + "</b>\nTelegram: @" + user[0].username + "\nНомер телефона: <b>" + user[0].phone + "</b>\nНомер машины: <b>" + user[0].digits + "</b>" + vehicleInfo, result);
    },
    async acceptOrder(msg, chatId) {
        const orders = await functions.getSql('execution_order,orders', 'execution_order.status=1 and orders.status=2 and orders.id = execution_order.order_id', 'orders.title, orders.id, execution_order.user_id');
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
    },
    async adminMenu(msg, chatId) {
        const inline_keyboard = [];
        inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
        inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
        inline_keyboard.push([{text: "Отправить задание", callback_data: "sendOrder_"}]);
        inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);
        const result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText("<b>Что вас интересует?</b>", result);
    },
    async sendOrder(msg, chatId) {
        const id = parseInt(msg.data.split('_')[1]);
        const region = parseInt(msg.data.split('_')[2]);
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
                    callback_data: "sendOrder_" + id + "_" + regions[i].id
                }]);
            }
            text = "<b>Выберете район по каторому будет отправка</b>";
        } else {//значит регион выбран , оформляем задание и записываем в базу
            const checkActiv = await functions.getSql('orders_regions', 'region_id=' + region + ' and order_id=' + id);
            if (checkActiv.length <= 0) {
                db.query("INSERT INTO `orders_regions`(`region_id`, `order_id`) VALUES (" + region + "," + id + ")");//на этом этапе записываем orders_regions
                db.query("UPDATE `orders` SET `status`=1 WHERE id=" + id);//переводим в статус режима ожидания пока задание кто-то возьмет

                const regions = await functions.getSql('finedOrder', 'status=1 and region_id=' + region);
                text = "Пользователей ожидающих задания в этом районе: <b>" + regions.length + "</b>\nИдет отправка, ожидайте ...";
                const result = {
                    chat_id: chatId,
                    message_id: msg.message.message_id,

                    parse_mode: "HTML",
                    reply_markup: JSON.stringify({inline_keyboard})
                };
                bot.editMessageText(text, result);
                const sends = await this.sendOrders(id, region);
                console.log(sends)
                text = "Пользователей ожидающих задания в этом районе: <b>" + regions.length + "</b>\nОтправленно сообщений: <b>" + sends + "</b>";
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
    },
    async sendOrders(order, region, i = 0) {// отвечает за рассылку сообщений
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
                        const send_i = await this.sendOrders(order.id, region, i + 1);
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
    },
    async deleteOrder(msg, chatId) {
        const id = parseInt(msg.data.split('_')[1]);
        db.query("DELETE FROM `orders` WHERE id=" + id);
        this.editMessages(id);
        const inline_keyboard = [];
        inline_keyboard.push([{text: "Задания на выполнении", callback_data: "acceptOrder_"}]);
        inline_keyboard.push([{text: "Ожидают исполнителей", callback_data: "holdOrder_"}]);
        inline_keyboard.push([{text: "Отправиь задание", callback_data: "sendOrder_"}]);
        inline_keyboard.push([{text: "Создать задание", callback_data: "createOrder_"}]);
        const result = {
            chat_id: chatId,
            message_id: msg.message.message_id,

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText("<b>Что вас интересует?</b>", result);
    },
    async createOrder(msg, chatId) {
        const id = parseInt(msg.data.split('_')[1]);
        const user = await functions.getUser(msg, 1);
        let text = "";
        if (id) {
            const order = await functions.getSql('orders', 'id=' + id);
            if (!order[0].description) {
                db.query("UPDATE `orders` SET `title`=null WHERE id=" + order[0].id);
                text = "Введите название задания (до 35 символов)";
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
                inline_keyboard.push([{text: order[0].title, callback_data: "_"}]);
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
                bot.editMessageText("Название: \n<b>" + order[0].title + "</b> \nПроверьте ниже⬇️ \nТак будет выглядеть  название в списке. \n\n<b>Введите описание до 700 символов</b>", result);
            }

        } else if (user.admin) {
            const order = await functions.getSql('orders', '(title is null or description is null) and user_id=' + user.id);
            if (order.length <= 0 || !order[0].title) {
                if (order.length > 0 && !order[0].title)
                    text = "<b>Вы не закончили настройку задания</b>\n\nВведите название задания (до 35 символов)";
                else {
                    text = "Введите название задания (до 35 символов)";
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
                text = "<b>Вы не закончили настройку задания</b>\n\nВведите описание задания (до 700 символов)";
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
    },
    async getOrder(msg, chatId) {
        const id = parseInt(msg.data.split('_')[1]);
        const user = await functions.getSql("users", "chat_id=" + chatId);
        const vehicle = await functions.getSql("vehicles", "digits='" + user[0].digits + "'");
        let vehicleInfo = "";
        db.query("DELETE FROM `orders_regions` WHERE order_id=" + id);
        db.query("UPDATE `orders` SET status=2 WHERE id=" + id);
        db.query("DELETE FROM `messages` WHERE chat_id=" + chatId + " and order_id=" + id);
        db.query("INSERT INTO `execution_order`(`order_id`, `user_id`, `message_id`, `chat_id`) VALUES ('" + id + "','" + user[0].id + "','" + msg.message.message_id + "','" + chatId + "')");
        this.editMessages(id);
        const messages = await functions.getSql('finedOrder', 'chat_id=' + chatId);
        if (messages.length > 0) {
            bot.deleteMessage(chatId, messages[0].message_id);
            db.query("DELETE FROM `finedOrder` WHERE chat_id=" + chatId);
        }
        bot.deleteMessage(chatId, msg.message.message_id);
        if (vehicle.length > 0) {
            vehicleInfo = "\n\n<i>Информация о машине:</i> \nМодель: <b>" + vehicle[0].vendor + " " + vehicle[0].model + " " + vehicle[0].model_year + "</b>\nТип: <b>" + vehicle[0].kind + "</b>\nЦвет: <b>" + vehicle[0].color + "</b>";
        } else {
            vehicleInfo = "\n\n<i>Информация о машине не найдена</i>";
        }
        bot.sendMessage(chatId, functions.getEntities(msg.message.text, msg.message.entities) + "\n\n✅ <b>Вы получили задание</b>", options.taskView);
        const admins = await functions.getSql('admins,users', 'admins.user_id = users.id', 'users.chat_id');
        var result = {

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
        for (let i = 0; i < admins.length; i++) {
            await functions.forSend(admins[i].chat_id, "<i>Задание:</i>\n" + functions.getEntities(msg.message.text, msg.message.entities) + "\n\n<i>Исполнитель:</i>\nИмя: " + user[0].name + "\nTelegram: @" + user[0].username + "\nНомер телефона: " + user[0].phone + "\nНомер машины: " + user[0].digits + vehicleInfo, result)
        }
    },
    async order(msg,chatId){
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
                this.editMessages(order[0].id);
            return;
        }
        const inline_keyboard = [];
        if (user.admin)
            inline_keyboard.push([{text: "Удалить ❌", callback_data: "deleteOrder_" + order[0].id}]);
        inline_keyboard.push([{text: "Взять задание", callback_data: "getOrder_" + id}]);
        const result = {
            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.sendMessage(chatId, "<b>" + order[0].title + "</b>\n\n" + order[0].description, result).then(function (callback) {
            db.query("INSERT INTO `messages`(`message_id`, `chat_id`, `order_id`) VALUES ('" + callback.message_id + "','" + chatId + "','" + id + "')");
        });
    },
    async stop(msg,chatId){
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
    },
    async finedOrder(msg,chatId){
        const fromChatId = msg.from.id
        const choosedRegion = parseInt(msg.data.split('_')[1]);//регион который выбрал пользователь

        let flags = await functions.getSql("finedOrder", "chat_id = " + fromChatId);
        flags = JSON.parse(flags[0].region_id)

        if (!flags.find(item => item == choosedRegion)) flags.push(choosedRegion)
        else return

        const addRegion = `UPDATE finedOrder
                         SET region_id = '[${flags}]'
                         WHERE chat_id = '${fromChatId}' `;
        await db.query(addRegion)
        await functions.findOrder(chatId, flags, msg.message.message_id)
    },
    async changeAuto(msg,chatId){
        try {
            bot.deleteMessage(chatId, msg.message.message_id)
            bot.deleteMessage(chatId, msg.message.message_id - 1)
            const  user = await functions.getUser(msg, 1)
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
    },
    async backToMenu(msg,chatId){
        bot.deleteMessage(chatId, msg.message.message_id)
        bot.deleteMessage(chatId, msg.message.message_id - 1)
        bot.sendMessage(chatId, "<b>Главное меню</b>", options.mainMenu);
    },
    async enterData(msg){
        const chatId = msg
        const sql = `UPDATE users
                     SET auto_fill = false
                     WHERE chat_id= '${chatId}'`;
        await db.query(sql)
        const user = await functions.getUser(msg, 1)
        await functions.verifyUser(user)
    },
    async  editMessages(order) {
        var messages = await functions.getSql('messages', 'order_id=' + order);
        if (messages.length > 0) {
            var result = {
                chat_id: messages[0].chat_id,
                message_id: messages[0].message_id,

                parse_mode: "HTML"
            };
            bot.editMessageText("Задание забрали в работу", result);
            db.query("DELETE FROM `messages` WHERE id=" + messages[0].id);
            setTimeout(function () {
               this.editMessages(order);
            }, 300);
        }
    }
}

