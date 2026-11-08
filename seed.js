// miecommerce/seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./src/models/User');
const Product = require('./src/models/Product');
const Question = require('./src/models/Question');
const Order = require('./src/models/Order');
const Review = require('./src/models/Review');

async function runSeed() {
  try {
    console.log('⏳ Conectando a MongoDB en Filess.io...');
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 3,
      serverSelectionTimeoutMS: 8000
    });
    console.log('✅ Conectado a Filess.io');

    const passwordHash = await bcrypt.hash('123456', 10);

    // 1. Crear o recuperar Vendedor y Comprador de prueba
    let seller = await User.findOne({ email: 'vendedor@miecommerce.com' });
    if (!seller) {
      seller = await User.create({
        name: 'Tienda Oficial ElectroMisiones',
        email: 'vendedor@miecommerce.com',
        passwordHash,
        reputation: { totalSales: 48, sellerRating: 4.9 },
        wallet: { pendingBalance: 185000, availableBalance: 940000 }
      });
    }

    let buyer = await User.findOne({ email: 'comprador@miecommerce.com' });
    if (!buyer) {
      buyer = await User.create({
        name: 'Juan Pérez',
        email: 'comprador@miecommerce.com',
        passwordHash,
        wallet: { pendingBalance: 0, availableBalance: 50000 }
      });
    }

    // Limpiar solo los productos previos del vendedor de prueba para no duplicar si corres el seed dos veces
    const oldProducts = await Product.find({ seller: seller._id });
    const oldProductIds = oldProducts.map(p => p._id);
    if (oldProductIds.length > 0) {
      await Question.deleteMany({ product: { $in: oldProductIds } });
      await Review.deleteMany({ product: { $in: oldProductIds } });
      await Order.deleteMany({ 'items.product': { $in: oldProductIds } });
      await Product.deleteMany({ seller: seller._id });
    }

    // 2. Insertar 6 Artículos variados con stock real e imágenes
    console.log('📦 Creando catálogo de artículos...');
    const productsData = [
      {
        seller: seller._id,
        title: 'Notebook Gamer Ryzen 7 16GB RAM SSD 512GB RTX 3050',
        description: 'Notebook de alto rendimiento ideal para desarrollo de software, virtualización, diseño 3D y gaming. Pantalla IPS Full HD de 144Hz, teclado retroiluminado y chasis con refrigeración de doble turbina.',
        category: 'Tecnología',
        price: 1250000,
        stock: 8,
        soldCount: 19,
        condition: 'nuevo',
        images: ['https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800']
      },
      {
        seller: seller._id,
        title: 'Auriculares Inalámbricos Bluetooth Cancelación de Ruido ANC',
        description: 'Sonido de alta fidelidad con cancelación activa de ruido, 40 horas de autonomía con carga rápida USB-C y micrófono integrado para videollamadas.',
        category: 'Tecnología',
        price: 89000,
        stock: 25,
        soldCount: 42,
        condition: 'nuevo',
        images: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800']
      },
      {
        seller: seller._id,
        title: 'Taladro Percutor Inalámbrico 20V Brushless + 2 Baterías y Maletín',
        description: 'Motor sin escobillas de alto torque, mandril metálico autoajustable de 13mm, luz LED de trabajo y selector de 2 velocidades mecánicas.',
        category: 'Herramientas',
        price: 165000,
        stock: 12,
        soldCount: 15,
        condition: 'nuevo',
        images: ['https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800']
      },
      {
        seller: seller._id,
        title: 'Cafetera Expreso Automática 20 Bares Acero Inoxidable',
        description: 'Bomba italiana de 20 bares de presión, espumador de leche orientable para cappuccino, tanque transparente de 1.5 litros y bandeja calienta tazas.',
        category: 'Electrodomésticos',
        price: 210000,
        stock: 6,
        soldCount: 11,
        condition: 'nuevo',
        images: ['https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800']
      },
      {
        seller: seller._id,
        title: 'Silla Ergonómica de Oficina y Escritorio con Soporte Lumbar',
        description: 'Respaldo de malla respirable, apoyabrazos regulables 3D, cabezal ajustable en altura y pistón neumático clase 4.',
        category: 'Hogar y Muebles',
        price: 185000,
        stock: 9,
        soldCount: 27,
        condition: 'nuevo',
        images: ['https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=800']
      },
      {
        seller: seller._id,
        title: 'Bicicleta Mountain Bike Rodado 29 Aluminio 21 Velocidades Freno Disco',
        description: 'Cuadro de aluminio hidroformado liviano, horquilla con suspensión delantera y bloqueo, cambios Shimano de 21 velocidades y frenos a disco mecánicos.',
        category: 'Deportes',
        price: 420000,
        stock: 4,
        soldCount: 7,
        condition: 'nuevo',
        images: ['https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800']
      }
    ];

    const createdProducts = await Product.insertMany(productsData);
    const [notebook, auriculares, taladro, cafetera, silla] = createdProducts;

    // 3. Crear Preguntas y Respuestas de ejemplo
    console.log('💬 Cargando preguntas y respuestas...');
    await Question.insertMany([
      {
        product: notebook._id,
        buyer: buyer._id,
        seller: seller._id,
        questionText: '¡Hola! ¿Tienen stock disponible para despachar hoy por Correo Argentino? ¿Tiene slot libre para agregar otro disco NVMe?',
        answerText: '¡Hola Juan! Sí, tenemos stock inmediato y despachamos hoy mismo por Correo Argentino. Cuenta con un segundo slot M.2 NVMe libre para que la amplíes sin problemas.',
        answeredAt: new Date(),
        status: 'respondida'
      },
      {
        product: notebook._id,
        buyer: buyer._id,
        seller: seller._id,
        questionText: '¿Hacen factura A y envían a Posadas, Misiones?',
        status: 'pendiente'
      },
      {
        product: auriculares._id,
        buyer: buyer._id,
        seller: seller._id,
        questionText: '¿Incluye el cable auxiliar de 3.5mm por si me quedo sin batería?',
        answerText: '¡Hola! Sí, en la caja viene el cable mallado de 3.5mm y el cable de carga USB Tipo C.',
        answeredAt: new Date(),
        status: 'respondida'
      }
    ]);

    // 4. Crear Órdenes de ejemplo (1 entregada con reseña y 1 en camino con código de seguimiento)
    console.log('🚚 Generando órdenes con logística de correo y reseñas de satisfacción...');
    const deliveredOrder1 = await Order.create({
      buyer: buyer._id,
      items: [{
        product: notebook._id,
        seller: seller._id,
        title: notebook.title,
        quantity: 1,
        unitPrice: notebook.price
      }],
      totalAmount: notebook.price,
      paymentMethod: 'qr',
      paymentExternalId: 'PAY-SEED-001',
      status: 'entregado_fondos_liberados',
      canReview: true,
      shipping: {
        carrier: 'Correo Argentino',
        address: { street: 'Av. Mitre 1540', city: 'Posadas', state: 'Misiones', zipCode: '3300' },
        trackingCode: 'CA-84920144-AR',
        shippingStatus: 'entregado',
        dispatchedAt: new Date(Date.now() - 86400000 * 3),
        history: [
          { stage: 'Orden generada', description: 'Envío solicitado por Correo Argentino' },
          { stage: 'Despachado en sucursal', description: 'Paquete ingresado en Correo Argentino. Código: CA-84920144-AR' },
          { stage: 'Entregado al comprador', description: 'El comprador confirmó la recepción conforme del paquete.' }
        ]
      }
    });

    const deliveredOrder2 = await Order.create({
      buyer: buyer._id,
      items: [{
        product: auriculares._id,
        seller: seller._id,
        title: auriculares.title,
        quantity: 1,
        unitPrice: auriculares.price
      }],
      totalAmount: auriculares.price,
      paymentMethod: 'credit_card',
      paymentExternalId: 'PAY-SEED-002',
      status: 'entregado_fondos_liberados',
      canReview: true,
      shipping: {
        carrier: 'Andreani',
        address: { street: 'San Lorenzo 820', city: 'Posadas', state: 'Misiones', zipCode: '3300' },
        trackingCode: 'AND-55910234-AR',
        shippingStatus: 'entregado',
        dispatchedAt: new Date(Date.now() - 86400000 * 2),
        history: [
          { stage: 'Despachado en sucursal', description: 'Paquete ingresado en Andreani. Código: AND-55910234-AR' },
          { stage: 'Entregado al comprador', description: 'El comprador confirmó la recepción conforme del paquete.' }
        ]
      }
    });

    // Orden en camino para probar la vista de seguimiento activo
    await Order.create({
      buyer: buyer._id,
      items: [{
        product: silla._id,
        seller: seller._id,
        title: silla.title,
        quantity: 1,
        unitPrice: silla.price
      }],
      totalAmount: silla.price,
      paymentMethod: 'qr',
      paymentExternalId: 'PAY-SEED-003',
      status: 'en_camino',
      canReview: false,
      shipping: {
        carrier: 'OCA',
        address: { street: 'Av. Quaranta 3100', city: 'Posadas', state: 'Misiones', zipCode: '3300' },
        trackingCode: 'OCA-77381920-AR',
        shippingStatus: 'en_transito',
        dispatchedAt: new Date(),
        history: [
          { stage: 'Orden generada', description: 'Envío solicitado por OCA' },
          { stage: 'Despachado en sucursal', description: 'Paquete ingresado en OCA. Código asignado: OCA-77381920-AR' },
          { stage: 'En tránsito hacia centro logístico de destino', description: 'Viajando hacia sucursal receptora.' }
        ]
      }
    });

    // 5. Crear Valoraciones (Reviews) que disparan automáticamente el cálculo de barras de satisfacción
    await Review.create({
      product: notebook._id,
      order: deliveredOrder1._id,
      buyer: buyer._id,
      rating: 5,
      comment: 'Increíble velocidad, vuela con contenedores y entornos pesados. Llegó por Correo Argentino en 48 horas súper bien embalada.'
    });

    await Review.create({
      product: auriculares._id,
      order: deliveredOrder2._id,
      buyer: buyer._id,
      rating: 5,
      comment: 'La cancelación de ruido es excelente y la batería dura toda la semana.'
    });

    // Precargar barras de satisfacción realistas también en el Taladro y la Cafetera
    await Product.findByIdAndUpdate(taladro._id, {
      ratingSummary: {
        average: 4.8,
        count: 10,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 8 }
      }
    });

    await Product.findByIdAndUpdate(cafetera._id, {
      ratingSummary: {
        average: 4.6,
        count: 8,
        distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 6 }
      }
    });

    console.log('\n🎉 ¡Base de datos poblada con éxito en Filess.io!');
    console.log('----------------------------------------------------');
    console.log('👤 Cuenta Vendedor de prueba: vendedor@miecommerce.com | Clave: 123456');
    console.log('👤 Cuenta Comprador de prueba: comprador@miecommerce.com | Clave: 123456');
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error ejecutando el seed:', error);
    process.exit(1);
  }
}

runSeed();