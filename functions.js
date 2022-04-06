const mysql = require('mysql')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const options = require('./options')
const {bot} = require('./bot')
const promisify = require('util').promisify;
const AWS = require("aws-sdk");
const initDB = require("./init_db");
const s3 = new AWS.S3()
const aws = {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    region: process.env.REGION
}
AWS.config.setPromisesDependency();
AWS.config.update(aws)

const db = initDB.handleDisconnect();

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

async function findOrder(chatId, flags = [], messageId) {
    const regions = await getSql('regions', 'status=1');//получаем все регионы
    const inline_keyboard = [];
    for (let i = 0; i < regions.length; i++) {
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
                    const user = await getSql("users", "chat_id=" + chatId);
                    await db.query("INSERT INTO `finedOrder`(`user_id`,`message_id`, `chat_id`) VALUES ('" + user[0].id + "','" + callback.message_id + "','" + chatId + "')");
                }
            });
    }
}

async function forSend(chatId, text, result) {
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

function getUser(msg, type = 0) {
    return new Promise(resolve => {
        let url = "";
        let chatId = "";

        if (msg.text && type == 0)
            url = msg.text.split(' ')[1];
        else
            url = false;
        if (type == 0)
            chatId = msg.chat.id;
        else
            chatId = msg.message.chat.id;
        db.query("SELECT * FROM users WHERE chat_id=" + chatId, async function (err, user, fields) {

            if (err) {
                console.log("ERROR 77: " + err);
                resolve(false);
                return;
            }
            if (user.length <= 0) {
                db.query("INSERT INTO `users`(`name`,`chat_id`,`username`) VALUES (" + mysql.escape(msg.from.first_name) + ",'" + chatId + "'," + mysql.escape(msg.from.username) + ")");
                console.log("Registration end");
                let user = await getSql("users", "chat_id = " + chatId);
                user = user[0];
                if (url) {
                    const ref = await getSql('users', 'chat_id=' + mysql.escape(url));
                    if (ref.length <= 0) {
                        db.query("INSERT INTO `users`(`name`,`chat_id`,`ref_url`,`username`) VALUES (" + mysql.escape(msg.from.first_name) + ",'" + chatId + "'," + mysql.escape(url) + "," + mysql.escape(msg.from.username) + ")");
                    } else {
                        db.query("INSERT INTO `users`(`name`,`chat_id`,`ref`,`username`) VALUES (" + mysql.escape(msg.from.first_name) + ",'" + chatId + "'," + mysql.escape(url) + "," + mysql.escape(msg.from.username) + ")");
                    }
                }
            } else
                user = user[0];
            if (url) {
                const adminCheck = await getSql("admins", "user_id=" + user.id);
                if (adminCheck.length <= 0) {
                    let admin = await getSql("admins", "link = " + mysql.escape(url) + " and user_id is NULL");
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

                const admin = await getSql("admins", "user_id = " + user.id)
                if (admin.length > 0)
                    user.admin = true;
                else
                    user.admin = false;

            }
            resolve(user)
        });
    })
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

module.exports = {
    getSql,
    findOrder,
    forSend ,
    getUser,
    verifyUser ,
    saveOrderTitle,
    uploadLocalImage,
    uploadToS3 ,
    getEntities,
    saveOrderDesc ,
    querySQL
}
