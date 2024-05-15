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

// Сохранение заказа в Firestore
const saveOrderToFirestore = async (order) => {
  try {
    const orderRef = await db.collection('orders').add(order);
    return orderRef.id;
  } catch (error) {
    console.error('Error saving order to Firestore:', error);
    throw error;
  }
};

// Получение информации о заказе из Firestore
const getOrderFromFirestore = async (orderId) => {
  try {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
      throw new Error('Order not found');
    }
    return orderDoc.data();
  } catch (error) {
    console.error('Error getting order from Firestore:', error);
    throw error;
  }
};

// Получение всех заказов пользователя из Firestore
const getUserOrdersFromFirestore = async (userId) => {
  try {
    const snapshot = await db.collection('orders').where('userId', '==', userId).get();
    if (snapshot.empty) {
      return [];
    }
    const orders = [];
    snapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    return orders;
  } catch (error) {
    console.error('Error getting user orders from Firestore:', error);
    throw error;
  }
};

app.use(express.json());
app.use(cors());

const chatState = {}; // Объект для хранения состояний чатов

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Ниже появится кнопка, чтобы заполнить форму', {
    reply_markup: {
      keyboard: [
        [{ text: 'Заполнить форму', web_app: { url: webAppUrl + '/form' } }]
      ]
    }
  });
  await bot.sendMessage(chatId, 'Команда для поиска товара: /search "название товара"');
  await bot.sendMessage(chatId, 'Команда для получения информации о заказе: /infoorder "ID заказа"');
  await bot.sendMessage(chatId, 'Команда для просмотра ваших заказов: /myorders');
  await bot.sendMessage(chatId, 'Заходите в наш интернет магазин по кнопке ниже', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]
      ]
    }
  });
});

// Обработчик команды /search
bot.onText(/\/search/, async (msg) => {
  const chatId = msg.chat.id;
  const searchQuery = msg.text.split(' ')[1];

  if (!searchQuery) {
    bot.sendMessage(chatId, 'Пожалуйста, укажите ключевое слово для поиска.');
    chatState[chatId] = 'waiting_for_search_query';
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
        return `Название: ${product.tittle}\nОписание: ${product.description}\нЦена: ${product.price}`;
      }).join('\н\n');
      await bot.sendMessage(chatId, `Найденные товары:\н${productInfo}`);
      await bot.sendMessage(chatId, 'Заказать найденный товар можно по кнопке ниже', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error searching for products:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при поиске товаров.');
  }
});

// Обработчик команды /infoorder
bot.onText(/\/infoorder/, async (msg) => {
  const chatId = msg.chat.id;
  const orderId = msg.text.split(' ')[1];

  if (!orderId) {
    bot.sendMessage(chatId, 'Пожалуйста, укажите ID заказа.');
    chatState[chatId] = 'waiting_for_order_id';
    return;
  }

  try {
    const order = await getOrderFromFirestore(orderId);
    const productsInfo = order.products.map((product, index) => {
      return `Товар ${index + 1}:\nНазвание: ${product.title}\нОписание: ${product.description}\нЦена: ${product.price}\нКоличество: ${product.quantity}`;
    }).join('\н\n');
    const orderInfo = `ID заказа: ${orderId}\нТовары:\н${productsInfo}\нОбщая стоимость: ${order.totalPrice}`;
    await bot.sendMessage(chatId, `Информация по заказу:\н${orderInfo}`);
  } catch (error) {
    console.error('Error getting order info:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при получении информации по заказу.');
  }
});

// Обработчик команды /myorders
bot.onText(/\/myorders/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const orders = await getUserOrdersFromFirestore(userId);
    if (orders.length === 0) {
      bot.sendMessage(chatId, 'У вас нет заказов.');
    } else {
      const ordersInfo = orders.map(order => {
        const productsInfo = order.products.map((product, index) => {
          return `Товар ${index + 1}:\нНазвание: ${product.title}\нОписание: ${product.description}\нЦена: ${product.price}\нКоличество: ${product.quantity}`;
        }).join('\н\n');
        return `ID заказа: ${order.id}\нТовары:\н${productsInfo}\нОбщая стоимость: ${order.totalPrice}`;
      }).join('\н\n====================\н\n');
      await bot.sendMessage(chatId, `Ваши заказы:\н\n${ordersInfo}`);
    }
  } catch (error) {
    console.error('Error getting user orders:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при получении ваших заказов.');
  }
});

// Обработчик всех остальных сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Если бот ожидает поисковый запрос от пользователя
  if (chatState[chatId] === 'waiting_for_search_query') {
    chatState[chatId] = null; // Сбрасываем состояние

    try {
      const products = await getProductsFromFirestore();
      const foundProducts = products.filter(product => {
        return Object.values(product).some(value => {
          if (typeof value === 'string') {
            return value.toLowerCase().includes(text.toLowerCase());
          }
          return false;
        });
      });

      if (foundProducts.length === 0) {
        bot.sendMessage(chatId, 'По вашему запросу ничего не найдено.');
      } else {
        const productInfo = foundProducts.map(product => {
          return `Название: ${product.tittle}\нОписание: ${product.description}\нЦена: ${product.price}`;
        }).join('\н\n');
        await bot.sendMessage(chatId, `Найденные товары:\н${productInfo}`);
        await bot.sendMessage(chatId, 'Заказать найденный товар можно по кнопке ниже', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]
            ]
          }
        });
      }
    } catch (error) {
      console.error('Error searching for products:', error);
      bot.sendMessage(chatId, 'Произошла ошибка при поиске товаров.');
    }
  } else if (chatState[chatId] === 'waiting_for_order_id') {
    chatState[chatId] = null; // Сбрасываем состояние

    try {
      const orderId = text;
      const order = await getOrderFromFirestore(orderId);
      const productsInfo = order.products.map((product, index) => {
        return `Товар ${index + 1}:\нНазвание: ${product.title}\нОписание: ${product.description}\нЦена: ${product.price}\нКоличество: ${product.quantity}`;
      }).join('\н\n');
      const orderInfo = `ID заказа: ${orderId}\нТовары:\н${productsInfo}\нОбщая стоимость: ${order.totalPrice}`;
      await bot.sendMessage(chatId, `Информация по заказу:\н${orderInfo}`);
    } catch (error) {
      console.error('Error getting order info:', error);
      bot.sendMessage(chatId, 'Произошла ошибка при получении информации по заказу.');
    }
  } else if (!text.startsWith('/') && !msg?.web_app_data?.data) {
    // Если сообщение не является командой и не является данными веб-приложения, отправляем список команд
    bot.sendMessage(chatId, 'Пожалуйста, используйте одну из следующих команд:\н' +
      '/start - Начать взаимодействие\n' +
      '/search "название товара" - Поиск товара\n' +
      '/infoorder "ID заказа" - Информация по заказу\n' +
      '/myorders - Просмотр ваших заказов');
  }

  if (msg?.web_app_data?.data) {
    try {
      const data = JSON.parse(msg?.web_app_data?.data);
      const userId = data.user.id;

      const order = {
        products: data.products,
        totalPrice: data.totalPrice,
        tg: data.tg,
        userId: userId, // Привязываем заказ к пользователю Telegram
        createdAt: new Date().toISOString()
      };

      const orderId = await saveOrderToFirestore(order);

      await bot.sendMessage(chatId, 'Спасибо за заказ!');
      await bot.sendMessage(chatId, `Ваш заказ оформлен. ID заказа: ${orderId}`);
    } catch (e) {
      console.log(e);
    }
  }
});

// Обработчик маршрута /web-data для получения данных из веб-приложения и сохранения заказа
app.post('/web-data', async (req, res) => {
  const { queryId, products, totalPrice, tg } = req.body;

  try {
    const userId = tg.initDataUnsafe.user.id;

    const order = {
      products,
      totalPrice,
      tg,
      userId: userId, // Привязываем заказ к пользователю Telegram
      createdAt: new Date().toISOString()
    };
    const orderId = await saveOrderToFirestore(order);

    // Отправка ответа в Telegram
    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: 'Успешная покупка',
      input_message_content: { message_text: `Вы оформили заказ. ID заказа: ${orderId}` }
    });

    // Возвращаем успешный ответ
    res.status(200).json({ orderId });
  } catch (error) {
    console.error('Error processing order:', error);

    // Отправка ошибки в Telegram
    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: 'Не удалось приобрести товар',
      input_message_content: { message_text: 'Не удалось приобрести товар' }
    });

    // Возвращаем ошибку
    res.status(500).json({ error: 'Failed to process order' });
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

const PORT = 8000;
app.listen(PORT, () => console.log('Server started on PORT ' + PORT));