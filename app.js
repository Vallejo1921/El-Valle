import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAXVUTa-4QFFwvvEHz6RolHj7l98J5pC8Q",
  authDomain: "el-valle-publi.firebaseapp.com",
  projectId: "el-valle-publi",
  storageBucket: "el-valle-publi.firebasestorage.app",
  messagingSenderId: "859126264053",
  appId: "1:859126264053:web:df61d3484992c5389915bc",
  measurementId: "G-FYNTVFPL00"
};

const BOOTSTRAP_ADMIN_EMAILS = ["maxter@elvalle.com"];
const DEFAULT_ADMIN_CONTACT_EMAIL = "maxter@elvalle.com";
const ORDERS_COLLECTION = "pedidos";
const USERS_COLLECTION = "usuarios";
const CART_COLLECTION = "cart";
const OFFERS_COLLECTION = "offers";
const PRODUCTS_COLLECTION = "products";
const ORDER_ITEMS_COLLECTION = "orderItems";
const STATUS_FLOW = ["Pendiente", "Aceptado", "En proceso", "Terminado", "Entregado y pagado"];
const CLIENT_ORDER_STATUSES = [
  "Pendiente de revision",
  "Pago pendiente",
  "Pago confirmado",
  "En proceso",
  "Casi terminado",
  "Terminado",
  "Entregado",
  "Entregado y pagado",
  "Cancelado"
];
const ADMIN_ORDER_STATUSES = [
  "Pendiente de revision",
  "Pago pendiente",
  "Pago confirmado",
  "En proceso",
  "Casi terminado",
  "Terminado",
  "Entregado",
  "Entregado y pagado",
  "Cancelado"
];
const page = window.location.pathname.split("/").pop() || "login.html";

// Evita que se vea cliente/admin sin sesion (flash) mientras se resuelve Auth.
if (page !== "login.html") {
  document.documentElement.style.visibility = "hidden";
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
// Seguridad: no persistir login indefinidamente en el dispositivo.
// Al cerrar el navegador, se requiere volver a iniciar sesion.
setPersistence(auth, browserSessionPersistence).catch((error) => console.error(error));

function goTo(nextPage) {
  window.location.href = nextPage;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("SW register error", error);
    });
  });
}

function setMessage(id, text, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#b33128" : "#1b7a57";
}

function renderEmptyState(message) {
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24"><path d="M21 7.12l-9-4.98-9 4.98v9.76l9 4.98 9-4.98V7.12zM12 6.09l7.07 3.91-7.07 3.91-7.07-3.91L12 6.09zM4.5 10.96l7 3.88v7.76l-7-3.88v-7.76zM19.5 14.84l-7 3.88v-7.76l7-3.88v7.76z"/></svg>
      <p>${message}</p>
    </div>
  `;
}

function formatMXN(value) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDateNow() {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "full", timeStyle: "short" }).format(new Date());
}

function getStatusClass(status) {
  if (status === "Pendiente" || status === "Pendiente de revision") return "pendiente";
  if (status === "Pago pendiente") return "pago-pendiente";
  if (status === "Pago confirmado") return "pago-confirmado";
  if (status === "Aceptado") return "aceptado";
  if (status === "En proceso") return "en-proceso";
  if (status === "Casi terminado") return "casi-terminado";
  if (status === "Terminado") return "terminado";
  if (status === "Entregado") return "entregado";
  if (status === "Entregado y pagado") return "entregado-pagado";
  if (status === "Cancelado") return "cancelado";
  return "pendiente";
}

function getNextStatus(status) {
  const index = STATUS_FLOW.indexOf(status);
  if (index < 0 || index === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[index + 1];
}

function getAdvanceLabel(nextStatus) {
  if (nextStatus === "Aceptado") return "Aceptar pedido";
  if (nextStatus === "En proceso") return "Poner en proceso";
  if (nextStatus === "Terminado") return "Marcar terminado";
  if (nextStatus === "Entregado y pagado") return "Entregado y pagado";
  return "Actualizar";
}

function isClientActiveStatus(status) {
  return status !== "Entregado y pagado" && status !== "Cancelado";
}

function normalizeClientStatus(status) {
  if (CLIENT_ORDER_STATUSES.includes(status)) return status;
  if (status === "Pendiente") return "Pendiente de revision";
  if (status === "Aceptado") return "Pago confirmado";
  return status || "Pendiente de revision";
}

function normalizeAdminStatus(status) {
  if (ADMIN_ORDER_STATUSES.includes(status)) return status;
  if (status === "Pendiente") return "Pendiente de revision";
  if (status === "Aceptado") return "Pago confirmado";
  return status || "Pendiente de revision";
}

function getClientProgressPercent(status) {
  const normalized = normalizeClientStatus(status);
  const index = CLIENT_ORDER_STATUSES.indexOf(normalized);
  if (index < 0) return 5;
  return Math.round((index / (CLIENT_ORDER_STATUSES.length - 1)) * 100);
}

function isBootstrapAdmin(email) {
  return !!email && BOOTSTRAP_ADMIN_EMAILS.includes(email.toLowerCase());
}

async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    // Usualmente es por reglas de Firestore bloqueando /usuarios.
    console.error(error);
    return null;
  }
}

async function ensureUserProfile(user, forcedRole, existingProfile) {
  const ref = doc(db, USERS_COLLECTION, user.uid);
  const existing = existingProfile
    ? { exists: () => true, data: () => existingProfile }
    : await getDoc(ref);
  if (existing.exists()) return existing.data();

  const role = forcedRole || (isBootstrapAdmin(user.email) ? "admin" : "cliente");
  const profile = {
    uid: user.uid,
    email: user.email,
    role,
    createdAt: serverTimestamp()
  };

  await setDoc(ref, profile);
  return profile;
}

async function gateByRole(expectedRole, user) {
  let existingProfile = null;
  try {
    existingProfile = await getUserProfile(user.uid);
  } catch (error) {
    console.error(error);
  }

  let profile = existingProfile;
  if (!profile) {
    try {
      profile = await ensureUserProfile(user, undefined, existingProfile);
    } catch (error) {
      // Casi siempre es por reglas de Firestore bloqueando /usuarios.
      console.error(error);
      try {
        localStorage.setItem("authErrorMessage", "No hay permisos en Firestore (permission-denied). Revisa las Rules.");
      } catch {}
      goTo("login.html");
      return null;
    }
  }
  if (expectedRole === "admin" && profile.role !== "admin") {
    goTo("cliente.html");
    return null;
  }
  if (expectedRole === "cliente" && profile.role !== "cliente") {
    goTo("admin.html");
    return null;
  }
  return profile;
}

function requireAuthOrRedirect(user) {
  if (user) return true;
  // Hard gate: nunca permitir entrar a cliente/admin sin sesion.
  if (page !== "login.html") goTo("login.html");
  return false;
}

function observeOrdersByUser(uid, onData, onError) {
  const ordersRef = collection(db, ORDERS_COLLECTION);
  // Importante: filtrar por clientUid para que las Rules puedan autorizar la consulta.
  // Para evitar indice compuesto requerido, no ordenamos aqui; ordenamos en cliente.
  const q = query(ordersRef, where("clientUid", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return bTime - aTime;
        });
      onData(orders);
    },
    onError
  );
}

function observeAllOrders(onData, onError) {
  const q = query(collection(db, ORDERS_COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      const orders = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(orders);
    },
    onError
  );
}

function observeCartByUser(uid, onData, onError) {
  const q = query(collection(db, CART_COLLECTION), where("clientUid", "==", uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(items);
    },
    onError
  );
}

function observeOffers(onData, onError) {
  const offersRef = collection(db, OFFERS_COLLECTION);
  const q = query(offersRef, limit(6));
  return onSnapshot(
    q,
    (snap) => {
      const offers = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(offers);
    },
    onError
  );
}

function observeProducts(onData, onError) {
  const q = query(collection(db, PRODUCTS_COLLECTION), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(products);
    },
    onError
  );
}

function observeUsers(onData, onError) {
  const q = query(collection(db, USERS_COLLECTION), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(users);
    },
    onError
  );
}

async function upsertProduct(productId, payload) {
  if (productId) {
    await updateDoc(doc(db, PRODUCTS_COLLECTION, productId), payload);
    return productId;
  }
  const ref = await addDoc(collection(db, PRODUCTS_COLLECTION), payload);
  return ref.id;
}

async function upsertOffer(offerId, payload) {
  if (offerId) {
    await updateDoc(doc(db, OFFERS_COLLECTION, offerId), payload);
    return offerId;
  }
  const ref = await addDoc(collection(db, OFFERS_COLLECTION), payload);
  return ref.id;
}

function renderAdminProducts(products) {
  const body = document.getElementById("productsAdminBody");
  if (!body) return;
  if (!products.length) {
    body.innerHTML = '<article class="order-card">No hay productos.</article>';
    return;
  }
  body.innerHTML = products
    .slice()
    .sort((a, b) => String(a.name || a.title || "").localeCompare(String(b.name || b.title || "")))
    .map((p) => {
      const name = p.name || p.title || p.id;
      const base = p.basePrice ?? p.price ?? 0;
      const variant = p.variantPrice ?? 0;
      const active = p.active !== false;
      return `<article class="order-card"><div class="order-head"><span>${name}</span><span>${active ? "Activo" : "Inactivo"}</span></div><div class="order-meta">Base: ${formatMXN(base)} | Variante: ${formatMXN(variant)}</div><div class="order-meta">${p.description || ""}</div><div class="row-actions"><button type="button" class="btn-ok" data-admin-product-action="edit" data-id="${p.id}">Editar</button><button type="button" class="btn-del" data-admin-product-action="delete" data-id="${p.id}">Eliminar</button></div></article>`;
    })
    .join("");
}

function renderAdminOffers(offers) {
  const body = document.getElementById("offersAdminBody");
  if (!body) return;
  if (!offers.length) {
    body.innerHTML = '<article class="order-card">No hay promos.</article>';
    return;
  }
  body.innerHTML = offers
    .slice()
    .map((o) => {
      const title = o.title || o.name || o.id;
      const active = o.active !== false;
      const priceText = o.price ? formatMXN(o.price) : "Precio a consultar";
      return `<article class="order-card"><div class="order-head"><span>${title}</span><span>${active ? "Activa" : "Inactiva"}</span></div><div class="order-meta">${o.description || ""}</div><div class="order-meta">${priceText}</div><div class="row-actions"><button type="button" class="btn-ok" data-admin-offer-action="edit" data-id="${o.id}">Editar</button><button type="button" class="btn-del" data-admin-offer-action="delete" data-id="${o.id}">Eliminar</button></div></article>`;
    })
    .join("");
}

function renderAdminUsers(users, filterText) {
  const body = document.getElementById("usersAdminBody");
  if (!body) return;
  const q = (filterText || "").trim().toLowerCase();
  const filtered = q
    ? users.filter((u) => {
      const haystack = [u.email, u.name, u.phone, u.role]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    })
    : users;
  if (!filtered.length) {
    body.innerHTML = '<article class="order-card">No hay usuarios para mostrar.</article>';
    return;
  }
  body.innerHTML = filtered
    .slice()
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")))
    .map((u) => {
      const role = u.role || "cliente";
      const disabled = u.disabled === true;
      const phone = u.phone || "";
      const name = u.name || "Sin nombre";
      return `<article class="order-card"><div class="order-head"><span>${name}</span><span>${role}${disabled ? " (desactivado)" : ""}</span></div><div class="order-meta">Correo: ${u.email || u.id}</div><div class="order-meta">Celular: ${phone || "-"}</div><div class="row-actions"><button type="button" class="btn-ok" data-admin-user-action="toggle" data-id="${u.id}" data-disabled="${disabled ? "1" : "0"}">${disabled ? "Activar" : "Desactivar"}</button><button type="button" class="btn-del" data-admin-user-action="delete" data-id="${u.id}">Eliminar perfil</button></div></article>`;
    })
    .join("");
}

function renderAdminOrdersForDeletion(orders) {
  const body = document.getElementById("ordersAdminBody");
  if (!body) return;
  const items = orders.slice(0, 30);
  if (!items.length) {
    body.innerHTML = '<article class="order-card">No hay pedidos.</article>';
    return;
  }
  body.innerHTML = items
    .map((o) => {
      const status = normalizeAdminStatus(o.status || o.estado);
      const when = o.createdAt?.toDate
        ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(o.createdAt.toDate())
        : "Fecha";
      const who = o.clientName || o.clientEmail || o.clienteNombre || "Cliente";
      return `<article class="order-card"><div class="order-head"><span>${who}</span><span>${when}</span></div><div class="order-meta"><strong>${o.campaignName || "Pedido"}</strong> | ${formatMXN(o.budget || o.totalEstimado || 0)}</div><div class="order-meta">Estado: ${status}</div><div class="row-actions"><button type="button" class="btn-del" data-admin-order-action="delete" data-id="${o.id}">Eliminar</button></div></article>`;
    })
    .join("");
}

function calculateEstimatedCost(product, quantity) {
  const base = Number(product?.basePrice || product?.price || 0);
  const variant = Number(product?.variantPrice || 0);
  return (base + variant) * Number(quantity || 0);
}

function renderProductsSelect(products) {
  const select = document.getElementById("productId");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">Selecciona producto</option>' + products.map((product) => `<option value="${product.id}">${product.name || product.title || product.id}</option>`).join("");
  select.value = selected;
}

function renderProductsCatalog(products) {
  const body = document.getElementById("productsCatalogBody");
  if (!body) return;
  if (!products.length) {
    body.innerHTML = '<article class="offer-card">No hay productos disponibles.</article>';
    return;
  }

  body.innerHTML = products
    .map((product) => {
      const name = product.name || product.title || product.id;
      const desc = product.description || "";
      const price = product.basePrice || product.price;
      const priceText = price ? formatMXN(price) : "Precio a consultar";
      return `<article class="offer-card"><h3>${name}</h3><p>${desc}</p><strong>${priceText}</strong><div class="row-actions"><button type="button" class="btn-ok" data-catalog-action="select" data-id="${product.id}">Elegir</button></div></article>`;
    })
    .join("");
}

function setEstimatedCostText(value) {
  const input = document.getElementById("estimatedCost");
  if (!input) return;
  input.value = formatMXN(value);
}

function renderCartItems(items) {
  const body = document.getElementById("cartBody");
  if (!body) return;
  if (!items.length) {
    body.innerHTML = '<article class="cart-card">Tu carrito esta vacio.</article>';
    return;
  }

  body.innerHTML = items
    .map((item) => {
      const when = item.fechaCreacion?.toDate
        ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(item.fechaCreacion.toDate())
        : "Fecha pendiente";
      return `<article class="cart-card"><div class="order-head"><span>${item.productoNombre}</span><span>${formatMXN(item.costoEstimado)}</span></div><div class="order-meta">Cantidad: ${item.cantidad} | Pago: ${item.metodoPago}</div><div class="order-meta">Descripcion: ${item.descripcion}</div><div class="order-meta">Cambios: ${item.cambiosDisenoAnterior || "Sin cambios"}</div><div class="order-meta">Estado: ${item.estado}</div><div class="order-meta">Fecha: ${when}</div><div class="row-actions"><button class="btn-ok" data-cart-action="edit" data-id="${item.id}">Editar</button><button class="btn-del" data-cart-action="delete" data-id="${item.id}">Eliminar</button></div></article>`;
    })
    .join("");
}

function fillFormFromCartItem(item) {
  document.getElementById("editingCartId").value = item.id;
  document.getElementById("productId").value = item.productoId || "";
  document.getElementById("quantity").value = String(item.cantidad || 1);
  document.getElementById("paymentMethod").value = item.metodoPago || "";
  document.getElementById("details").value = item.descripcion || "";
  document.getElementById("designChanges").value = item.cambiosDisenoAnterior || "";
  setEstimatedCostText(item.costoEstimado || 0);
}

async function uploadAttachments(user, files) {
  const attachments = [];
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Archivo no permitido");
    }
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const path = `clientes/${user.uid}/cart/${safeName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    attachments.push({ name: file.name, type: file.type, path, url });
  }
  return attachments;
}

function findDuplicateCartItem(items, payload, excludeId) {
  return items.find((item) => {
    if (excludeId && item.id === excludeId) return false;
    return item.enviado !== true &&
      item.productoId === payload.productoId &&
      Number(item.cantidad) === Number(payload.cantidad) &&
      item.descripcion === payload.descripcion &&
      item.metodoPago === payload.metodoPago;
  });
}

function renderWelcome(user, profile) {
  const nameEl = document.getElementById("clientWelcomeName");
  const summaryEl = document.getElementById("clientWelcomeSummary");
  const dateEl = document.getElementById("clientWelcomeDate");
  const avatarEl = document.getElementById("clientAvatar");
  if (!nameEl || !summaryEl || !dateEl || !avatarEl) return;

  const displayName = profile?.name || user.displayName || (user.email ? user.email.split("@")[0] : "Cliente");
  nameEl.textContent = displayName;
  summaryEl.textContent = "Tu panel esta sincronizado en tiempo real.";
  dateEl.textContent = formatDateNow();
  if (profile?.photoURL) avatarEl.src = profile.photoURL;
}

function renderClientProfile(user, profile) {
  const nameEl = document.getElementById("clientProfileName");
  const emailEl = document.getElementById("clientProfileEmail");
  const uidEl = document.getElementById("clientProfileUid");
  const displayName = profile?.name || user.displayName || (user.email ? user.email.split("@")[0] : "Cliente");
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email || "-";
  if (uidEl) uidEl.textContent = user.uid || "-";
}

function renderClientSummary(orders, cartItems, offers) {
  const activeEl = document.getElementById("summaryActive");
  const doneEl = document.getElementById("summaryDone");
  const cartEl = document.getElementById("summaryCart");
  const offersEl = document.getElementById("summaryOffers");
  const welcomeSummaryEl = document.getElementById("clientWelcomeSummary");

  const active = orders.filter((order) => isClientActiveStatus(normalizeClientStatus(order.status))).length;
  const done = orders.filter((order) => normalizeClientStatus(order.status) === "Entregado y pagado").length;
  const cartCount = cartItems.reduce((total, item) => total + Number(item.cantidad || item.quantity || 1), 0);

  if (activeEl) activeEl.textContent = String(active);
  if (doneEl) doneEl.textContent = String(done);
  if (cartEl) cartEl.textContent = String(cartCount);
  if (offersEl) offersEl.textContent = String(offers.length);
  if (welcomeSummaryEl) welcomeSummaryEl.textContent = `Tienes ${active} pedidos activos y ${done} terminados.`;
}

function renderProcessOrders(orders) {
  const body = document.getElementById("clientProcessBody");
  if (!body) return;
  const activeOrders = orders.filter((order) => isClientActiveStatus(normalizeClientStatus(order.status))).slice(0, 4);
  if (!activeOrders.length) {
    body.innerHTML = '<article class="process-card">No tienes pedidos activos por ahora.</article>';
    return;
  }

  body.innerHTML = activeOrders
    .map((order) => {
      const status = normalizeClientStatus(order.status);
      const progress = getClientProgressPercent(status);
      return `<article class="process-card"><div class="order-head"><span>${order.campaignName}</span><span>${status}</span></div><div class="order-meta">${order.channel} - ${formatMXN(order.budget)}</div><div class="order-meta">${order.createdAt?.toDate ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(order.createdAt.toDate()) : "Fecha pendiente"}</div><div class="progress"><span style="width:${progress}%"></span></div></article>`;
    })
    .join("");
}

function renderOffers(offers) {
  const body = document.getElementById("offersBody");
  if (!body) return;
  if (!offers.length) {
    body.innerHTML = '<article class="offer-card">No hay ofertas activas en este momento.</article>';
    return;
  }

  body.innerHTML = offers
    .map((offer) => {
      const title = offer.title || offer.name || "Oferta especial";
      const description = offer.description || "Promocion disponible por tiempo limitado.";
      const price = offer.price ? formatMXN(offer.price) : "Consulta precio";
      return `<article class="offer-card"><h3>${title}</h3><p>${description}</p><strong>${price}</strong></article>`;
    })
    .join("");
}

function setupLoginPage() {
  let initialAuthChecked = false;
  onAuthStateChanged(auth, async (user) => {
    // Solo en el primer callback: si ya habia sesion persistida, la cerramos.
    if (initialAuthChecked) return;
    initialAuthChecked = true;
    if (!user) return;
    try {
      await signOut(auth);
      setMessage("loginMessage", "Sesion previa cerrada. Inicia sesion.", false);
    } catch (error) {
      console.error(error);
    }
  });

  const form = document.getElementById("loginForm");
  const clearBtn = document.getElementById("clearLogin");

  try {
    const authError = localStorage.getItem("authErrorMessage");
    if (authError) {
      localStorage.removeItem("authErrorMessage");
      setMessage("loginMessage", authError, true);
    }
  } catch {}

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("userEmail").value.trim();
    const password = document.getElementById("userPassword").value.trim();

    if (!email || !password) {
      setMessage("loginMessage", "Completa correo y contrasena.", true);
      return;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const profile = await ensureUserProfile(credential.user);
      setMessage("loginMessage", "Acceso correcto. Redirigiendo...", false);
      goTo(profile.role === "admin" ? "admin.html" : "cliente.html");
    } catch (error) {
      setMessage("loginMessage", "No se pudo iniciar sesion. Verifica tus datos.", true);
      console.error(error);
    }
  });

  const showPassCheckbox = document.getElementById("showPassword");
  showPassCheckbox.addEventListener("change", () => {
    const passwordInput = document.getElementById("userPassword");
    passwordInput.type = showPassCheckbox.checked ? "text" : "password";
  });


  clearBtn.addEventListener("click", () => {
    form.reset();
    setMessage("loginMessage", "Formulario limpio.", false);
  });
}

function renderClientOrders(orders) {
  const body = document.getElementById("clientOrdersBody");
  if (!orders.length) {
    body.innerHTML = '<article class="order-card">Aun no tienes solicitudes.</article>';
    return;
  }

  body.innerHTML = orders
    .map(
      (order) => `<article class="order-card"><div class="order-head"><span>${order.campaignName}</span><span>${formatMXN(order.budget)}</span></div><div class="order-meta">Canal: ${order.channel}</div><div class="order-meta">Detalle: ${order.details}</div><span class="status-pill">${order.status}</span></article>`
    )
    .join("");
}

function renderClientNotifications(orders) {
  const body = document.getElementById("clientNotificationsBody");
  if (!body) return;
  if (!orders.length) {
    body.innerHTML = '<article class="order-card">Aun no hay notificaciones nuevas.</article>';
    return;
  }

  const items = orders
    .slice()
    .sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
      return bTime - aTime;
    })
    .slice(0, 8);

  body.innerHTML = items
    .map((order) => {
      const status = normalizeClientStatus(order.status || order.estado);
      const whenDate = order.updatedAt?.toDate
        ? order.updatedAt.toDate()
        : (order.createdAt?.toDate ? order.createdAt.toDate() : null);
      const when = whenDate
        ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(whenDate)
        : "Fecha pendiente";
      const isActive = isClientActiveStatus(status);
      const note = order.adminNotas || order.pagoNota || "Sin comentarios del admin.";
      return `<article class="order-card"><div class="order-head"><span>${order.campaignName || "Pedido"}</span><span>${when}</span></div><div class="order-meta">Estado: <strong>${status}</strong></div><div class="order-meta">${isActive ? "Tu pedido sigue en proceso." : "Tu pedido ya fue finalizado."}</div><div class="order-meta">Nota: ${note}</div></article>`;
    })
    .join("");
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent || "";
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

function lockBodyScroll(isLocked) {
  document.body.style.overflow = isLocked ? "hidden" : "";
}

function saveClientDraft(payload) {
  try {
    localStorage.setItem("clientOrderDraft", JSON.stringify(payload));
  } catch (error) {
    console.error("No se pudo guardar borrador", error);
  }
}

function readClientDraft() {
  try {
    const raw = localStorage.getItem("clientOrderDraft");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("No se pudo leer borrador", error);
    return null;
  }
}

function clearClientDraft() {
  try {
    localStorage.removeItem("clientOrderDraft");
  } catch (error) {
    console.error("No se pudo limpiar borrador", error);
  }
}

const CLIENT_QUEUE_KEY = "clientPendingQueue";
const CLIENT_VIEW_KEY = "clientCurrentView";
const ADMIN_VIEW_KEY = "adminCurrentView";

function readClientQueue() {
  try {
    const raw = localStorage.getItem(CLIENT_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("No se pudo leer cola local", error);
    return [];
  }
}

function writeClientQueue(queue) {
  try {
    localStorage.setItem(CLIENT_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error("No se pudo guardar cola local", error);
  }
}

function clearClientQueue() {
  try {
    localStorage.removeItem(CLIENT_QUEUE_KEY);
  } catch (error) {
    console.error("No se pudo limpiar cola local", error);
  }
}

function enqueueClientAction(action) {
  const queue = readClientQueue();
  queue.push({ ...action, queuedAt: Date.now() });
  writeClientQueue(queue);
}

async function createOrderFromCart(user, cartItems) {
  const totalEstimado = cartItems.reduce((total, item) => total + Number(item.costoEstimado || 0), 0);
  const metodoPago = cartItems[0]?.metodoPago || "pendiente";
  const orderData = {
    clienteId: user.uid,
    clientUid: user.uid,
    clienteNombre: user.displayName || user.email,
    clientName: user.displayName || user.email,
    clientEmail: user.email,
    items: cartItems.map((item) => item.id),
    totalEstimado,
    metodoPago,
    estado: "Pendiente de revision",
    status: "Pendiente de revision",
    pagoValidado: false,
    fechaCreacion: serverTimestamp(),
    fechaEnvio: serverTimestamp(),
    createdAt: serverTimestamp(),
    adminNotas: "",
    campaignName: `Pedido ${new Date().toLocaleDateString("es-MX")}`,
    channel: "Carrito cliente",
    budget: totalEstimado,
    details: `${cartItems.length} item(s) en carrito`
  };

  const orderRef = await addDoc(collection(db, ORDERS_COLLECTION), orderData);
  for (let i = 0; i < cartItems.length; i += 1) {
    const item = cartItems[i];
    await addDoc(collection(db, ORDER_ITEMS_COLLECTION), {
      orderId: orderRef.id,
      cartItemId: item.id,
      clienteId: user.uid,
      productoId: item.productoId,
      productoNombre: item.productoNombre,
      cantidad: item.cantidad,
      descripcion: item.descripcion,
      cambiosDisenoAnterior: item.cambiosDisenoAnterior || "",
      metodoPago: item.metodoPago,
      costoEstimado: item.costoEstimado,
      archivos: item.archivos || [],
      fechaCreacion: serverTimestamp()
    });
    await updateDoc(doc(db, CART_COLLECTION, item.id), {
      enviado: true,
      estado: "Enviado al admin",
      orderId: orderRef.id,
      fechaEnvio: serverTimestamp()
    });
  }
}

function setupClientPage() {
  onAuthStateChanged(auth, async (user) => {
    if (!requireAuthOrRedirect(user)) return;

    document.documentElement.style.visibility = "";

    const profile = await gateByRole("cliente", user);
    if (!profile) return;

    const refs = {
      form: document.getElementById("orderForm"),
      logoutClient: document.getElementById("logoutClient"),
      productSelect: document.getElementById("productId"),
      quantityInput: document.getElementById("quantity"),
      paymentMethodInput: document.getElementById("paymentMethod"),
      detailsInput: document.getElementById("details"),
      designChangesInput: document.getElementById("designChanges"),
      attachmentsInput: document.getElementById("attachments"),
      editingCartIdInput: document.getElementById("editingCartId"),
      sendCartBtn: document.getElementById("sendCartToAdmin"),
      cartBody: document.getElementById("cartBody"),
      openCartModalBtn: document.getElementById("openCartModal"),
      quickOpenCartBtn: document.getElementById("quickOpenCart"),
      closeCartModalBtn: document.getElementById("closeCartModal"),
      cartModal: document.getElementById("cartModal"),
      cartFabCount: document.getElementById("cartFabCount"),
      networkBanner: document.getElementById("networkBanner"),
      navButtons: Array.from(document.querySelectorAll(".bottom-nav button[data-nav]")),
      viewSections: Array.from(document.querySelectorAll("[data-client-view]")),
      quickButtons: Array.from(document.querySelectorAll(".quick-menu-grid button[data-quick]"))
    };
    const {
      form,
      logoutClient,
      productSelect,
      quantityInput,
      paymentMethodInput,
      detailsInput,
      designChangesInput,
      attachmentsInput,
      editingCartIdInput,
      sendCartBtn,
      cartBody,
      openCartModalBtn,
      quickOpenCartBtn,
      closeCartModalBtn,
      cartModal,
      cartFabCount,
      networkBanner,
      navButtons,
      viewSections,
      quickButtons
    } = refs;
    const newOrderModal = document.getElementById("newOrderModal");
    const closeNewOrderModalBtn = document.getElementById("closeNewOrderModal");
    let currentOrders = [];
    let currentCart = [];
    let currentOffers = [];
    let currentProducts = [];
    let stopOrdersObserver = null;
    let stopCartObserver = null;
    let stopOffersObserver = null;
    let stopProductsObserver = null;
    let lastFocusedElement = null;

    renderWelcome(user, profile);
    renderClientProfile(user, profile);

    const setClientView = (view) => {
      if (view === "carrito") {
        openCartModal();
        return;
      }
      const validViews = ["inicio", "catalogo", "pedidos", "notificaciones", "perfil"];
      const nextView = validViews.includes(view) ? view : "inicio";

      viewSections.forEach((section) => {
        section.hidden = section.dataset.clientView !== nextView;
      });

      navButtons.forEach((button) => {
        const active = button.dataset.nav === nextView;
        button.classList.toggle("active", active);
        if (active) {
          button.setAttribute("aria-current", "page");
        } else {
          button.removeAttribute("aria-current");
        }
      });

      try {
        localStorage.setItem(CLIENT_VIEW_KEY, nextView);
      } catch (error) {
        console.error("No se pudo guardar vista activa", error);
      }
    };

    const scrollToId = (id, focusEl) => {
      const el = document.getElementById(id);
      if (!el) return;
      // Espera a que la vista se muestre antes de hacer scroll.
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        if (focusEl && focusEl.focus) focusEl.focus();
      });
    };

    const updateNetworkBanner = () => {
      if (!networkBanner) return;
      const online = navigator.onLine;
      networkBanner.hidden = online;
      networkBanner.textContent = online
        ? "Conexion restablecida"
        : "Sin conexion: guardaremos cambios para sincronizar despues.";
    };

    const processPendingQueue = async () => {
      if (!navigator.onLine) return;
      const queue = readClientQueue();
      if (!queue.length) return;
      const remaining = [];

      for (let i = 0; i < queue.length; i += 1) {
        const action = queue[i];
        try {
          if (action.type === "upsertCart") {
            if (action.editingId) {
              await updateDoc(doc(db, CART_COLLECTION, action.editingId), {
                ...action.payload,
                fechaCreacion: serverTimestamp()
              });
            } else {
              await addDoc(collection(db, CART_COLLECTION), {
                ...action.payload,
                fechaCreacion: serverTimestamp()
              });
            }
          }
          if (action.type === "sendCart") {
            const q = query(collection(db, CART_COLLECTION), where("clientUid", "==", user.uid), where("enviado", "==", false));
            const snap = await getDocs(q);
            const items = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
            if (items.length) {
              await createOrderFromCart(user, items);
            }
          }
        } catch (error) {
          console.error("No se pudo sincronizar accion pendiente", action, error);
          remaining.push(action);
        }
      }

      writeClientQueue(remaining);
      if (!remaining.length) {
        setMessage("clientMessage", "Sincronizacion completada.", false);
      }
    };

    if (!window.__clientNetworkHandlersBound) {
      window.__clientNetworkHandlersBound = true;
      window.addEventListener("online", () => {
        updateNetworkBanner();
        processPendingQueue();
      });
      window.addEventListener("offline", updateNetworkBanner);
    }

    updateNetworkBanner();
    processPendingQueue();

    const openCartModal = () => {
      if (!cartModal) return;
      lastFocusedElement = document.activeElement;
      cartModal.hidden = false;
      cartModal.setAttribute("aria-modal", "true");
      lockBodyScroll(true);
      if (closeCartModalBtn) closeCartModalBtn.focus();
    };

    const closeCartModal = () => {
      if (!cartModal) return;
      cartModal.hidden = true;
      lockBodyScroll(false);
      if (lastFocusedElement && lastFocusedElement.focus) {
        lastFocusedElement.focus();
      }
    };

    // Asegura estado inicial cerrado.
    closeCartModal();

    let lastFocusedForNewOrder = null;
    const openNewOrderModal = () => {
      if (!newOrderModal) return;
      lastFocusedForNewOrder = document.activeElement;
      newOrderModal.hidden = false;
      lockBodyScroll(true);
      // Focus first interactive element.
      if (productSelect) productSelect.focus();
    };
    const closeNewOrderModal = () => {
      if (!newOrderModal) return;
      newOrderModal.hidden = true;
      lockBodyScroll(false);
      if (lastFocusedForNewOrder && lastFocusedForNewOrder.focus) lastFocusedForNewOrder.focus();
    };
    if (newOrderModal && newOrderModal.hidden !== true) {
      newOrderModal.hidden = true;
    }
    if (closeNewOrderModalBtn && !closeNewOrderModalBtn.dataset.bound) {
      closeNewOrderModalBtn.dataset.bound = "1";
      closeNewOrderModalBtn.addEventListener("click", closeNewOrderModal);
    }
    if (newOrderModal && !newOrderModal.dataset.bound) {
      newOrderModal.dataset.bound = "1";
      newOrderModal.addEventListener("click", (event) => {
        if (event.target === newOrderModal) closeNewOrderModal();
      });
      document.addEventListener("keydown", (event) => {
        if (!newOrderModal || newOrderModal.hidden) return;
        if (event.key === "Escape") {
          event.preventDefault();
          closeNewOrderModal();
        }
      });
    }

    // Safety: si el SW sirvio una version vieja donde el modal no venia oculto,
    // lo forzamos a cerrarse al iniciar.
    if (cartModal && cartModal.hidden !== true) {
      cartModal.hidden = true;
      lockBodyScroll(false);
    }

    const onCartModalKeydown = (event) => {
      if (!cartModal || cartModal.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeCartModal();
      }
    };

    if (openCartModalBtn && !openCartModalBtn.dataset.bound) {
      openCartModalBtn.dataset.bound = "1";
      openCartModalBtn.addEventListener("click", openCartModal);
    }
    if (quickOpenCartBtn && !quickOpenCartBtn.dataset.bound) {
      quickOpenCartBtn.dataset.bound = "1";
      quickOpenCartBtn.addEventListener("click", openCartModal);
    }
    if (closeCartModalBtn && !closeCartModalBtn.dataset.bound) {
      closeCartModalBtn.dataset.bound = "1";
      closeCartModalBtn.addEventListener("click", closeCartModal);
    }
    // Extra guard: si por algun motivo no se bindeo antes, asegura el cierre.
    if (closeCartModalBtn && !closeCartModalBtn.dataset.bound2) {
      closeCartModalBtn.dataset.bound2 = "1";
      closeCartModalBtn.addEventListener("click", () => closeCartModal());
    }
    if (cartModal && !cartModal.dataset.bound) {
      cartModal.dataset.bound = "1";
      cartModal.addEventListener("click", (event) => {
        if (event.target === cartModal) closeCartModal();
      });
      document.addEventListener("keydown", onCartModalKeydown);
    }

    if (logoutClient && !logoutClient.dataset.bound) {
      logoutClient.dataset.bound = "1";
      logoutClient.addEventListener("click", async () => {
        try {
          // Limpieza de datos locales del cliente (PWA).
          clearClientDraft();
          clearClientQueue();
          try { localStorage.removeItem(CLIENT_VIEW_KEY); } catch {}
          if (cartModal && !cartModal.hidden) {
            cartModal.hidden = true;
            lockBodyScroll(false);
          }
          await signOut(auth);
        } catch (error) {
          console.error(error);
        } finally {
          goTo("login.html");
        }
      });
    }

    if (navButtons.length && !form.dataset.navBound) {
      form.dataset.navBound = "1";
      navButtons.forEach((button) => {
        button.addEventListener("click", () => {
          setClientView(button.dataset.nav);
        });
      });
      let initialView = "inicio";
      try {
        initialView = localStorage.getItem(CLIENT_VIEW_KEY) || "inicio";
      } catch (error) {
        console.error("No se pudo leer vista activa", error);
      }

      // Migracion: nunca iniciar en "carrito" (era una vista en versiones previas).
      if (initialView === "carrito") {
        initialView = "inicio";
        try {
          localStorage.setItem(CLIENT_VIEW_KEY, initialView);
        } catch {}
      }
      setClientView(initialView);
    }

    if (quickButtons.length && !form.dataset.quickBound) {
      form.dataset.quickBound = "1";
      quickButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.dataset.quick;
          if (action === "carrito") {
            setClientView("carrito");
            return;
          }
          if (action === "perfil") {
            setClientView("perfil");
            scrollToId("sectionProfile");
            return;
          }
          if (action === "proceso") {
            setClientView("pedidos");
            scrollToId("sectionProcess");
            return;
          }
          if (action === "historial") {
            setClientView("pedidos");
            scrollToId("sectionOrders");
            return;
          }
          if (action === "catalogo") {
            setClientView("catalogo");
            scrollToId("sectionCatalog");
            return;
          }
          if (action === "crear") {
            openNewOrderModal();
            if (detailsInput) detailsInput.focus();
            return;
          }
          if (action === "chat") {
            const subject = encodeURIComponent("Soporte pedido (cliente)");
            const body = encodeURIComponent(`Hola, necesito ayuda. Mi correo: ${user.email || ""}`);
            window.open(`mailto:${DEFAULT_ADMIN_CONTACT_EMAIL}?subject=${subject}&body=${body}`, "_blank");
            setMessage("clientMessage", "Abriendo tu correo para contactar al admin.", false);
          }
        });
      });
    }

    if (!form.dataset.observing) {
      form.dataset.observing = "1";
      stopOrdersObserver = observeOrdersByUser(
        user.uid,
        (orders) => {
          currentOrders = orders;
          renderClientOrders(orders);
          renderClientNotifications(orders);
          renderProcessOrders(orders);
          renderClientSummary(currentOrders, currentCart, currentOffers);
        },
        (error) => {
          setMessage("clientMessage", "No se pudieron cargar tus solicitudes.", true);
          console.error(error);
        }
      );
      window.addEventListener("beforeunload", () => {
        if (stopOrdersObserver) stopOrdersObserver();
      }, { once: true });

      stopCartObserver = observeCartByUser(
        user.uid,
        (items) => {
          currentCart = items.filter((item) => item.enviado !== true);
          renderCartItems(currentCart);
          if (cartFabCount) cartFabCount.textContent = String(currentCart.length);
          renderClientSummary(currentOrders, currentCart, currentOffers);
        },
        (error) => console.error(error)
      );

      stopOffersObserver = observeOffers(
        (offers) => {
          currentOffers = offers;
          renderOffers(offers);
          renderClientSummary(currentOrders, currentCart, currentOffers);
        },
        (error) => {
          setMessage("clientMessage", "No se pudieron cargar ofertas.", true);
          console.error(error);
        }
      );

      stopProductsObserver = observeProducts(
        (products) => {
          currentProducts = products;
          renderProductsSelect(products);
          renderProductsCatalog(products);
          const selectedProduct = currentProducts.find((item) => item.id === productSelect.value);
          const estimated = calculateEstimatedCost(selectedProduct, Number(quantityInput.value || 1));
          setEstimatedCostText(estimated);
        },
        (error) => {
          setMessage("clientMessage", "No se pudieron cargar productos.", true);
          console.error(error);
        }
      );

      window.addEventListener("beforeunload", () => {
        if (stopCartObserver) stopCartObserver();
        if (stopOffersObserver) stopOffersObserver();
        if (stopProductsObserver) stopProductsObserver();
      }, { once: true });
    }

    const catalogBody = document.getElementById("productsCatalogBody");
    if (catalogBody && !catalogBody.dataset.bound) {
      catalogBody.dataset.bound = "1";
      catalogBody.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-catalog-action]");
        if (!button) return;
        const productId = button.dataset.id;
        if (!productId) return;
        productSelect.value = productId;
        recalculateEstimate();
        openNewOrderModal();
        if (detailsInput) detailsInput.focus();
        setMessage("clientMessage", "Producto seleccionado. Completa tu solicitud.", false);
      });
    }

    const recalculateEstimate = () => {
      const selectedProduct = currentProducts.find((item) => item.id === productSelect.value);
      const estimated = calculateEstimatedCost(selectedProduct, Number(quantityInput.value || 1));
      setEstimatedCostText(estimated);
    };

    if (productSelect && !productSelect.dataset.bound) {
      productSelect.dataset.bound = "1";
      productSelect.addEventListener("change", recalculateEstimate);
    }
    if (quantityInput && !quantityInput.dataset.bound) {
      quantityInput.dataset.bound = "1";
      quantityInput.addEventListener("input", recalculateEstimate);
    }

    const persistDraft = () => {
      saveClientDraft({
        productId: productSelect.value,
        quantity: quantityInput.value,
        paymentMethod: paymentMethodInput.value,
        details: detailsInput.value,
        designChanges: designChangesInput.value
      });
    };

    if (form && !form.dataset.draftBound) {
      form.dataset.draftBound = "1";
      [productSelect, quantityInput, paymentMethodInput, detailsInput, designChangesInput].forEach((input) => {
        if (!input) return;
        input.addEventListener("input", persistDraft);
        input.addEventListener("change", persistDraft);
      });
    }

    if (form && !form.dataset.draftRestored) {
      form.dataset.draftRestored = "1";
      const draft = readClientDraft();
      if (draft) {
        if (draft.productId) productSelect.value = draft.productId;
        if (draft.quantity) quantityInput.value = draft.quantity;
        if (draft.paymentMethod) paymentMethodInput.value = draft.paymentMethod;
        if (draft.details) detailsInput.value = draft.details;
        if (draft.designChanges) designChangesInput.value = draft.designChanges;
        recalculateEstimate();
      }
    }

    if (!form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        const selectedProduct = currentProducts.find((item) => item.id === productSelect.value);
        const cantidad = Number(quantityInput.value || 0);
        const descripcion = detailsInput.value.trim();
        const metodoPago = paymentMethodInput.value;
        const cambios = designChangesInput.value.trim();
        const costoEstimado = calculateEstimatedCost(selectedProduct, cantidad);
        const editingId = editingCartIdInput.value.trim();

        if (!selectedProduct) {
          setMessage("clientMessage", "Selecciona un producto valido.", true);
          return;
        }
        if (!Number.isFinite(cantidad) || cantidad < 1) {
          setMessage("clientMessage", "Ingresa una cantidad valida.", true);
          return;
        }
        if (!descripcion) {
          setMessage("clientMessage", "La descripcion es obligatoria.", true);
          return;
        }
        if (!metodoPago) {
          setMessage("clientMessage", "Selecciona metodo de pago.", true);
          return;
        }

        try {
          setButtonLoading(submitBtn, true, "Guardando...");
          // Adjuntos desactivados (sin Firebase Storage).
          const archivos = [];
          const payload = {
            clienteId: user.uid,
            clientUid: user.uid,
            clienteNombre: user.displayName || user.email,
            clientEmail: user.email,
            productoId: selectedProduct.id,
            productoNombre: selectedProduct.name || selectedProduct.title || selectedProduct.id,
            cantidad,
            descripcion,
            cambiosDisenoAnterior: cambios,
            metodoPago,
            costoEstimado,
            estado: "Pendiente de envio",
            fechaCreacion: serverTimestamp(),
            archivos,
            enviado: false
          };

          const duplicate = findDuplicateCartItem(currentCart, payload, editingId || undefined);
          if (duplicate) {
            setMessage("clientMessage", "Este item ya existe en el carrito.", true);
            return;
          }

          if (editingId) {
            if (!navigator.onLine) {
              enqueueClientAction({ type: "upsertCart", editingId, payload });
              setMessage("clientMessage", "Sin conexion: cambio guardado para sincronizar.", false);
            } else {
              await updateDoc(doc(db, CART_COLLECTION, editingId), payload);
            }
          } else {
            if (!navigator.onLine) {
              enqueueClientAction({ type: "upsertCart", payload });
              setMessage("clientMessage", "Sin conexion: item en cola para sincronizar.", false);
            } else {
              await addDoc(collection(db, CART_COLLECTION), payload);
            }
          }

          form.reset();
          clearClientDraft();
          editingCartIdInput.value = "";
          quantityInput.value = "1";
          setEstimatedCostText(0);
          if (navigator.onLine) {
            setMessage("clientMessage", editingId ? "Item del carrito actualizado." : "Item agregado al carrito.", false);
          }
        } catch (error) {
          setMessage("clientMessage", "No se pudo guardar en carrito.", true);
          console.error(error);
        } finally {
          setButtonLoading(submitBtn, false, "Guardando...");
        }
      });
    }

    if (cartBody && !cartBody.dataset.bound) {
      cartBody.dataset.bound = "1";
      cartBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-cart-action]");
        if (!button) return;
        const action = button.dataset.cartAction;
        const id = button.dataset.id;
        const target = currentCart.find((item) => item.id === id);
        if (!target) return;

        if (action === "edit") {
          fillFormFromCartItem(target);
          setMessage("clientMessage", "Editando item del carrito.", false);
          return;
        }

        if (action === "delete") {
          try {
            await deleteDoc(doc(db, CART_COLLECTION, id));
            setMessage("clientMessage", "Item eliminado del carrito.", false);
          } catch (error) {
            setMessage("clientMessage", "No se pudo eliminar el item.", true);
            console.error(error);
          }
        }
      });
    }

    if (sendCartBtn && !sendCartBtn.dataset.bound) {
      sendCartBtn.dataset.bound = "1";
      sendCartBtn.addEventListener("click", async () => {
        if (!currentCart.length) {
          setMessage("clientMessage", "No puedes enviar un carrito vacio.", true);
          return;
        }

        try {
          setButtonLoading(sendCartBtn, true, "Enviando...");
          if (!navigator.onLine) {
            enqueueClientAction({ type: "sendCart" });
            setMessage("clientMessage", "Sin conexion: envio en cola, se sincroniza al reconectar.", false);
          } else {
            await createOrderFromCart(user, currentCart);
            setMessage("clientMessage", "Pedido enviado correctamente al admin.", false);
          }
          closeCartModal();
        } catch (error) {
          setMessage("clientMessage", "No se pudo enviar el carrito al admin.", true);
          console.error(error);
        } finally {
          setButtonLoading(sendCartBtn, false, "Enviando...");
        }
      });
    }

  });
}

function renderAdminOrders(orders) {
  const body = document.getElementById("adminOrdersBody");
  document.getElementById("totalRequests").textContent = String(orders.length);
  document.getElementById("pendingRequests").textContent = String(orders.filter((o) => o.status === "Pendiente").length);
  document.getElementById("approvedRequests").textContent = String(orders.filter((o) => o.status === "En proceso" || o.status === "Terminado").length);
  document.getElementById("rejectedRequests").textContent = String(orders.filter((o) => o.status === "Entregado y pagado").length);

  if (!orders.length) {
    body.innerHTML = '<tr><td colspan="6">No hay pedidos registrados.</td></tr>';
    return;
  }

  body.innerHTML = orders
    .map(
      (order) => {
        const statusClass = getStatusClass(order.status);
        const nextStatus = getNextStatus(order.status);
        const advanceBtn = nextStatus
          ? `<button class="btn-ok" data-action="advance" data-next="${nextStatus}" data-id="${order.id}">${getAdvanceLabel(nextStatus)}</button>`
          : "<span>Flujo completado</span>";

        return `<tr><td>${order.clientName || order.clientEmail}</td><td><strong>${order.campaignName}</strong><br>${order.details}</td><td>${order.channel}</td><td>${formatMXN(order.budget)}</td><td><span class="state ${statusClass}">${order.status}</span></td><td><div class="row-actions">${advanceBtn}<button class="btn-del" data-action="delete" data-id="${order.id}">Eliminar</button></div></td></tr>`;
      }
    )
    .join("");
}

async function createUserByAdmin(email, password, role, phone, name) {
  const tempApp = initializeApp(firebaseConfig, `admin-create-${Date.now()}`);
  const tempAuth = getAuth(tempApp);
  try {
    const credential = await createUserWithEmailAndPassword(tempAuth, email, password);
    await setDoc(doc(db, USERS_COLLECTION, credential.user.uid), {
      uid: credential.user.uid,
      email,
      name: name || "",
      role,
      phone: phone || "",
      createdAt: serverTimestamp()
    });
  } finally {
    await signOut(tempAuth);
    await deleteApp(tempApp);
  }
}

function setupAdminPage() {
  onAuthStateChanged(auth, async (user) => {
    if (!requireAuthOrRedirect(user)) return;

    document.documentElement.style.visibility = "";

    const profile = await gateByRole("admin", user);
    if (!profile) return;

    const tableBody = document.getElementById("adminOrdersBody");
    const logoutAdmin = document.getElementById("logoutAdmin");
    const logoutAdminSettings = document.getElementById("logoutAdminSettings");
    const createBtn = document.getElementById("createUserByAdmin");
    const filterStatus = document.getElementById("adminFilterStatus");
    const filterClient = document.getElementById("adminFilterClient");
    const filterDate = document.getElementById("adminFilterDate");
    const filterPayment = document.getElementById("adminFilterPayment");
    const detailCard = document.getElementById("adminOrderDetail");
    const detailBody = document.getElementById("adminDetailBody");
    const detailStatus = document.getElementById("adminDetailStatus");
    const detailPayment = document.getElementById("adminDetailPayment");
    const detailNote = document.getElementById("adminDetailNote");
    const detailSave = document.getElementById("adminSaveDetail");
    const detailClose = document.getElementById("adminCloseDetail");
    const detailMessage = document.getElementById("adminDetailMessage");
    const adminNavButtons = Array.from(document.querySelectorAll(".bottom-nav button[data-admin-nav]"));
    const adminViewSections = Array.from(document.querySelectorAll("[data-admin-view]"));
    const adminNotificationsBody = document.getElementById("adminNotificationsBody");
    const summaryCards = Array.from(document.querySelectorAll(".cards [data-summary-filter], .cards [data-summary-payment]"));


    const settingsNavButtons = Array.from(document.querySelectorAll("button[data-admin-settings-nav]"));
    const settingsViews = Array.from(document.querySelectorAll("[data-admin-settings-view]"));
    const productName = document.getElementById("productName");
    const productBasePrice = document.getElementById("productBasePrice");
    const productVariantPrice = document.getElementById("productVariantPrice");
    const productDescription = document.getElementById("productDescription");
    const productActive = document.getElementById("productActive");
    const editingProductId = document.getElementById("editingProductId");
    const saveProductBtn = document.getElementById("saveProduct");
    const clearProductFormBtn = document.getElementById("clearProductForm");

    const offerTitle = document.getElementById("offerTitle");
    const offerPrice = document.getElementById("offerPrice");
    const offerDescription = document.getElementById("offerDescription");
    const offerActive = document.getElementById("offerActive");
    const editingOfferId = document.getElementById("editingOfferId");
    const saveOfferBtn = document.getElementById("saveOffer");
    const clearOfferFormBtn = document.getElementById("clearOfferForm");

    const usersSearch = document.getElementById("usersSearch");
    const refreshUsersBtn = document.getElementById("refreshUsers");

    const businessContactEmail = document.getElementById("businessContactEmail");
    const businessWhatsApp = document.getElementById("businessWhatsApp");
    const saveBusinessSettingsBtn = document.getElementById("saveBusinessSettings");
    let stopOrdersObserver = null;
    let stopUsersObserver = null;
    let stopProductsObserver = null;
    let stopOffersObserver = null;
    let adminOrders = [];
    let adminUsers = [];
    let adminProducts = [];
    let adminOffers = [];
    let selectedOrder = null;

    const setAdminView = (view) => {
      const valid = ["crear", "pedidos", "panel", "notificaciones", "ajustes"];
      const next = valid.includes(view) ? view : "panel";
      adminViewSections.forEach((section) => {
        section.hidden = section.dataset.adminView !== next;
      });
      adminNavButtons.forEach((button) => {
        const active = button.dataset.adminNav === next;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      try {
        localStorage.setItem(ADMIN_VIEW_KEY, next);
      } catch {}
    };

    const setSettingsView = (view) => {
      const valid = ["productos", "promos", "usuarios", "pedidos", "general"];
      const next = valid.includes(view) ? view : "productos";
      settingsViews.forEach((section) => {
        section.hidden = section.dataset.adminSettingsView !== next;
      });
      settingsNavButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.adminSettingsNav === next);
      });
    };

    if (settingsNavButtons.length && !document.body.dataset.adminSettingsNavBound) {
      document.body.dataset.adminSettingsNavBound = "1";
      settingsNavButtons.forEach((button) => {
        button.addEventListener("click", () => setSettingsView(button.dataset.adminSettingsNav));
      });
      setSettingsView("productos");
    }

    const setAdminMsg = (id, text, isError) => setMessage(id, text, isError);

    const clearProductForm = () => {
      if (productName) productName.value = "";
      if (productBasePrice) productBasePrice.value = "";
      if (productVariantPrice) productVariantPrice.value = "";
      if (productDescription) productDescription.value = "";
      if (productActive) productActive.checked = true;
      if (editingProductId) editingProductId.value = "";
    };

    const clearOfferForm = () => {
      if (offerTitle) offerTitle.value = "";
      if (offerPrice) offerPrice.value = "";
      if (offerDescription) offerDescription.value = "";
      if (offerActive) offerActive.checked = true;
      if (editingOfferId) editingOfferId.value = "";
    };

    if (saveProductBtn && !saveProductBtn.dataset.bound) {
      saveProductBtn.dataset.bound = "1";
      saveProductBtn.addEventListener("click", async () => {
        const name = (productName?.value || "").trim();
        const base = Number(productBasePrice?.value || 0);
        const variant = Number(productVariantPrice?.value || 0);
        const description = (productDescription?.value || "").trim();
        const active = productActive ? productActive.checked : true;
        const id = (editingProductId?.value || "").trim();
        if (!name) {
          setAdminMsg("productsAdminMessage", "El nombre es obligatorio.", true);
          return;
        }
        try {
          await upsertProduct(id || null, {
            name,
            description,
            basePrice: base,
            variantPrice: variant,
            active,
            updatedAt: serverTimestamp()
          });
          setAdminMsg("productsAdminMessage", "Producto guardado.", false);
          clearProductForm();
        } catch (error) {
          console.error(error);
          setAdminMsg("productsAdminMessage", "No se pudo guardar el producto.", true);
        }
      });
    }

    if (clearProductFormBtn && !clearProductFormBtn.dataset.bound) {
      clearProductFormBtn.dataset.bound = "1";
      clearProductFormBtn.addEventListener("click", clearProductForm);
    }

    if (saveOfferBtn && !saveOfferBtn.dataset.bound) {
      saveOfferBtn.dataset.bound = "1";
      saveOfferBtn.addEventListener("click", async () => {
        const title = (offerTitle?.value || "").trim();
        const description = (offerDescription?.value || "").trim();
        const price = offerPrice?.value ? Number(offerPrice.value) : null;
        const active = offerActive ? offerActive.checked : true;
        const id = (editingOfferId?.value || "").trim();
        if (!title) {
          setAdminMsg("offersAdminMessage", "El titulo es obligatorio.", true);
          return;
        }
        try {
          const payload = {
            title,
            description,
            active,
            updatedAt: serverTimestamp()
          };
          if (price != null && Number.isFinite(price)) payload.price = price;
          await upsertOffer(id || null, payload);
          setAdminMsg("offersAdminMessage", "Promo guardada.", false);
          clearOfferForm();
        } catch (error) {
          console.error(error);
          setAdminMsg("offersAdminMessage", "No se pudo guardar la promo.", true);
        }
      });
    }

    if (clearOfferFormBtn && !clearOfferFormBtn.dataset.bound) {
      clearOfferFormBtn.dataset.bound = "1";
      clearOfferFormBtn.addEventListener("click", clearOfferForm);
    }

    const productsAdminBody = document.getElementById("productsAdminBody");
    if (productsAdminBody && !productsAdminBody.dataset.bound) {
      productsAdminBody.dataset.bound = "1";
      productsAdminBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-admin-product-action]");
        if (!button) return;
        const action = button.dataset.adminProductAction;
        const id = button.dataset.id;
        const target = adminProducts.find((p) => p.id === id);
        if (!id || !action) return;
        if (action === "edit" && target) {
          if (productName) productName.value = target.name || target.title || "";
          if (productBasePrice) productBasePrice.value = String(target.basePrice ?? target.price ?? "");
          if (productVariantPrice) productVariantPrice.value = String(target.variantPrice ?? "");
          if (productDescription) productDescription.value = target.description || "";
          if (productActive) productActive.checked = target.active !== false;
          if (editingProductId) editingProductId.value = id;
          return;
        }
        if (action === "delete") {
          const ok = window.confirm("Eliminar este producto? Esta accion es permanente.");
          if (!ok) return;
          try {
            await deleteDoc(doc(db, PRODUCTS_COLLECTION, id));
            setAdminMsg("productsAdminMessage", "Producto eliminado.", false);
          } catch (error) {
            console.error(error);
            setAdminMsg("productsAdminMessage", "No se pudo eliminar el producto.", true);
          }
        }
      });
    }

    const offersAdminBody = document.getElementById("offersAdminBody");
    if (offersAdminBody && !offersAdminBody.dataset.bound) {
      offersAdminBody.dataset.bound = "1";
      offersAdminBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-admin-offer-action]");
        if (!button) return;
        const action = button.dataset.adminOfferAction;
        const id = button.dataset.id;
        const target = adminOffers.find((o) => o.id === id);
        if (!id || !action) return;
        if (action === "edit" && target) {
          if (offerTitle) offerTitle.value = target.title || target.name || "";
          if (offerPrice) offerPrice.value = target.price != null ? String(target.price) : "";
          if (offerDescription) offerDescription.value = target.description || "";
          if (offerActive) offerActive.checked = target.active !== false;
          if (editingOfferId) editingOfferId.value = id;
          return;
        }
        if (action === "delete") {
          const ok = window.confirm("Eliminar esta promo? Esta accion es permanente.");
          if (!ok) return;
          try {
            await deleteDoc(doc(db, OFFERS_COLLECTION, id));
            setAdminMsg("offersAdminMessage", "Promo eliminada.", false);
          } catch (error) {
            console.error(error);
            setAdminMsg("offersAdminMessage", "No se pudo eliminar la promo.", true);
          }
        }
      });
    }

    const usersAdminBody = document.getElementById("usersAdminBody");
    if (usersAdminBody && !usersAdminBody.dataset.bound) {
      usersAdminBody.dataset.bound = "1";
      usersAdminBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-admin-user-action]");
        if (!button) return;
        const action = button.dataset.adminUserAction;
        const id = button.dataset.id;
        if (!id || !action) return;
        if (action === "toggle") {
          const disabled = button.dataset.disabled === "1";
          try {
            await updateDoc(doc(db, USERS_COLLECTION, id), { disabled: !disabled, updatedAt: serverTimestamp() });
            setAdminMsg("usersAdminMessage", disabled ? "Usuario activado." : "Usuario desactivado.", false);
          } catch (error) {
            console.error(error);
            setAdminMsg("usersAdminMessage", "No se pudo actualizar el usuario.", true);
          }
        }
        if (action === "delete") {
          const ok = window.confirm("Eliminar el perfil de este usuario en Firestore? (No elimina la cuenta de Auth)");
          if (!ok) return;
          try {
            await deleteDoc(doc(db, USERS_COLLECTION, id));
            setAdminMsg("usersAdminMessage", "Perfil eliminado.", false);
          } catch (error) {
            console.error(error);
            setAdminMsg("usersAdminMessage", "No se pudo eliminar el perfil.", true);
          }
        }
      });
    }

    const ordersAdminBody = document.getElementById("ordersAdminBody");
    if (ordersAdminBody && !ordersAdminBody.dataset.bound) {
      ordersAdminBody.dataset.bound = "1";
      ordersAdminBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-admin-order-action]");
        if (!button) return;
        const id = button.dataset.id;
        if (!id) return;
        const ok = window.confirm("Eliminar este pedido? Esta accion es permanente.");
        if (!ok) return;
        try {
          await deleteDoc(doc(db, ORDERS_COLLECTION, id));
          setAdminMsg("ordersAdminMessage", "Pedido eliminado.", false);
        } catch (error) {
          console.error(error);
          setAdminMsg("ordersAdminMessage", "No se pudo eliminar el pedido.", true);
        }
      });
    }

    if (usersSearch && !usersSearch.dataset.bound) {
      usersSearch.dataset.bound = "1";
      usersSearch.addEventListener("input", () => {
        renderAdminUsers(adminUsers, usersSearch.value);
      });
    }

    if (refreshUsersBtn && !refreshUsersBtn.dataset.bound) {
      refreshUsersBtn.dataset.bound = "1";
      refreshUsersBtn.addEventListener("click", () => {
        renderAdminUsers(adminUsers, usersSearch?.value || "");
      });
    }

    if (saveBusinessSettingsBtn && !saveBusinessSettingsBtn.dataset.bound) {
      saveBusinessSettingsBtn.dataset.bound = "1";
      saveBusinessSettingsBtn.addEventListener("click", async () => {
        const email = (businessContactEmail?.value || "").trim();
        const whatsapp = (businessWhatsApp?.value || "").trim();
        if (!email) {
          setAdminMsg("generalAdminMessage", "El correo es obligatorio.", true);
          return;
        }
        try {
          await setDoc(doc(db, "settings", "business"), {
            contactEmail: email,
            whatsapp,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
          }, { merge: true });
          setAdminMsg("generalAdminMessage", "Ajustes guardados.", false);
        } catch (error) {
          console.error(error);
          setAdminMsg("generalAdminMessage", "No se pudieron guardar ajustes.", true);
        }
      });
    }

    if (adminNavButtons.length && !document.body.dataset.adminNavBound) {
      document.body.dataset.adminNavBound = "1";
      adminNavButtons.forEach((button) => {
        button.addEventListener("click", () => setAdminView(button.dataset.adminNav));
      });
      let initial = "panel";
      try {
        initial = localStorage.getItem(ADMIN_VIEW_KEY) || "panel";
      } catch {}
      setAdminView(initial);
    }

    detailStatus.innerHTML = ADMIN_ORDER_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join("");

    function setDetailMessage(text, isError) {
      if (!detailMessage) return;
      detailMessage.textContent = text;
      detailMessage.style.color = isError ? "#b33128" : "#1b7a57";
    }

    function applyAdminFilters(source) {
      const statusValue = filterStatus.value;
      const clientValue = filterClient.value.trim().toLowerCase();
      const dateValue = filterDate.value;
      const paymentValue = filterPayment.value;

      return source.filter((order) => {
        const status = normalizeAdminStatus(order.status || order.estado);
        const client = String(order.clientName || order.clienteNombre || order.clientEmail || "").toLowerCase();
        const paymentValidated = order.pagoValidado === true;
        const created = order.createdAt?.toDate ? order.createdAt.toDate() : (order.fechaCreacion?.toDate ? order.fechaCreacion.toDate() : null);
        const dateMatch = !dateValue || (created && new Intl.DateTimeFormat("en-CA").format(created) === dateValue);
        const paymentMatch = !paymentValue || (paymentValue === "validated" ? paymentValidated : !paymentValidated);
        return (!statusValue || status === statusValue) && (!clientValue || client.includes(clientValue)) && dateMatch && paymentMatch;
      });
    }

    function showFilteredOrders(statusValue, paymentValue, statusAltValue) {
      setAdminView("pedidos");
      if (filterStatus) {
        filterStatus.value = statusValue || "";
      }
      if (filterPayment) {
        filterPayment.value = paymentValue || "";
      }
      if (filterClient) {
        filterClient.value = "";
      }
      if (filterDate) {
        filterDate.value = "";
      }

      if (statusAltValue) {
        const filtered = adminOrders.filter((order) => {
          const status = normalizeAdminStatus(order.status || order.estado);
          return status === statusValue || status === statusAltValue;
        });
        renderAdminOrders(filtered);
        return;
      }

      renderAdminOrders(applyAdminFilters(adminOrders));
    }

    function renderAdminOrders(orders) {
      const body = document.getElementById("adminOrdersBody");
      const normalized = orders.map((order) => ({ ...order, status: normalizeAdminStatus(order.status || order.estado) }));

      document.getElementById("totalRequests").textContent = String(normalized.filter((o) => o.status === "Pendiente de revision").length);
      document.getElementById("pendingRequests").textContent = String(normalized.filter((o) => o.status === "En proceso" || o.status === "Casi terminado").length);
      document.getElementById("approvedRequests").textContent = String(normalized.filter((o) => o.status === "Terminado").length);
      document.getElementById("rejectedRequests").textContent = String(normalized.filter((o) => o.pagoValidado !== true).length);
      document.getElementById("deliveredRequests").textContent = String(normalized.filter((o) => o.status === "Entregado" || o.status === "Entregado y pagado").length);
      document.getElementById("salesTotal").textContent = formatMXN(normalized.reduce((sum, o) => sum + Number(o.totalEstimado || o.budget || 0), 0));

      if (!normalized.length) {
        body.innerHTML = '<tr><td colspan="7">No hay pedidos registrados.</td></tr>';
        return;
      }

      body.innerHTML = normalized
        .map((order) => {
          const statusClass = getStatusClass(order.status);
          const paymentHtml = order.pagoValidado
            ? '<span class="pay-pill pay-validated">Validado</span>'
            : '<span class="pay-pill pay-pending">Pendiente</span>';
          const dateText = order.createdAt?.toDate
            ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(order.createdAt.toDate())
            : (order.fechaCreacion?.toDate ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(order.fechaCreacion.toDate()) : "-");

          return `<tr data-order-id="${order.id}"><td>${order.clientName || order.clienteNombre || order.clientEmail}</td><td><strong>${order.campaignName}</strong><br>${order.details}<br><small>${dateText}</small></td><td>${order.channel || "-"}</td><td>${formatMXN(order.totalEstimado || order.budget)}</td><td><span class="state ${statusClass}">${order.status}</span></td><td>${paymentHtml}</td><td><div class="row-actions"><button class="btn-ok" data-action="view" data-id="${order.id}">Ver detalle</button><button class="btn-del" data-action="delete" data-id="${order.id}">Eliminar</button></div></td></tr>`;
        })
        .join("");
    }

    async function openOrderDetail(order) {
      selectedOrder = order;
      const itemsQuery = query(collection(db, ORDER_ITEMS_COLLECTION), where("orderId", "==", order.id));
      const itemsSnapshot = await getDocs(itemsQuery);
      const items = itemsSnapshot.docs.map((docItem) => docItem.data());
      const itemHtml = items.length
        ? items.map((item) => `<li>${item.productoNombre} x${item.cantidad} - ${formatMXN(item.costoEstimado)}</li>`).join("")
        : "<li>Sin items detallados</li>";
      const history = Array.isArray(order.historialEstados) ? order.historialEstados : [];
      const historyHtml = history.length
        ? history.map((h) => `<li>${h.estado} - ${h.nota || "sin nota"}</li>`).join("")
        : "<li>Sin historial</li>";

      detailBody.innerHTML = `<div class="order-meta"><strong>Cliente:</strong> ${order.clientName || order.clienteNombre || order.clientEmail}</div><div class="order-meta"><strong>Metodo pago:</strong> ${order.metodoPago || "-"}</div><div class="order-meta"><strong>Total estimado:</strong> ${formatMXN(order.totalEstimado || order.budget)}</div><div class="order-meta"><strong>Descripcion:</strong> ${order.details || "-"}</div><div class="order-meta"><strong>Fecha creacion:</strong> ${order.createdAt?.toDate ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(order.createdAt.toDate()) : "-"}</div><div class="order-meta"><strong>Fecha envio:</strong> ${order.fechaEnvio?.toDate ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(order.fechaEnvio.toDate()) : "-"}</div><div class="order-meta"><strong>Items:</strong><ul>${itemHtml}</ul></div><div class="order-meta"><strong>Historial:</strong><ul>${historyHtml}</ul></div>`;

      detailStatus.value = normalizeAdminStatus(order.status || order.estado);
      detailPayment.value = order.pagoValidado ? "validated" : "pending";
      detailNote.value = order.adminNotas || "";
      detailCard.hidden = false;
      setDetailMessage("", false);
    }

    const renderAdminNotifications = (orders) => {
      if (!adminNotificationsBody) return;
      const pending = orders.filter(o => o.status === "Pendiente de revision");
      if (!pending.length) {
        adminNotificationsBody.innerHTML = renderEmptyState("No hay notificaciones nuevas.");
        return;
      }
      adminNotificationsBody.innerHTML = pending.map(o => `
        <div class="order-card">
          <strong>Nuevo Pedido:</strong> ${o.campaignName || "Pedido"}
          <p>Cliente: ${o.clientName || o.clientEmail}</p>
        </div>
      `).join("");
    };

    if (!tableBody.dataset.observing) {
      tableBody.dataset.observing = "1";
      stopOrdersObserver = observeAllOrders(
        (orders) => {
          adminOrders = orders;
          renderAdminOrders(applyAdminFilters(adminOrders));
          renderAdminOrdersForDeletion(orders);
          renderAdminNotifications(orders);
        },
        (error) => {
          setMessage("adminMessage", "No se pudieron cargar pedidos.", true);
          console.error(error);
        }
      );
      window.addEventListener("beforeunload", () => {
        if (stopOrdersObserver) stopOrdersObserver();
      }, { once: true });
    }

    // Ajustes: observers para productos / promos / usuarios
    if (!document.body.dataset.adminSettingsObserving) {
      document.body.dataset.adminSettingsObserving = "1";
      stopProductsObserver = observeProducts(
        (products) => {
          adminProducts = products;
          renderAdminProducts(products);
        },
        (error) => console.error(error)
      );
      stopOffersObserver = observeOffers(
        (offers) => {
          adminOffers = offers;
          renderAdminOffers(offers);
        },
        (error) => console.error(error)
      );
      stopUsersObserver = observeUsers(
        (users) => {
          adminUsers = users;
          renderAdminUsers(users, usersSearch?.value || "");
        },
        (error) => console.error(error)
      );

      window.addEventListener("beforeunload", () => {
        if (stopProductsObserver) stopProductsObserver();
        if (stopOffersObserver) stopOffersObserver();
        if (stopUsersObserver) stopUsersObserver();
      }, { once: true });
    }

    if (!tableBody.dataset.bound) {
      tableBody.dataset.bound = "1";
      tableBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        const row = event.target.closest("tr[data-order-id]");
        const id = button?.dataset.id || row?.dataset.orderId;
        if (!id) return;
        const order = adminOrders.find((item) => item.id === id);
        if (!order) return;

        try {
          if (!button && row) {
            await openOrderDetail({ ...order, status: normalizeAdminStatus(order.status || order.estado) });
            return;
          }
          const action = button.dataset.action;
          if (action === "view") {
            await openOrderDetail({ ...order, status: normalizeAdminStatus(order.status || order.estado) });
            return;
          }
          if (action === "delete") await deleteDoc(doc(db, ORDERS_COLLECTION, id));
          setMessage("adminMessage", "Accion aplicada correctamente.", false);
        } catch (error) {
          setMessage("adminMessage", "No se pudo aplicar la accion.", true);
          console.error(error);
        }
      });
    }

    if (summaryCards.length && !document.body.dataset.summaryCardsBound) {
      document.body.dataset.summaryCardsBound = "1";
      summaryCards.forEach((card) => {
        const openSummary = () => {
          const statusValue = card.dataset.summaryFilter || "";
          const paymentValue = card.dataset.summaryPayment || "";
          const statusAltValue = card.dataset.summaryFilterAlt || "";
          showFilteredOrders(statusValue, paymentValue, statusAltValue);
        };
        card.addEventListener("click", openSummary);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openSummary();
          }
        });
      });
    }

    if (!filterStatus.dataset.bound) {
      filterStatus.dataset.bound = "1";
      const rerender = () => renderAdminOrders(applyAdminFilters(adminOrders));
      filterStatus.addEventListener("change", rerender);
      filterClient.addEventListener("input", rerender);
      filterDate.addEventListener("change", rerender);
      filterPayment.addEventListener("change", rerender);
    }

    if (!detailSave.dataset.bound) {
      detailSave.dataset.bound = "1";
      detailSave.addEventListener("click", async () => {
        if (!selectedOrder) return;
        const newStatus = detailStatus.value;
        const paymentValidated = detailPayment.value === "validated";
        const note = detailNote.value.trim();

        try {
          await updateDoc(doc(db, ORDERS_COLLECTION, selectedOrder.id), {
            status: newStatus,
            estado: newStatus,
            pagoValidado: paymentValidated,
            adminNotas: note,
            pagoNota: note,
            pagoValidadoEn: paymentValidated ? serverTimestamp() : null,
            actualizadoEn: serverTimestamp(),
            actualizadoPor: user.uid,
            historialEstados: arrayUnion({
              estado: newStatus,
              fecha: new Date(),
              actualizadoPor: user.uid,
              nota: note || "Actualizacion de estado"
            })
          });
          setDetailMessage("Cambios guardados correctamente.", false);
        } catch (error) {
          setDetailMessage("No se pudieron guardar los cambios.", true);
          console.error(error);
        }
      });
    }

    if (!detailClose.dataset.bound) {
      detailClose.dataset.bound = "1";
      detailClose.addEventListener("click", () => {
        detailCard.hidden = true;
        selectedOrder = null;
      });
    }

    if (!createBtn.dataset.bound) {
      createBtn.dataset.bound = "1";
      createBtn.addEventListener("click", async () => {
        const email = document.getElementById("newUserEmail").value.trim().toLowerCase();
        const name = document.getElementById("newUserDisplayName").value.trim();
        const phoneRaw = (document.getElementById("newUserPhone")?.value || "").trim();
        const phone = phoneRaw.replace(/[^0-9+]/g, "");
        const password = document.getElementById("newUserPassword").value.trim();
        const role = document.getElementById("newUserRole").value;

        if (!email || !password || !role || !name) {
          setMessage("adminUserMessage", "Completa correo, nombre, celular, contrasena y rol.", true);
          return;
        }
        if (role === "cliente" && (!phone || phone.length < 10)) {
          setMessage("adminUserMessage", "Ingresa un celular valido (minimo 10 digitos).", true);
          return;
        }

        try {
          await createUserByAdmin(email, password, role, phone, name);
          document.getElementById("newUserEmail").value = "";
          document.getElementById("newUserDisplayName").value = "";
          const phoneEl = document.getElementById("newUserPhone");
          if (phoneEl) phoneEl.value = "";
          document.getElementById("newUserPassword").value = "";
          document.getElementById("newUserRole").value = "cliente";
          setMessage("adminUserMessage", "Usuario creado y rol asignado.", false);
        } catch (error) {
          setMessage("adminUserMessage", "No se pudo crear el usuario.", true);
          console.error(error);
        }
      });
    }

    if (!logoutAdmin.dataset.bound) {
      logoutAdmin.dataset.bound = "1";
      logoutAdmin.addEventListener("click", async () => {
        try {
          await signOut(auth);
        } catch (error) {
          console.error(error);
        } finally {
          goTo("login.html");
        }
      });
    }

    if (logoutAdminSettings && !logoutAdminSettings.dataset.bound) {
      logoutAdminSettings.dataset.bound = "1";
      logoutAdminSettings.addEventListener("click", async () => {
        try {
          await signOut(auth);
        } catch (error) {
          console.error(error);
        } finally {
          goTo("login.html");
        }
      });
    }
  });
}

if (page === "login.html") setupLoginPage();
if (page === "cliente.html") setupClientPage();
if (page === "admin.html") setupAdminPage();
registerServiceWorker();
