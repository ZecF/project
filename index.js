const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/db_deteksi_citra";

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Koneksi ke MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Terhubung ke MongoDB:", MONGO_URI))
  .catch((err) => console.error("⚠️ Gagal terhubung ke MongoDB (Pastikan layanan MongoDB aktif):", err.message));

// Schema & Model MongoDB untuk Log Deteksi Video
const DetectionLogSchema = new mongoose.Schema({
  namaVideo: { type: String, default: "Video Upload" },
  resolusi: { type: String, required: true },
  waktuTerdeteksi: {
    type: String,
    enum: ["Pagi", "Siang", "Sore", "Malam"],
    required: true
  },
  jumlahKendaraan: { type: Number, required: true, default: 0 },
  detailKendaraan: { type: String, default: "-" },
  nomorPlat: { type: String, default: "Belum Terbaca" },
  jumlahPenumpangKereta: { type: Number, required: true, default: 0 },
  metrikCitra: {
    meanLuminanceY: Number,
    meanInPhaseI: Number,
    meanSaturationS: Number,
    meanValueV: Number,
    thresholdBinary: Number
  },
  snapshotBase64: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const DetectionLog = mongoose.model("DetectionLog", DetectionLogSchema);

// Endpoint: Ambil semua riwayat deteksi dari MongoDB
app.get("/api/detections", async (req, res) => {
  try {
    const logs = await DetectionLog.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint: Simpan hasil deteksi frame video ke MongoDB
app.post("/api/detections", async (req, res) => {
  try {
    const newLog = new DetectionLog(req.body);
    const saved = await newLog.save();
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Endpoint: Hapus log deteksi berdasarkan ID
app.delete("/api/detections/:id", async (req, res) => {
  try {
    await DetectionLog.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Data berhasil dihapus" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
