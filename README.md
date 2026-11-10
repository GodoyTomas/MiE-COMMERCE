<div align="center">

# 🤝 miecommerce — Enterprise C2C/B2C Marketplace Platform

**Plataforma Full-Stack de Comercio Electrónico con Sistema Financiero Escrow (Compra Protegida), Comunicación en Tiempo Real, Logística Multi-Correo y Facturación Electrónica.**

[![Node.js](https://img.shields.io/badge/Node.js-v18.18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.19-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB_Cloud-Filess.io-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://filess.io/)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![JWT](https://img.shields.io/badge/Auth-JWT_Bearer-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![License](https://img.shields.io/badge/Licencia-Todos_los_Derechos_Reservados-d32f2f?style=for-the-badge)](#licencia-y-propiedad-intelectual)

</div>

---

## 📋 Descripción General de Ingeniería

**miecommerce** es un ecosistema de marketplace C2C y B2C inspirado en la arquitectura operativa de **Mercado Libre**. Fue diseñado bajo patrones de alta disponibilidad y consistencia atómica sobre **Node.js, Express y MongoDB en la nube**, resolviendo los desafíos críticos del comercio electrónico moderno:

* **Prevención de *Race Conditions* en Stock:** Descuento atómico a nivel de documento con patrón de compensación (*Rollback* automático) y liberación por expiración TTL mediante tareas programadas (`node-cron`).
* **Fideicomiso Transaccional (*Escrow* - Compra Protegida):** Aislamiento contable entre el saldo en retención (`pendingBalance`) y el saldo líquido disponible (`availableBalance`). El dinero solo se libera al vendedor cuando el comprador certifica la recepción conforme del paquete.
* **Arquitectura Orientada a Eventos en Tiempo Real (`Socket.io`):** Salas privadas por usuario (`user_<id>`) y salas públicas por publicación (`product_<id>`) para preguntas, respuestas, ventas, seguimiento postal, mensajería post-venta y campanita de notificaciones persistentes.

---

## 🚀 Módulos y Funcionalidades Principales

### 🛡️ 1. Pasarela Electrónica, Billetera Virtual y Escrow
* **Checkout Multi-Medio:** Cobro mediante **Código QR Interoperable dinámico**, **Tarjetas de Crédito/Débito** (con previsualización interactiva), integración con **Mercado Pago SDK** y pago directo con **Saldo de Billetera**.
* **Centro de Mediación y Disputas:** El comprador puede congelar los fondos en *Escrow* abriendo un reclamo (`en_reclamo`) ante inconvenientes con el envío. El vendedor dispone de resolución directa con reembolso instantáneo a la billetera del comprador y restitución automática de stock.
* **Retiros Bancarios:** Transferencia de fondos liberados hacia cuentas bancarias o billeteras virtuales mediante **CBU / Alias**.

### 🚚 2. Logística Integrada y Seguimiento Multi-Correo
* **Operadores Soportados:** Protocolos operativos diferenciados para **Correo Argentino**, **Andreani** y **OCA**.
* **Generador de Etiquetas Oficiales Imprimibles:** Creación automática de rótulos de despacho con código QR, código de barras de admisión, datos del destinatario y código postal destacado.
* **Trazabilidad en Vivo (*Track & Trace*):** Generación de código de seguimiento único y línea de tiempo histórica (*Etiqueta lista → Despachado en sucursal → En tránsito → En distribución → Entregado*).

### 🏬 3. Catálogo Inteligente, Tiendas Oficiales y Reputación
* **Buscador Avanzado con Autocompletado:** Índices de texto compuestos (`$text`) en MongoDB, sugerencias instantáneas mientras se escribe, filtros por categoría, condición y rango de precios.
* **Carrusel Dinámico Personalizado:** Algoritmo basado en el historial de navegación (`recentlyViewed` acotado con `$slice`) que recomienda los artículos mejor calificados de las últimas categorías visitadas.
* **Termómetro de Reputación y Medallas Automáticas:** Cálculo dinámico de 5 niveles cromáticos e insignias (**MercadoLíder**, **MercadoLíder Gold** y **MercadoLíder Platinum**) más vitrina pública de **Tienda Oficial** por vendedor.
* **Variantes y Ofertas Relámpago:** Soporte para variantes seleccionables (talle, color, capacidad), descuentos porcentuales (`% OFF`) y motor de **Cupones Promocionales** (`MIE10`, `CYBER20`, `ENVIO5`).

### 📊 4. Inteligencia Financiera, Facturación y Exportación Contable
* **Dashboard Analítico en HTML5 `<canvas>`:** Gráfico de barras en tiempo real con ingresos brutos por categoría, ticket promedio, unidades entregadas y balance *Escrow* vs. disponible.
* **Comprobantes Electrónicos (Factura C):** Emisión de comprobantes imprimibles con desglose de ítems, descuentos, número de **CAE** y **Código QR Fiscal**.
* **Exportación a Excel / CSV:** Descarga en un clic del Libro de Ventas con codificación `UTF-8 BOM` compatible nativamente con Microsoft Excel.

---

## 🏗️ Arquitectura del Proyecto

```text
miecommerce/
├── public/                        # Aplicación Cliente (SPA Vanilla JS + CSS Variables + Dark Mode)
│   ├── uploads/                   # Almacenamiento local de fotografías procesadas con Multer
│   ├── index.html                 # Vistas de Marketplace, Detalle, Tienda Oficial, Modales y Checkout
│   ├── styles.css                 # Sistema de diseño responsivo + Tema Claro / Oscuro
│   └── app.js                     # Estado del cliente, Socket.io, Canvas Analytics y Generadores PDF/CSV
├── src/
│   ├── config/
│   │   ├── db.js                  # Pool de conexiones optimizado para MongoDB Cloud (Filess.io)
│   │   └── socket.js              # Gestión de salas en tiempo real con Socket.io
│   ├── controllers/
│   │   ├── authController.js      # Registro, Login JWT, Favoritos, Retiros CBU y Notificaciones
│   │   ├── carouselController.js  # Motor de recomendaciones e historial de vistas
│   │   ├── orderAndReviewController.js # Checkout, Webhooks, Logística, Chat Post-Venta y Mediación
│   │   ├── productController.js   # CRUD de artículos, variantes, autocompletado y Tiendas Oficiales
│   │   └── questionController.js  # Sistema de Preguntas y Respuestas en tiempo real
│   ├── middlewares/
│   │   ├── authMiddleware.js      # Guardias JWT (verifyToken y optionalAuth)
│   │   └── uploadMiddleware.js    # Procesamiento multipart/form-data de imágenes con Multer
│   ├── models/                    # Esquemas Mongoose (User, Product, Order, Question, Review)
│   ├── routes/
│   │   └── api.routes.js          # Enrutador RESTful centralizado
│   └── services/
│       ├── checkoutService.js     # Reserva atómica de stock, cupones y pasarela de pago
│       ├── escrowService.js       # Retención, liberación y reembolso de fondos (Compra Protegida)
│       ├── notificationService.js # Persistencia y emisión de alertas en tiempo real
│       └── stockCronService.js    # Cron Job (cada 5 min) para restituir stock de órdenes expiradas
├── .env                           # Variables de entorno (Ignorado en Git)
├── .gitignore                     # Reglas de exclusión de seguridad
├── LICENSE                        # Licencia Propietaria - Todos los derechos reservados
├── package.json                   # Dependencias y scripts de ejecución
├── seed.js                        # Script poblador de catálogo, órdenes logísticas y reseñas
└── server.js                      # Punto de entrada HTTP + WebSockets