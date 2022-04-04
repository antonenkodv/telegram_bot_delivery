module.exports={
    default : {
        parse_mode: "HTML"
    },
    shareContact : {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
            one_time_keyboard: true,
            keyboard: [
                [{
                    text: "Поделится контактом",
                    request_contact: true
                }]
            ]
        })
    },
    searchOrder :  {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
            one_time_keyboard: true,
            keyboard: [
                [{
                    text: "Поиск заказа"
                }]
            ]
        })
    },
    mainMenu:  {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
            one_time_keyboard: true,
            keyboard: [
                [{
                    text: "Поиск заказа"
                }],
                [{
                    text: "Настройки"
                }]
            ]
        })
    },
    taskView : {
        parse_mode: "HTML",
        reply_markup: JSON.stringify({
            one_time_keyboard: true,
            keyboard: [
                [{
                    text: "Просмотр задания"
                }]
            ]
        })
    }
}