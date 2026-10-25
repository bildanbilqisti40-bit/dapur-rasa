const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");

const app = express();
const PORT = process.env.PORT || 10000;
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || "";
const MIDTRANS_ENV = (process.env.MIDTRANS_ENV || "sandbox").toLowerCase();
const MIDTRANS_BASE_URL = MIDTRANS_ENV === "production"
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

// Product prices are authoritative on the server; never trust totals sent by the browser.
const PRODUCTS = {
  1: { name: "Nasi Ayam Sambal", price: 22000 },
  2: { name: "Mie Pedas Spesial", price: 18000 },
  3: { name: "Rice Bowl Beef", price: 28000 },
  4: { name: "Kentang Goreng", price: 14000 },
  5: { name: "Roti Panggang", price: 16000 },
  6: { name: "Es Kopi Susu", price: 18000 },
  7: { name: "Lemon Tea", price: 12000 },
  8: { name: "Jus Alpukat", price: 17000 }
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    paymentConfigured: Boolean(MIDTRANS_SERVER_KEY),
    environment: MIDTRANS_ENV
  });
});

app.post("/api/create-transaction", async (req, res) => {
  try {
    if (!MIDTRANS_SERVER_KEY) {
      return res.status(503).json({
        error: "Pembayaran belum dikonfigurasi. Pemilik toko perlu mengisi MIDTRANS_SERVER_KEY di environment server."
      });
    }
    const customer = req.body?.customer || {};
    const items = req.body?.items;
    if (!customer.name || !customer.phone || !customer.address) {
      return res.status(400).json({ error: "Nama, nomor telepon, dan alamat wajib diisi." });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      return res.status(400).json({ error: "Daftar produk tidak valid." });
    }

    const itemDetails = [];
    let grossAmount = 0;
    for (const row of items) {
      const id = Number(row.id);
      const qty = Number(row.quantity);
      const product = PRODUCTS[id];
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 99) {
        return res.status(400).json({ error: "Ada produk atau jumlah yang tidak valid." });
      }
      itemDetails.push({
        id: String(id),
        price: product.price,
        quantity: qty,
        name: product.name.slice(0, 50)
      });
      grossAmount += product.price * qty;
    }
    if (!Number.isSafeInteger(grossAmount) || grossAmount < 1) {
      return res.status(400).json({ error: "Total pesanan tidak valid." });
    }

    const orderId = `DR-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const payload = {
      transaction_details: { order_id: orderId, gross_amount: grossAmount },
      item_details: itemDetails,
      customer_details: {
        first_name: String(customer.name).slice(0, 50),
        phone: String(customer.phone).slice(0, 20),
        billing_address: { address: String(customer.address).slice(0, 200) },
        shipping_address: { address: String(customer.address).slice(0, 200) }
      },
      custom_field1: "Dapur Rasa"
    };

    const midtransResponse = await fetch(`${MIDTRANS_BASE_URL}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Basic ${Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64")}`
      },
      body: JSON.stringify(payload)
    });
    const result = await midtransResponse.json().catch(() => ({}));
    if (!midtransResponse.ok || !result.redirect_url) {
      console.error("Midtrans transaction creation failed:", midtransResponse.status, result.error_messages || result.status_message || "Unknown error");
      return res.status(502).json({ error: "Midtrans gagal membuat sesi pembayaran. Periksa kredensial dan konfigurasi Sandbox." });
    }

    // TODO for production: save orderId, customer, items, amount and payment status in a database.
    // Do not rely on the browser redirect as proof of payment; verify status via notification/status API.
    console.log(`Created payment session ${orderId} amount=${grossAmount} environment=${MIDTRANS_ENV}`);
    return res.json({ order_id: orderId, redirect_url: result.redirect_url });
  } catch (err) {
    console.error("Create transaction error:", err.message);
    return res.status(500).json({ error: "Terjadi kesalahan server saat menyiapkan pembayaran." });
  }
});

// Configure this URL as the Midtrans Payment Notification URL.
// Signature formula documented by Midtrans: SHA512(order_id + status_code + gross_amount + ServerKey).
app.post("/api/midtrans-notification", async (req, res) => {
  try {
    if (!MIDTRANS_SERVER_KEY) return res.status(503).send("Payment not configured");
    const n = req.body || {};
    const required = ["order_id", "status_code", "gross_amount", "signature_key"];
    if (!required.every(k => typeof n[k] === "string" || typeof n[k] === "number")) {
      return res.status(400).send("Invalid notification");
    }
    const raw = `${n.order_id}${n.status_code}${n.gross_amount}${MIDTRANS_SERVER_KEY}`;
    const expected = crypto.createHash("sha512").update(raw).digest("hex");
    const received = String(n.signature_key);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).send("Invalid signature");
    }

    // TODO for production: retrieve transaction status from Midtrans and update the matching order in a database.
    // Never mark an order paid from a frontend redirect alone.
    console.log("Verified Midtrans notification:", {
      order_id: n.order_id,
      transaction_status: n.transaction_status,
      fraud_status: n.fraud_status || null
    });
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Notification error:", err.message);
    return res.status(500).send("Notification processing failed");
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dapur Rasa running on port ${PORT}; Midtrans environment=${MIDTRANS_ENV}`);
});
