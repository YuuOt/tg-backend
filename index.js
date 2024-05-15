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
        await bot.sendMessage(chatId,'Ниже появится кнопка, заполнить форму', {
            reply_markup: {
                keyboard: [
                    [{text: 'Заполнить форму', web_app: {url: webAppUrl +'/form'}}]
                ]
            }
        })
        await bot.sendMessage(chatId,'Команда для поиска товара: /search "название товара"')
        await bot.sendMessage(chatId,'Заходите в наш интернет магазин по кнопке ниже', {
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
            await bot.sendMessage(chatId,'Ваша страна: '+ data?.country);
            await bot.sendMessage(chatId,'Почта: '+ data?.street)
        } catch (e) {
            console.log(e);
        }
        
    }

});

bot.onText(/\/search/, async (msg) => {
    const chatId = msg.chat.id;
    const searchQuery = msg.text.split(' ')[1];
  
    if (!searchQuery) {
      bot.sendMessage(chatId, 'Пожалуйста, укажите ключевое слово для поиска.');
      return;
    }
  
    try {
      const products = await getProductsFromFirestore();
      const foundProducts = products.filter(product => {
        return Object.values(product).some(value => {
          if (typeof value === 'string') {
            return value.toLowerCase().includes(searchQuery.toLowerCase());
          }
          return false;
        });
      });
  
      if (foundProducts.length === 0) {
        bot.sendMessage(chatId, 'По вашему запросу ничего не найдено.');
      } else {
        const productInfo = foundProducts.map(product => {
          return `Название: ${product.tittle}\nОписание: ${product.description}\nЦена: ${product.price}`;
        }).join('\n\n');
        await bot.sendMessage(chatId, `Найденные товары:\n${productInfo}`);
        await bot.sendMessage(chatId,'Заказать найденный товар можно по кнопке ниже', {
            reply_markup: {
                inline_keyboard: [
                    [{text: 'Сделать заказ', web_app: {url: webAppUrl}}]
                ]
            }
        })
      }
    } catch (error) {
      console.error('Error searching for products:', error);
      bot.sendMessage(chatId, 'Произошла ошибка при поиске товаров.');
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
    const {queryId, products, totalPrice,tg} =req.body;
    try {
      await bot.answerWebAppQuery(queryId,{
            type: 'article',
            id: queryId,
            title: 'Успешная покупка',
            input_message_content: {message_text: 'Вы оформили заказа, ' + tg.MainButton.text }
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
