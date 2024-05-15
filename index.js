const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const webAppUrl = 'YOUR_WEB_APP_URL';
const serviceAccount = require('./serviceAccountKey.json');

const bot = new TelegramBot(token, { polling: true });
const app = express();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const chatState = {};

const getProductsFromFirestore = async (searchText = '') => {
  try {
    const snapshot = await db.collection('products').get();
    const products = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!searchText || data.name.toLowerCase().includes(searchText.toLowerCase()) || data.description.toLowerCase().includes(searchText.toLowerCase())) {
        products.push(data);
      }
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

  if (text === '/start') {
    await bot.sendMessage(chatId, 'Ниже появится кнопка, заполни форму', {
      reply_markup: {
        keyboard: [[{ text: 'Заполнить форму', web_app: { url: webAppUrl + '/form' } }]]
      }
    });

    await bot.sendMessage(chatId, 'Заходи в наш интернет магазин по кнопке ниже', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]]
      }
    });
  } else if (text.startsWith('/search')) {
    const searchText = text.slice(8).trim();
    if (searchText === '') {
      await bot.sendMessage(chatId, 'Пожалуйста, введите название или описание товара для поиска.');
      chatState[chatId] = 'waiting_for_search';
    } else {
      try {
        const products = await getProductsFromFirestore(searchText);
        if (products.length === 0) {
          await bot.sendMessage(chatId, 'По вашему запросу ничего не найдено.');
        } else {
          const productInfo = products.map(product => `${product.name}: ${product.price}`).join('\n');
          await bot.sendMessage(chatId, `Найденные товары:\n${productInfo}`);
          await bot.sendMessage(chatId, 'Заказать найденный товар можно по кнопке ниже', {
            reply_markup: {
              inline_keyboard: [[{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]]
            }
          });
        }
      } catch (error) {
        console.error('Error searching for products:', error);
        bot.sendMessage(chatId, 'Произошла ошибка при поиске товаров.');
      }
    }
  } else if (chatState[chatId] === 'waiting_for_search') {
    chatState[chatId] = null; // Reset the state
    const searchText = text;
    try {
      const products = await getProductsFromFirestore(searchText);
      if (products.length === 0) {
        await bot.sendMessage(chatId, 'По вашему запросу ничего не найдено.');
      } else {
        const productInfo = products.map(product => `${product.name}: ${product.price}`).join('\n');
        await bot.sendMessage(chatId, `Найденные товары:\n${productInfo}`);
        await bot.sendMessage(chatId, 'Заказать найденный товар можно по кнопке ниже', {
          reply_markup: {
            inline_keyboard: [[{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]]
          }
        });
      }
    } catch (error) {
      console.error('Error searching for products:', error);
      bot.sendMessage(chatId, 'Произошла ошибка при поиске товаров.');
    }
  } else if (msg?.web_app_data?.data) {
    try {
      const data = JSON.parse(msg?.web_app_data?.data);

      await bot.sendMessage(chatId, 'Спасибо за обратную связь!');
      await bot.sendMessage(chatId, `Ваша страна: ${data?.country}`);
      await bot.sendMessage(chatId, `Ваша улица: ${data?.street}`);
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
  const { queryId, products, totalPrice, tg } = req.body;
  try {
    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: 'Успешная покупка',
      input_message_content: { message_text: 'Вы оформили заказ, ' + tg.MainButton.text }
    });
    return res.status(200).json({});
  } catch (e) {
    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: 'Не удалось приобрести товар',
      input_message_content: { message_text: 'Не удалось приобрести товар' }
    });
    return res.status(500).json({});
  }
});

const PORT = 8000;
app.listen(PORT, () => console.log('Server started on PORT ' + PORT));