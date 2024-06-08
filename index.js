const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const token = '7062349272:AAFCsGbapXvuuokak8JXaK8K9qzucUKEPPQ';
const webAppUrl = 'https://quiet-wisp-11b4c9.netlify.app';
const serviceAccount = require('./serviceAccountKey.json');
const secretKey = '3f5e8c3f5bdf4e3f9a3e5b6c2d4e7a8b5f7e9c3a6b4e5f2d7a6e8b5f7e6a3c8b';  // Секретный ключ для JWT

const bot = new TelegramBot(token, { polling: true });
const app = express();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const transporter = nodemailer.createTransport({
  pool: true,
  host: "smtp.yandex.ru",
  port: 465,
  auth: {
    user: "vkrbot@yandex.ru",
    pass: "rcplngehzvvifxjx"
  }
});

// Загрузка HTML-шаблона
const loadEmailTemplate = (templateName, replacements) => {
  const filePath = path.join(__dirname, templateName);
  let template = fs.readFileSync(filePath, 'utf8');

  for (const key in replacements) {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
  }

  return template;
};

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
    console.log(`Fetching order with ID: ${orderId}`);
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

// Получение всех заказов из Firestore
const getAllOrdersFromFirestore = async () => {
  try {
    const snapshot = await db.collection('orders').get();
    const orders = [];
    snapshot.forEach(doc => {
      orders.push({ id: doc.id, ...doc.data() });
    });
    return orders;
  } catch (error) {
    console.error('Error getting all orders from Firestore:', error);
    throw error;
  }
};

// Форматирование даты и времени
const formatDate = (date) => {
  const dateObj = new Date(date);
  dateObj.setHours(dateObj.getHours() + 4);
  return dateObj.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: undefined,
  }).replace(',', '');
};

app.use(express.json());
app.use(cors());

const employees = [{ username: 'admin', password: 'admin123' }];

// Аутентификация сотрудника
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const employee = employees.find(emp => emp.username === username && emp.password === password);

  if (employee) {
    const token = jwt.sign({ username: employee.username }, secretKey, { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Middleware для проверки JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('No token provided');
    return res.sendStatus(401);
  }

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      console.log('Token verification failed', err);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

// Получение списка заказов (доступно только авторизованным пользователям)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await getAllOrdersFromFirestore();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

app.get('/api/clients', authenticateToken, async (req, res) => {
  try {
    const snapshot = await db.collection('clients').get();
    const clients = [];
    snapshot.forEach(doc => {
      clients.push({ id: doc.id, ...doc.data() });
    });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get clients' });
  }
});

const chatState = {}; // Объект для хранения состояний чатов

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '👋 Добро пожаловать в наш интернет-магазин!', {
    reply_markup: {
      keyboard: [
        [{ text: 'Заполнить форму для отправки заказа', web_app: { url: webAppUrl + '/form' } }]
      ]
    }
  });
  await bot.sendMessage(chatId, 'Команда для поиска товара: /search "название товара"\nКоманда для получения информации о заказе: /infoorder "ID заказа"\nКоманда для просмотра ваших заказов: /myorders');
  await bot.sendMessage(chatId, 'Заходите в наш интернет-магазин по кнопке ниже', {
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
        return `Название: ${product.title}\nОписание: ${product.description}\nЦена: ${product.price}`;
      }).join('\n\n');
      await bot.sendMessage(chatId, `Найденные товары:\n${productInfo}`);
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
    bot.sendMessage(chatId, '❗ Пожалуйста, укажите ID заказа.');
    chatState[chatId] = 'waiting_for_order_id';
    return;
  }

  try {
    const order = await getOrderFromFirestore(orderId);
    const productsInfo = order.products.map((product, index) => {
      return `🔹 *${product.title}*\n  ${product.description}\n  Цена: ${product.price} руб.\n  Количество: ${product.quantity}`;
    }).join('\n\n');
    const orderInfo = `🛒 *ID заказа*: ${orderId}\n\n${productsInfo}\n\n💰 *Общая стоимость*: ${order.totalPrice} руб.`;
    await bot.sendMessage(chatId, `Информация по заказу:\n${orderInfo}`, { parse_mode: 'Markdown' });
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
        return `🛒 *ID заказа*: ${order.id}\n📅 *Дата заказа*: ${formatDate(order.createdAt)}`;
      }).join('\n\n');
      await bot.sendMessage(chatId, `Ваши заказы:\n\n${ordersInfo}`, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Error getting user orders:', error);
    bot.sendMessage(chatId, 'Произошла ошибка при получении ваших заказов.');
  }
});

// Обработчик команды /admin
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Нажмите на кнопку ниже, чтобы перейти к странице входа для администратора', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Вход для администратора', web_app: { url: webAppUrl + '/admin-login' } }]
      ]
    }
  });
});

// Обработчик формы и всех остальных сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg?.web_app_data?.data) {
    try {
      const data = JSON.parse(msg.web_app_data.data);
      const { country, city, street, postalCode, email, text } = data;

      const clientData = {
        country,
        city,
        street,
        postalCode,
        email,
        userId: msg.from.id, // Сохраняем ID пользователя
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        username: msg.from.username || '',
        createdAt: new Date().toISOString()
      };

      // Подготовка данных для замены в шаблоне
      const replacements = { country, city, street, postalCode, email };
      const htmlContent = loadEmailTemplate('emailTemplate.html', replacements);

      // Отправка подтверждения по электронной почте
      const mailOptions = {
        from: 'vkrbot@yandex.ru',
        to: email,
        subject: 'Подтверждение заказа',
        html: htmlContent, // Использование HTML-содержимого
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Error sending email:', error);
          bot.sendMessage(chatId, 'Произошла ошибка при отправке подтверждения на электронную почту.');
        } else {
          console.log('Email sent:', info.response);
          bot.sendMessage(chatId, 'Спасибо за заполнение формы! Подтверждение отправлено на вашу электронную почту.');
        }
      });

      // Сохранение данных клиента в Firestore
      const clientRef = await db.collection('clients').add(clientData);
      console.log('Client data saved with ID:', clientRef.id);

      await bot.sendMessage(chatId, text);
    } catch (e) {
      console.error('Error processing form data:', e);
      await bot.sendMessage(chatId, 'Произошла ошибка при обработке данных формы.');
    }
    return; // Завершаем обработку, так как это данные формы
  }

  const text = msg.text;

  if (text) {
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
            return `Название: ${product.tittle}\nОписание: ${product.description}\nЦена: ${product.price}`;
          }).join('\n\n');
          await bot.sendMessage(chatId, `Найденные товары:\n${productInfo}`);
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
        console.log(`Fetching order with ID: ${orderId}`);
        const order = await getOrderFromFirestore(orderId);
        const productsInfo = order.products.map((product, index) => {
          return `Товар ${index + 1}:\nНазвание: ${product.title}\nОписание: ${product.description}\nЦена: ${product.price}\nКоличество: ${product.quantity}`;
        }).join('\n\n');
        const orderInfo = `ID заказа: ${orderId}\nТовары:\n${productsInfo}\nОбщая стоимость: ${order.totalPrice}`;
        await bot.sendMessage(chatId, `Информация по заказу:\n${orderInfo}`);
      } catch (error) {
        console.error('Error getting order info:', error);
        bot.sendMessage(chatId, 'Произошла ошибка при получении информации по заказу.');
      }
    } else if (!text.startsWith('/')) {
      // Если сообщение не является командой и не является данными веб-приложения, отправляем список команд
      bot.sendMessage(chatId, 'Пожалуйста, используйте одну из следующих команд:\n' +
        '/start - Начать взаимодействие\n' +
        '/search "название товара" - Поиск товара\n' +
        '/infoorder "ID заказа" - Информация по заказу\n' +
        '/myorders - Просмотр ваших заказов\n' +
        '/admin - Вход для администратора');
    }
  }
});

// Обработчик маршрута /web-data для получения данных из веб-приложения и сохранения заказа
const sendOrderConfirmation = async (chatId, orderId, products, totalPrice) => {
  const productsInfo = products.map((product, index) => {
    return `🔹 *${product.title}*\n  ${product.description}\n  Цена: ${product.price} руб.\n  Количество: ${product.quantity}`;
  }).join('\n\n');
  
  const orderInfo = `🛒 *ID заказа*: ${orderId}\n\n${productsInfo}\n\n💰 *Общая стоимость*: ${totalPrice} руб.`;

  await bot.sendMessage(chatId, `Вы оформили заказ:\n\n${orderInfo}`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Заполнить форму для доставки', web_app: { url: webAppUrl + '/form' } }],
        [{ text: 'Вернуться к магазинам', web_app: { url: webAppUrl } }]
      ]
    }
  });
};

// Handler for the /web-data endpoint
app.post('/web-data', async (req, res) => {
  const { queryId, products, totalPrice, tg } = req.body;

  try {
    const userId = tg.initDataUnsafe.user.id;

    const order = {
      products,
      totalPrice,
      tg,
      userId: userId,
      createdAt: new Date().toISOString()
    };
    const orderId = await saveOrderToFirestore(order);

    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: 'Успешная покупка',
      input_message_content: { message_text: `Вы оформили заказ. ID заказа: ${orderId}` }
    });

    await sendOrderConfirmation(userId, orderId, products, totalPrice);

    res.status(200).json({ orderId });
  } catch (error) {
    console.error('Error processing order:', error);

    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: 'Не удалось приобрести товар',
      input_message_content: { message_text: 'Не удалось приобрести товар' }
    });

    res.status(500).json({ error: 'Failed to process order' });
  }
});
// Добавление нового товара
app.post('/api/products', authenticateToken, async (req, res) => {
  const { title, description, price, image, category } = req.body;

  if (!title || !description || !price || !image || !category) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const newProduct = {
    title,
    description,
    price,
    image,
    category,
    createdAt: new Date().toISOString()
  };

  try {
    const productRef = await db.collection('products').add(newProduct);
    res.status(201).json({ id: productRef.id, ...newProduct });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Удаление товара
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  const productId = req.params.id;

  try {
    await db.collection('products').doc(productId).delete();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
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