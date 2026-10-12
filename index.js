const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));


const MONGO_URI = "mongodb+srv://dimasryanjr_db_user:dimasugesti@cluster0.yyngy7.mongodb.net/trafficguard?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Berhasil terhubung ke MongoDB (TrafficGuard DB)'))
    .catch(err => console.error('❌ Gagal connect ke MongoDB:', err));


const trafficSchema = new mongoose.Schema({
    vehicleId: Number,
    colors: [String], // Array warna, cth: ['Hitam', 'Putih']
    plateNumber: String,
    timestamp: { type: Date, default: Date.now }
});

const TrafficLog = mongoose.model('TrafficLog', trafficSchema);


app.post('/api/save-log', async (req, res) => {
    try {
        const { vehicleId, colors, plateNumber } = req.body;
        
        const newLog = new TrafficLog({
            vehicleId: vehicleId,
            colors: colors,
            plateNumber: plateNumber
        });

        await newLog.save();
        console.log(`📝 Data Disimpan: Pelat [${plateNumber}] - Warna [${colors}]`);
        
        res.status(201).json({ message: 'Success', data: newLog });
    } catch (error) {
        console.error('Error saving data:', error);
        res.status(500).json({ error: 'Gagal menyimpan ke database' });
    }
});

// Jalankan server
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});