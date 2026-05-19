const API = "/api/admin";

const loginScreen = document.getElementById("loginScreen");
const adminApp = document.getElementById("adminApp");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const adminUserEl = document.getElementById("adminUser");
const pageTitle = document.getElementById("pageTitle");
const addBtn = document.getElementById("addBtn");
const modal = document.getElementById("modal");
const modalForm = document.getElementById("modalForm");
const modalTitle = document.getElementById("modalTitle");
const imagePreview = document.getElementById("imagePreview");
const toast = document.getElementById("toast");

let currentTab = "dashboard";
let collectionsCache = [];
let editingId = null;

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function checkSession() {
  try {
    const { username } = await api("/me");
    showAdmin(username);
    return true;
  } catch {
    showLogin();
    return false;
  }
}

function showLogin() {
  loginScreen.hidden = false;
  adminApp.hidden = true;
  loginScreen.setAttribute("aria-hidden", "false");
  adminApp.setAttribute("aria-hidden", "true");
}

function showAdmin(username) {
  loginScreen.hidden = true;
  adminApp.hidden = false;
  loginScreen.setAttribute("aria-hidden", "true");
  adminApp.setAttribute("aria-hidden", "false");
  adminUserEl.textContent = username;
  addBtn.hidden = currentTab === "dashboard" || currentTab === "subscribers";
  loadTab();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const fd = new FormData(loginForm);
  try {
    const { username } = await api("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: fd.get("username"),
        password: fd.get("password"),
      }),
    });
    showAdmin(username);
    showToast("Welcome back!");
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await api("/logout", { method: "POST" });
  showLogin();
});

// Tabs
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = true));
    document.getElementById(`tab-${currentTab}`).hidden = false;
    const titles = {
      dashboard: "Dashboard",
      collections: "Collections",
      products: "Shop items",
      subscribers: "Newsletter",
    };
    pageTitle.textContent = titles[currentTab] || "Admin";
    addBtn.hidden = currentTab === "subscribers" || currentTab === "dashboard";
    addBtn.textContent =
      currentTab === "products" ? "+ Add shop item" : "+ Add collection";
    loadTab();
  });
});

function loadTab() {
  if (currentTab === "dashboard") return;
  if (currentTab === "collections") loadCollections();
  else if (currentTab === "products") loadProducts();
  else loadSubscribers();
}

function switchTab(tab) {
  const btn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (btn) btn.click();
}

document.getElementById("dashAddItem")?.addEventListener("click", () => {
  switchTab("products");
  openModal("product", null);
});

document.getElementById("dashAddCollection")?.addEventListener("click", () => {
  switchTab("collections");
  openModal("collection", null);
});

async function loadCollections() {
  const list = document.getElementById("collectionsList");
  try {
    collectionsCache = await api("/collections");
    if (!collectionsCache.length) {
      list.innerHTML = '<p class="empty-state">No collections yet. Add your first one!</p>';
      return;
    }
    list.innerHTML = collectionsCache
      .map(
        (c) => `
      <article class="data-card" data-id="${c.id}">
        <img src="${c.image_url}" alt="${escapeHtml(c.title)}" />
        <div>
          <h4>${escapeHtml(c.title)}</h4>
          <p>${escapeHtml(c.description)}</p>
          <span class="meta-tag">${c.layout}</span>
          <span class="meta-tag">order: ${c.sort_order}</span>
        </div>
        <div class="data-card-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-collection="${c.id}">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-delete-collection="${c.id}">Delete</button>
        </div>
      </article>`
      )
      .join("");
    bindCollectionActions();
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

async function loadProducts() {
  const list = document.getElementById("productsList");
  try {
    const products = await api("/products");
    if (!products.length) {
      list.innerHTML =
        '<p class="empty-state">No shop items yet. Click <strong>+ Add shop item</strong> to add your first product.</p>';
      return;
    }
    list.innerHTML = products
      .map(
        (p) => `
      <article class="data-card">
        <img src="${p.image_url}" alt="${escapeHtml(p.name)}" />
        <div>
          <h4>${escapeHtml(p.name)}</h4>
          <p>${escapeHtml(p.meta)} · $${p.price}</p>
          ${p.badge ? `<span class="meta-tag">${p.badge}</span>` : ""}
        </div>
        <div class="data-card-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-edit-product="${p.id}">Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-delete-product="${p.id}">Delete</button>
        </div>
      </article>`
      )
      .join("");
    bindProductActions();
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

async function loadSubscribers() {
  const list = document.getElementById("subscribersList");
  try {
    const subs = await api("/subscribers");
    if (!subs.length) {
      list.innerHTML = '<p class="empty-state">No subscribers yet.</p>';
      return;
    }
    list.innerHTML = subs
      .map(
        (s) => `
      <article class="data-card">
        <div><h4>${escapeHtml(s.email)}</h4><p>Joined ${new Date(s.created_at).toLocaleDateString()}</p></div>
      </article>`
      )
      .join("");
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function bindCollectionActions() {
  document.querySelectorAll("[data-edit-collection]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = collectionsCache.find((x) => x.id === Number(btn.dataset.editCollection));
      if (c) openModal("collection", c);
    });
  });
  document.querySelectorAll("[data-delete-collection]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this collection?")) return;
      await api(`/collections/${btn.dataset.deleteCollection}`, { method: "DELETE" });
      showToast("Collection deleted");
      loadCollections();
    });
  });
}

function bindProductActions() {
  document.querySelectorAll("[data-edit-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const products = await api("/products");
      const p = products.find((x) => x.id === Number(btn.dataset.editProduct));
      if (p) openModal("product", p);
    });
  });
  document.querySelectorAll("[data-delete-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this product?")) return;
      await api(`/products/${btn.dataset.deleteProduct}`, { method: "DELETE" });
      showToast("Product deleted");
      loadProducts();
    });
  });
}

addBtn.addEventListener("click", () => {
  openModal(currentTab === "products" ? "product" : "collection", null);
});

function setFieldVisibility(type) {
  const isProduct = type === "product";
  document.querySelectorAll("[data-field]").forEach((el) => {
    const field = el.dataset.field;
    const productOnly = ["name", "meta", "price", "badge", "collection_id"];
    const collectionOnly = ["title", "description", "layout", "sort_order"];
    if (productOnly.includes(field)) el.hidden = !isProduct;
    else if (collectionOnly.includes(field)) el.hidden = isProduct;
    else if (field === "layout-order") el.hidden = isProduct;
    else if (field === "price-badge") el.hidden = !isProduct;
  });
}

async function openModal(type, item) {
  editingId = item?.id ?? null;
  modalForm.reset();
  modalForm.querySelector('[name="type"]').value = type;
  modal.hidden = false;
  setFieldVisibility(type);

  if (type === "product") {
    modalTitle.textContent = item ? "Edit shop item" : "Add shop item";
    modalForm.name.required = true;
    modalForm.title.required = false;
    await fillCollectionSelect();
    if (item) {
      modalForm.name.value = item.name;
      modalForm.meta.value = item.meta;
      modalForm.price.value = item.price;
      modalForm.badge.value = item.badge || "";
      modalForm.collection_id.value = item.collection_id || "";
      showPreview(item.image_url);
    }
  } else {
    modalTitle.textContent = item ? "Edit collection" : "Add collection";
    modalForm.title.required = true;
    modalForm.name.required = false;
    if (item) {
      modalForm.title.value = item.title;
      modalForm.description.value = item.description;
      modalForm.layout.value = item.layout;
      modalForm.sort_order.value = item.sort_order;
      showPreview(item.image_url);
    }
  }
}

async function fillCollectionSelect() {
  const select = modalForm.collection_id;
  collectionsCache = await api("/collections");
  select.innerHTML =
    '<option value="">— None —</option>' +
    collectionsCache
      .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
      .join("");
}

function showPreview(url) {
  if (!url) {
    imagePreview.hidden = true;
    return;
  }
  imagePreview.hidden = false;
  imagePreview.querySelector("img").src = url;
}

modalForm.image?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) showPreview(URL.createObjectURL(file));
});

modalForm.image_url?.addEventListener("input", (e) => {
  if (e.target.value) showPreview(e.target.value);
});

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => {
    modal.hidden = true;
    editingId = null;
  });
});

modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const type = modalForm.type.value;
  const fd = new FormData(modalForm);

  if (type === "collection") {
    if (!editingId && !fd.get("image")?.size && !fd.get("image_url")) {
      showToast("Please upload an image or paste a URL");
      return;
    }
    const path = editingId ? `/collections/${editingId}` : "/collections";
    const method = editingId ? "PUT" : "POST";
    try {
      await api(path, { method, body: fd });
      showToast(
        editingId
          ? "Collection updated — refresh the store to see changes"
          : "Collection added — it now appears on your store homepage"
      );
      modal.hidden = true;
      loadCollections();
    } catch (err) {
      showToast(err.message);
    }
  } else {
    if (!editingId && !fd.get("image")?.size && !fd.get("image_url")) {
      showToast("Please upload an image or paste a URL");
      return;
    }
    const path = editingId ? `/products/${editingId}` : "/products";
    const method = editingId ? "PUT" : "POST";
    try {
      await api(path, { method, body: fd });
      showToast(
        editingId
          ? "Item updated — refresh the store to see changes"
          : "Item added — it now appears on your store homepage"
      );
      modal.hidden = true;
      loadProducts();
    } catch (err) {
      showToast(err.message);
    }
  }
});

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

checkSession();
