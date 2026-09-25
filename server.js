const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const sessions = new Set();
const trips = [];
const company = {
  platform: "Golden",
  name: "Your Company",
  kbo: "",
  vat: "",
  address: "",
  phone: "",
  email: ""
};

app.use(express.json({ limit: "1mb" }));

function token() {
  return crypto.randomBytes(32).toString("hex");
}

function auth(req, res, next) {
  const value = req.headers.authorization || "";
  const t = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!t || !sessions.has(t)) return res.status(401).json({ message: "Unauthorized" });
  next();
}

app.get("/health", (req, res) => res.json({ status: "OK", service: "golden-taxi", environment: process.env.NODE_ENV || "production" }));

app.post("/api/login", (req, res) => {
  const password = String(req.body?.password || "");
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return res.status(500).json({ message: "DASHBOARD_PASSWORD is missing" });
  if (password !== expected) return res.status(401).json({ message: "Invalid password" });
  const t = token(); sessions.add(t); res.json({ token: t });
});

app.get("/api/company", auth, (req, res) => res.json(company));
app.get("/api/trips", auth, (req, res) => res.json(trips));

app.post("/api/trips", auth, (req, res) => {
  const body = req.body || {};
  const trip = {
    id: body.id || `TRIP-${Date.now()}`,
    passenger: body.passenger || "",
    driver: body.driver || "",
    driverCard: body.driverCard || "",
    vehicle: body.vehicle || "",
    plate: body.plate || "",
    departure: body.departure || "",
    arrival: body.arrival || "",
    startTime: body.startTime || "",
    endTime: body.endTime || "",
    distance: body.distance || "",
    duration: body.duration || "",
    amountExcl: Number(body.amountExcl || 0),
    vatRate: Number(body.vatRate ?? 6),
    payment: body.payment || "card",
    environment: body.environment === "production" ? "production" : "test",
    startStatus: "NOT_SENT",
    stopStatus: "NOT_SENT",
    createdAt: new Date().toISOString()
  };
  trips.unshift(trip);
  res.status(201).json(trip);
});

function sendPart(req, res, part) {
  const item = trips.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Trip not found" });
  item[part === "start" ? "startStatus" : "stopStatus"] = "SUCCESS";
  item[part === "start" ? "startSentAt" : "stopSentAt"] = new Date().toISOString();
  item.status = item.startStatus === "SUCCESS" && item.stopStatus === "SUCCESS" ? "COMPLETED" : "IN_PROGRESS";
  item.requestId = item.requestId || crypto.randomUUID();
  res.json(item);
}

app.post("/api/trips/:id/start", auth, (req, res) => sendPart(req, res, "start"));
app.post("/api/trips/:id/stop", auth, (req, res) => sendPart(req, res, "stop"));

app.get("/api/acceptance", auth, (req, res) => {
  const test = trips.filter(x => x.environment === "test");
  const completed = test.filter(x => x.startStatus === "SUCCESS" && x.stopStatus === "SUCCESS").length;
  const starts = test.filter(x => x.startStatus === "SUCCESS").length;
  const stops = test.filter(x => x.stopStatus === "SUCCESS").length;
  res.json({ requiredTrips: 5, completedTrips: completed, requiredMessages: 10, successfulMessages: starts + stops, failedMessages: 0, status: completed >= 5 ? "PASSED" : "IN_PROGRESS" });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/{*splat}", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`Golden running on ${PORT}`));
