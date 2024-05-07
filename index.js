const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');

const token = '7062349272:AAFCsGbapXvuuokak8JXaK8K9qzucUKEPPQ';
const webAppUrl = 'https://quiet-wisp-11b4c9.netlify.app';

const bot = new TelegramBot(token, { polling: true });
const app = express();

// Указываем, что Nginx является проксирующим сервером
app.set('trust proxy', true);
app.use(express.json());
app.use(cors());

const products = [
    { id: '1', tittle: 'Оперативная память', price: 5000, description: 'Оперативная память 8 GB Kingston HX436C17PB4/8', image: 'https://www.pcplanet.ru/public_files/products/c3/e2/c3e2cddb3e54f52d8cc788d6b576eda2/original.jpg' },
    { id: '2', tittle: 'Куртка', price: 12000, description: 'Зеленого цвета, теплая' },
    { id: '3', tittle: 'Джинсы 2', price: 5000, description: 'Синего цвета, прямые' },
    { id: '4', tittle: 'Куртка 8', price: 10000, description: 'Зеленого цвета, тепла' },
    { id: '5', tittle: 'Джинсы 3', price: 5000, description: 'Синего цвета, прямые' },
    { id: '6', tittle: 'Куртка 7', price: 4000, description: 'Зеленого цвета, тепла' },
    { id: '7', tittle: 'Джинсы 4', price: 5500, description: 'Синего цвета, прямые' },
    { id: '8', tittle: 'Куртка 5', price: 13000, description: 'Зеленого цвета, тепла' },
];

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    console.log(msg);

    if (text === '/start') {
        await bot.sendMessage(chatId, 'Ниже появится кнопка, заполни форму', {
            reply_markup: {
                keyboard: [
                    [{ text: 'Заполнить форму', web_app: { url: webAppUrl + '/form' } }]
                ]
            }
        })

        await bot.sendMessage(chatId, 'Заходи в наш интернет магазин по кнопке ниже', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]
                ]
            }
        })
    }

    if (msg?.web_app_data?.data) {
        try {
            const data = JSON.parse(msg?.web_app_data?.data)
            await bot.sendMessage(chatId, 'Спасибо за обратную связь!')
            await bot.sendMessage(chatId, 'Ваша страна' + data?.country);
            await bot.sendMessage(chatId, 'Ваша улица' + data?.street)
        } catch (e) {
            console.log(e);
        }
    }
});

app.get('/productlist', async (req, res) => {
    return res.status(200).json({ products });
})

app.post('/web-data', async (req, res) => {
    const { queryId, products, totalPrice } = req.body;
    try {
        await bot.answerWebAppQuery(queryId, {
            type: 'article',
            id: queryId,
            title: 'Успешная покупка',
            input_message_content: { message_text: 'Поздравляю с покупкой, вы приобрели товар на сумму ' + totalPrice }
        })
        return res.status(200).json({});
    } catch (e) {
        await bot.answerWebAppQuery(queryId, {
            type: 'article',
            id: queryId,
            title: 'Не удалось приобрести товар',
            input_message_content: { message_text: 'Не удалось приобрести товар' }
        })
        return res.status(500).json({});
    }
})

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/tg-bot-1.koala1101.ru/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/tg-bot-1.koala1101.ru/fullchain.pem'),
};

const PORT = process.env.PORT || 443;

https.createServer(options, app).listen(PORT, () => {
    console.log('Server started on port ' + PORT);
});


