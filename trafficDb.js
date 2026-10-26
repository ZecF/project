/**
 * trafficDb.js — MongoDB Atlas Driver for TrafficGuard
 * Connects to MongoDB Atlas cluster and manages `trafficlogs` collection
 */

const { MongoClient, ObjectId } = require('mongodb');

// Primary SRV URI and Direct ReplicaSet fallback URI (supports Heroku env vars)
const PRIMARY_URI = process.env.MONGODB_URI || 'mongodb+srv://dimasryanjr_db_user:dimasugesti@cluster0.yyngy7.mongodb.net/trafficguard?appName=Cluster0';
const FALLBACK_URI = process.env.MONGODB_FALLBACK_URI || 'mongodb://dimasryanjr_db_user:dimasugesti@cluster0-shard-00-00.yyngy7.mongodb.net:27017,cluster0-shard-00-01.yyngy7.mongodb.net:27017,cluster0-shard-00-02.yyngy7.mongodb.net:27017/trafficguard?ssl=true&replicaSet=atlas-jsj5o5-shard-0&authSource=admin&appName=Cluster0';

const DB_NAME = 'trafficguard';
const COLLECTION_NAME = 'trafficlogs';

let clientInstance = null;
let dbInstance = null;
let connectionStatus = {
  connected: false,
  error: null,
  activeUri: null,
  lastPing: null
};

/**
 * Connect to MongoDB with automatic fallback
 */
async function connectToMongo() {
  if (clientInstance && dbInstance && connectionStatus.connected) {
    return { client: clientInstance, db: dbInstance };
  }

  // Attempt 1: Primary SRV URI
  try {
    console.log('[TrafficGuard DB] Connecting via primary SRV URI...');
    const client = new MongoClient(PRIMARY_URI, {
      serverSelectionTimeoutMS: 4000,
      connectTimeoutMS: 4000
    });
    await client.connect();
    clientInstance = client;
    dbInstance = client.db(DB_NAME);
    connectionStatus = {
      connected: true,
      error: null,
      activeUri: 'SRV (Cluster0)',
      lastPing: new Date()
    };
    console.log('[TrafficGuard DB] Connected successfully via SRV URI');
    return { client: clientInstance, db: dbInstance };
  } catch (srvErr) {
    console.warn('[TrafficGuard DB] SRV connection failed, attempting direct ReplicaSet fallback:', srvErr.message);

    // Attempt 2: Direct ReplicaSet URI
    try {
      const clientFallback = new MongoClient(FALLBACK_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
      await clientFallback.connect();
      clientInstance = clientFallback;
      dbInstance = clientFallback.db(DB_NAME);
      connectionStatus = {
        connected: true,
        error: null,
        activeUri: 'ReplicaSet (cluster0-shard)',
        lastPing: new Date()
      };
      console.log('[TrafficGuard DB] Connected successfully via ReplicaSet Fallback');
      return { client: clientInstance, db: dbInstance };
    } catch (fallbackErr) {
      connectionStatus = {
        connected: false,
        error: fallbackErr.message,
        activeUri: null,
        lastPing: new Date()
      };
      console.error('[TrafficGuard DB] All connection attempts failed:', fallbackErr.message);
      throw fallbackErr;
    }
  }
}

/**
 * Get Collection handle
 */
async function getLogsCollection() {
  const { db } = await connectToMongo();
  return db.collection(COLLECTION_NAME);
}

/**
 * Save a single traffic detection log
 * Schema matches user's existing MongoDB Atlas collection
 */
async function saveTrafficLog(data) {
  const coll = await getLogsCollection();

  // Normalize document to match schema
  const doc = {
    vehicleId: Number(data.vehicleId) || Date.now() % 100000,
    vehicleType: data.vehicleType || 'Mobil', // Mobil | Motor | Bus | Truk | Kereta
    passengerCount: Number(data.passengerCount) >= 0 ? Number(data.passengerCount) : 0,
    colors: Array.isArray(data.colors) ? data.colors : (data.colors ? [data.colors] : ['Hitam']),
    plateNumber: data.plateNumber ? String(data.plateNumber).toUpperCase().trim() : 'N/A',
    plateConfidence: typeof data.plateConfidence === 'number' ? data.plateConfidence : 0.85,
    timeOfDay: data.timeOfDay || 'Siang', // Siang | Sore | Malam | Pagi
    imageMetrics: {
      resolution: data.imageMetrics?.resolution || '640x360',
      meanGrayscale: Number(data.imageMetrics?.meanGrayscale) || 120,
      hsvValue: Number(data.imageMetrics?.hsvValue) || 50,
      yiqWarmth: Number(data.imageMetrics?.yiqWarmth) || 0.005,
      binaryThreshold: Number(data.imageMetrics?.binaryThreshold) || 125,
      preprocessMode: data.imageMetrics?.preprocessMode || 'Grayscale + Binary (M3)'
    },
    mediaType: data.mediaType || 'photo', // photo | video | webcam
    mediaFilename: data.mediaFilename || null,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.90,
    boundingBox: data.boundingBox || null,
    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    __v: 0
  };

  const result = await coll.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * Save multiple detection records in batch (e.g. from video analysis)
 */
async function saveTrafficBatch(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return { insertedCount: 0 };
  }
  const coll = await getLogsCollection();
  const normalized = records.map((data, idx) => ({
    vehicleId: Number(data.vehicleId) || (Date.now() % 100000) + idx,
    vehicleType: data.vehicleType || 'Mobil',
    passengerCount: Number(data.passengerCount) >= 0 ? Number(data.passengerCount) : 0,
    colors: Array.isArray(data.colors) ? data.colors : (data.colors ? [data.colors] : ['Hitam']),
    plateNumber: data.plateNumber ? String(data.plateNumber).toUpperCase().trim() : 'N/A',
    plateConfidence: typeof data.plateConfidence === 'number' ? data.plateConfidence : 0.85,
    timeOfDay: data.timeOfDay || 'Siang',
    imageMetrics: {
      resolution: data.imageMetrics?.resolution || '640x360',
      meanGrayscale: Number(data.imageMetrics?.meanGrayscale) || 120,
      hsvValue: Number(data.imageMetrics?.hsvValue) || 50,
      yiqWarmth: Number(data.imageMetrics?.yiqWarmth) || 0.005,
      binaryThreshold: Number(data.imageMetrics?.binaryThreshold) || 125,
      preprocessMode: data.imageMetrics?.preprocessMode || 'Grayscale + Binary (M3)'
    },
    mediaType: data.mediaType || 'video',
    mediaFilename: data.mediaFilename || null,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0.90,
    boundingBox: data.boundingBox || null,
    timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    __v: 0
  }));

  const result = await coll.insertMany(normalized);
  return { insertedCount: result.insertedCount, insertedIds: result.insertedIds };
}

/**
 * Fetch traffic logs with filters and pagination
 */
async function getTrafficLogs({ limit = 50, skip = 0, vehicleType, timeOfDay, searchPlate } = {}) {
  const coll = await getLogsCollection();
  const query = {};

  if (vehicleType && vehicleType !== 'all') {
    query.vehicleType = new RegExp(`^${vehicleType}$`, 'i');
  }

  if (timeOfDay && timeOfDay !== 'all') {
    query.timeOfDay = new RegExp(`^${timeOfDay}$`, 'i');
  }

  if (searchPlate && searchPlate.trim()) {
    query.plateNumber = new RegExp(searchPlate.trim(), 'i');
  }

  const [items, total] = await Promise.all([
    coll.find(query).sort({ timestamp: -1 }).skip(Number(skip)).limit(Number(limit)).toArray(),
    coll.countDocuments(query)
  ]);

  return { items, total, limit: Number(limit), skip: Number(skip) };
}

/**
 * Get aggregate statistics for dashboard
 */
async function getTrafficStats() {
  const coll = await getLogsCollection();

  const [totalVehicles, totalPassengersAgg, vehicleBreakdown, timeBreakdown, recentPlates] = await Promise.all([
    coll.countDocuments(),
    coll.aggregate([
      { $match: { vehicleType: { $regex: /kereta/i } } },
      { $group: { _id: null, total: { $sum: '$passengerCount' } } }
    ]).toArray(),
    coll.aggregate([
      { $group: { _id: '$vehicleType', count: { $sum: 1 } } }
    ]).toArray(),
    coll.aggregate([
      { $group: { _id: '$timeOfDay', count: { $sum: 1 } } }
    ]).toArray(),
    coll.find({ plateNumber: { $nin: ['N/A', '', null] } })
      .sort({ timestamp: -1 })
      .limit(10)
      .project({ plateNumber: 1, vehicleType: 1, timeOfDay: 1, timestamp: 1, plateConfidence: 1 })
      .toArray()
  ]);

  // Transform breakdowns into key-value objects
  const vehicleStats = {
    Mobil: 0,
    Motor: 0,
    Bus: 0,
    Truk: 0,
    Kereta: 0
  };
  vehicleBreakdown.forEach(item => {
    if (item._id) vehicleStats[item._id] = item.count;
  });

  const timeStats = {
    Siang: 0,
    Sore: 0,
    Malam: 0,
    Pagi: 0
  };
  timeBreakdown.forEach(item => {
    if (item._id) timeStats[item._id] = item.count;
  });

  return {
    totalVehicles,
    totalTrainPassengers: totalPassengersAgg[0]?.total || 0,
    vehicleBreakdown: vehicleStats,
    timeBreakdown: timeStats,
    recentPlates,
    connectionStatus
  };
}

/**
 * Delete a log by ID
 */
async function deleteTrafficLog(id) {
  const coll = await getLogsCollection();
  const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
  const res = await coll.deleteOne(filter);
  return { deletedCount: res.deletedCount };
}

/**
 * Check DB health
 */
async function getDbStatus() {
  try {
    const { db } = await connectToMongo();
    await db.command({ ping: 1 });
    connectionStatus.connected = true;
    connectionStatus.lastPing = new Date();
    return { ok: true, status: connectionStatus };
  } catch (err) {
    connectionStatus.connected = false;
    connectionStatus.error = err.message;
    return { ok: false, error: err.message, status: connectionStatus };
  }
}

module.exports = {
  connectToMongo,
  saveTrafficLog,
  saveTrafficBatch,
  getTrafficLogs,
  getTrafficStats,
  deleteTrafficLog,
  getDbStatus
};
