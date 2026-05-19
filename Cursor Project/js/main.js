// Use Node server API (port 3000) when viewing static files on another port
const API_BASE =
  window.location.port && window.location.port !== "3000"
    ? "http://localhost:3000"
    : "";

const header = document.getElementById("header");
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
const toast = document.getElementById("toast");
const newsletterForm = document.getElementById("newsletterForm");
const collectionGrid = document.getElementById("collectionGrid");
const productGrid = document.getElementById("productGrid");

// Sticky header on scroll
window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 40);
});

// Mobile nav
navToggle.addEventListener("click", () => {
  navToggle.classList.toggle("active");
  navLinks.classList.toggle("open");
  document.body.style.overflow = navLinks.classList.contains("open") ? "hidden" : "";
});

navLinks.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navToggle.classList.remove("active");
    navLinks.classList.remove("open");
    document.body.style.overflow = "";
  });
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function bindQuickAdd() {
  document.querySelectorAll(".quick-add").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const card = btn.closest(".product-card");
      const name = card?.querySelector("h3")?.textContent ?? "Item";
      showToast(`${name} added to cart`);
    });
  });
}

function initScrollReveal() {
  const revealTargets = document.querySelectorAll(
    ".section-head, .collection-card, .product-card, .about-grid > *"
  );
  revealTargets.forEach((el) => el.classList.add("reveal"));
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  revealTargets.forEach((el) => observer.observe(el));
}

async function loadCollections() {
  try {
    const res = await fetch(`${API_BASE}/api/collections`);
    const collections = await res.json();
    if (!collections.length) {
      collectionGrid.innerHTML = '<p class="empty-msg">No collections yet.</p>';
      return;
    }
    collectionGrid.innerHTML = collections
      .map(
        (c) => `
      <article class="collection-card${c.layout === "large" ? " collection-card--large" : ""} reveal">
        <img src="${c.image_url}" alt="${escapeHtml(c.title)}" loading="lazy" />
        <div class="collection-card__overlay">
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(c.description)}</p>
          <a href="#shop" class="link-arrow">Explore</a>
        </div>
      </article>`
      )
      .join("");
    initScrollReveal();
  } catch {
    collectionGrid.innerHTML = `<p class="empty-msg">Could not load collections. Run <code>./start.sh</code> and open <a href="http://localhost:3000">localhost:3000</a></p>`;
  }
}

async function loadProducts() {
  try {
    const res = await fetch(`${API_BASE}/api/products`);
    const products = await res.json();
    if (!products.length) {
      productGrid.innerHTML = '<p class="empty-msg">No products yet.</p>';
      return;
    }
    productGrid.innerHTML = products
      .map((p) => {
        const badge =
          p.badge === "new"
            ? '<span class="badge">New</span>'
            : p.badge === "hot"
              ? '<span class="badge badge--hot">Hot</span>'
              : "";
        return `
      <article class="product-card reveal">
        <div class="product-card__img">
          <img src="${p.image_url}" alt="${escapeHtml(p.name)}" loading="lazy" />
          ${badge}
          <button class="quick-add" aria-label="Add to cart">+</button>
        </div>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="product-meta">${escapeHtml(p.meta)}</p>
        <p class="price">$${Number(p.price).toFixed(0)}</p>
      </article>`;
      })
      .join("");
    bindQuickAdd();
    initScrollReveal();
  } catch {
    productGrid.innerHTML = `<p class="empty-msg">Could not load products. Run <code>./start.sh</code> and open <a href="http://localhost:3000">localhost:3000</a></p>`;
  }
}

newsletterForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = e.target.querySelector("input");
  const email = input.value.trim();
  try {
    const res = await fetch(`${API_BASE}/api/newsletter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`Welcome to the house, ${email.split("@")[0]}!`);
    e.target.reset();
  } catch (err) {
    showToast(err.message || "Could not subscribe");
  }
});

loadCollections();
loadProducts();
