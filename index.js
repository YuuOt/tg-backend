const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const token = '7062349272:AAFCsGbapXvuuokak8JXaK8K9qzucUKEPPQ';
const webAppUrl = 'https://quiet-wisp-11b4c9.netlify.app';
const serviceAccount = require('./serviceAccountKey.json');

const bot = new TelegramBot(token, { polling: true });
const app = express();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Получение списка продуктов из Firestore
const getProductsFromFirestore = async () => {
  try {
    const snapshot = await db.collection('products').get();
    const products = [];
    snapshot.forEach(doc => {
      products.push(doc.data());
    });
    return products;
  } catch (error) {
    console.error('Error getting products from Firestore:', error);
    throw error;
  }
};

app.use(express.json());
app.use(cors());

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
  const text = msg.text;
  console.log(msg);
  

  if(text === '/start') {
        await bot.sendMessage(chatId,'Ниже появится кнопка, заполни форма', {
            reply_markup: {
                keyboard: [
                    [{text: 'Заполнить форму', web_app: {url: webAppUrl +'/form'}}]
                ]
            }
        })

        await bot.sendMessage(chatId,'Заходи в наш интернет магазин по кнопке ниже', {
            reply_markup: {
                inline_keyboard: [
                    [{text: 'Сделать заказ', web_app: {url: webAppUrl}}]
                ]
            }
        })
  }


    if(msg?.web_app_data?.data) {
        try{
            const data = JSON.parse(msg?.web_app_data?.data)


            await bot.sendMessage(chatId,'Спасибо за обратную связь!')
            await bot.sendMessage(chatId,'Ваша страна'+ data?.country);
            await bot.sendMessage(chatId,'Ваша улица'+ data?.street)
        } catch (e) {
            console.log(e);
        }
        
    }

});

app.get('/productlist', async (req, res) => {
  try {
    const products = await getProductsFromFirestore();
    return res.status(200).json({ products });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get products' });
  }
});

app.post('/web-data', async (req, res) => {
    const {queryId, products, totalPrice} =req.body;
    try {
      await bot.answerWebAppQuery(queryId,{
            type: 'article',
            id: queryId,
            title: 'Успешная покупка',
            input_message_content: {message_text: 'Поздравляю с покупкой, вы приобрели товар на сумму ' + totalPrice}
        })
        return res.status(200).json({});
    } catch(e){
        await bot.answerWebAppQuery(queryId,{
            type: 'article',
            id: queryId,
            title: 'Не удалось приобрести товар',
            input_message_content: {message_text: 'Не удалось приобрести товар'}
        })
        return res.status(500).json({});
    }
});

const PORT = 8000;
app.listen(PORT, () => console.log('Server started on PORT ' + PORT));


/*const products = [
    {id:'3', tittle: 'Процессор', price: 25000, description: 'Процессор Intel Core i9 7900X-(3.3 GHz) сокет 2066 L3 кэш 13.75 MB',  image: 'https://www.pcplanet.ru/public_files/products/4f/ac/4fac845da748c4fdacee909dfdf3f2e5/original.jpg'},
    {id:'4', tittle: 'Видеокарта', price: 75000, description: 'Видеокарта ASUS ROG-STRIX-RTX3070TI-O8G-GAMING RTX3070TI 8GB GDDR6X 256bit 2xHDMI 3xDP RTL',  image: 'https://torg-pc.ru/upload/iblock/db2/0g5ulsbmk8yzerhoevkurnd8vvk0slm6/orig%20-%202021-11-12T122859.678.jpg'},
    {id:'5', tittle: 'Материнская плата', price: 30000, description: 'Материнская плата ASUS CROSSHAIR VI HERO (AM4, ATX)',  image: 'https://digitik.ru/upload/iblock/3d4/3d4075c3578902669d05546458abd0c1.jpg'},
    {id:'6', tittle: 'ssd m2', price: 13000, description: 'Накопитель SSD M2 1Tb Samsung 970 EVO Plus MZ-V7S1T0BW',  image: 'https://pc4you.ru/upload/iblock/0a7/0a7ac986bc390664ecca59dd1c11603c.jpg'},
    {id:'7', tittle: 'Водяная система охлаждения', price: 17500, description: 'Система водяного охлаждения ASUS ROG STRIX LC 360',  image: 'https://digitik.ru/upload/iblock/2d2/2d2ef671c557c376d72ec5b1aea2529d.png'},
    {id:'8', tittle: 'Блок питание', price: 13000, description: 'Блок питания thermaltake litepower 550w <550w, (20+4+4+4) pin, 2x(6+2) pin, 5xsata, 4xmolex, fdd, 12',  image: 'https://officeneeds.ru/upload/iblock/d35/d350b3230e9492d445412eb56818abb4.jpg'},
]*/