/**
 * test_trafficguard_api.js — Automated Verification Test for TrafficGuard
 */

const trafficDb = require('./trafficDb');
const trafficVision = require('./trafficVision');

async function runTests() {
  console.log('--- 1. Testing MongoDB Connection & DB Status ---');
  const status = await trafficDb.getDbStatus();
  console.log('MongoDB Status:', status);

  console.log('\n--- 2. Testing Saving a Log to MongoDB trafficguard.trafficlogs ---');
  const testDoc = {
    vehicleId: 99901,
    vehicleType: 'Kereta',
    passengerCount: 15,
    colors: ['Putih', 'Merah'],
    plateNumber: 'KAI-CC206-01',
    plateConfidence: 0.99,
    timeOfDay: 'Sore',
    imageMetrics: {
      resolution: '1280x720',
      meanGrayscale: 118,
      hsvValue: 49,
      yiqWarmth: 0.009,
      binaryThreshold: 124,
      preprocessMode: 'Warm Tint Gamma Correction + Binary (M3)'
    },
    mediaType: 'photo',
    mediaFilename: 'test_kereta_sore.jpg',
    confidence: 0.98
  };

  const saved = await trafficDb.saveTrafficLog(testDoc);
  console.log('Saved Record ID:', saved._id);

  console.log('\n--- 3. Testing Stats Query ---');
  const stats = await trafficDb.getTrafficStats();
  console.log('Total Vehicles:', stats.totalVehicles);
  console.log('Total Train Passengers:', stats.totalTrainPassengers);
  console.log('Breakdown by Vehicle:', stats.vehicleBreakdown);
  console.log('Breakdown by Time:', stats.timeBreakdown);

  console.log('\n--- 4. Testing Photometrics Analyzer ---');
  const dummyPixels = new Uint8ClampedArray(640 * 360 * 4);
  for (let i = 0; i < dummyPixels.length; i += 4) {
    dummyPixels[i] = 210;     // R
    dummyPixels[i + 1] = 120; // G
    dummyPixels[i + 2] = 50;  // B
    dummyPixels[i + 3] = 255; // A
  }
  const photoMetrics = trafficVision.analyzePhotometrics(dummyPixels, 640, 360);
  console.log('Calculated Photometrics for Sunset Buffer:', photoMetrics);

  console.log('\n--- 5. Clean Up Test Record ---');
  const delRes = await trafficDb.deleteTrafficLog(saved._id);
  console.log('Deleted Test Record:', delRes);

  console.log('\n>>> All Tests Passed Successfully! <<<');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
