const mysql = require("mysql");
const options = require("./options");

async function createOffer(msg, user) {
    let chatId = user.chat_id;
    let inline_keyboard = []
    if (msg.text.indexOf(user.org.link) >= 0)
        return;
    if (user.org.title == null) {
        db.query("UPDATE `organization` SET `title`=" + mysql.escape(msg.text) + " WHERE id=" + user.org.id);
        bot.sendMessage(chatId, "<b>" + msg.text + "</b>\n\nНапишіть короткий опис:", options.default);
    } else if (user.org.body == null) {
        db.query("UPDATE `organization` SET `body`=" + mysql.escape(msg.text) + " WHERE id=" + user.org.id);
        bot.sendMessage(chatId, "<b>" + user.org.title + "</b>\n\n<b>" + msg.text + "</b>\n\nНапишіть ваші контакти:", options.default);
    } else if (user.org.contact == null) {
        db.query("UPDATE `organization` SET `contact`=" + mysql.escape(msg.text) + " WHERE id=" + user.org.id);
        var category = await getSql('category', "status=1");
        for (var i = 0; i < category.length; i++) {
            inline_keyboard.push([{
                text: category[i].title,
                callback_data: "adminCat_" + category[i].id + "_" + user.org.id
            }]);
        }
        var result = {

            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.sendMessage(chatId, "<b>" + user.org.title + "</b>\n\n<b>" + user.org.body + "</b>\n\n<b>" + msg.text + "</b>\n\nЩо ви приймаєте:", result);
    } else if (user.admin.status == 2) {
        var item = await getSql('items', "title is NULL and user_id=" + user.id);
        bot.deleteMessage(chatId, msg.message_id);
        db.query("UPDATE `items` SET `title`=" + mysql.escape(msg.text) + ", status=1 WHERE id=" + item[0].id);
        db.query("UPDATE `admins` SET status=1 WHERE user_id=" + user.id);
        db.query("INSERT INTO `organization_items`(`organization_id`, `item_id`, `status`) VALUES ('" + user.org.id + "','" + item[0].id + "','1')");
        var items = await getSql('items', 'status=1 and category_id=' + item[0].category_id);
        var orgItems = await getSql('organization_items', 'status=1 and organization_id=' + user.org.id);
        var itemsCheck = {};
        for (var i = 0; i < orgItems.length; i++) {
            itemsCheck[orgItems[i].item_id] = true;
        }
        let inline_keyboard = [];
        for (var i = 0; i < items.length; i++) {
            if (itemsCheck[items[i].id])
                var check = "✅ ";
            else
                var check = "❌ ";

            inline_keyboard.push([{
                text: check + items[i].title,
                callback_data: "adminAddItem_" + items[i].id + "_" + user.org.id + "_" + item[0].category_id
            }]);
        }
        inline_keyboard.push([{
            text: "📝 Додати інше ...",
            callback_data: "adminAddItem_" + 0 + "_" + user.org.id + "_" + item[0].category_id
        }]);
        inline_keyboard.push([{text: "🔙 До катигорій", callback_data: "main_" + 1}]);
        var result = {
            chat_id: chatId,
            message_id: user.admin.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({inline_keyboard})
        };
        bot.editMessageText("<b>Які речі ви приймаєте?</b>", result);
    }
}