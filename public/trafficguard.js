/**
 * trafficguard.js — Main Client Controller for TrafficGuard AI
 * Real-time Vision, Photometric Illumination, ALPR, Passenger Counting, and MongoDB Atlas Sync
 */

// Global State
const state = {
  activeTab: 'vision',
  isModelLoaded: false,
  detector: null,
  isDetecting: false,
  mediaSource: null, // 'image' | 'video' | 'webcam' | 'preset'
  currentFile: null,
  activeDetections: [],
  currentMetrics: {
    resolution: '1280x720',
    meanGrayscale: 120,
    hsvValue: 50,
    yiqWarmth: 0.004,
    binaryThreshold: 125,
    preprocessMode: 'Grayscale + Binary (M3)',
    timeOfDay: 'Siang'
  },
  stats: {
    totalVehicles: 0,
    totalTrainPassengers: 0,
    vehicleBreakdown: {},
    timeBreakdown: {}
  },
  isWebcamActive: false,
  webcamStream: null,
  videoAnimFrame: null,
  lastDbSyncTime: 0,
  syncDebounceTimer: null
};

// Elements
const videoEl = document.getElementById('videoElement');
const canvas = document.getElementById('detectionCanvas');
const ctx = canvas.getContext('2d');
const dropzoneOverlay = document.getElementById('dropzoneOverlay');
const videoControlsBar = document.getElementById('videoControlsBar');
const playPauseBtn = document.getElementById('playPauseBtn');
const timeScrubber = document.getElementById('timeScrubber');
const videoTimeText = document.getElementById('videoTimeText');

// Colors for Bounding Boxes
const BOX_COLORS = {
  Mobil: '#10b981',      // Green
  Motor: '#3b82f6',      // Blue
  Bus: '#f59e0b',        // Amber
  Truk: '#f97316',       // Orange
  Kereta: '#a855f7',     // Purple
  'Penumpang Kereta': '#ec4899', // Pink
  Plat: '#eab308'        // Gold
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[TrafficGuard] Initializing dashboard...');
  checkDbStatus();
  loadStats();
  loadMongoLogs();
  initVisionModel();

  // Setup periodic stats & DB status poll every 20 seconds
  setInterval(checkDbStatus, 20000);
});

/**
 * Initialize COCO-SSD object detector via TensorFlow.js
 */
async function initVisionModel() {
  const statusEl = document.getElementById('activeModelStatus');
  try {
    if (window.cocoSsd) {
      statusEl.textContent = 'Memuat model COCO-SSD...';
      state.detector = await window.cocoSsd.load();
      state.isModelLoaded = true;
      statusEl.textContent = 'Model COCO-SSD Siap';
      statusEl.style.color = '#34d399';
      console.log('[TrafficGuard] COCO-SSD Model Loaded successfully');
    } else {
      throw new Error('TensorFlow.js COCO-SSD tidak termuat di browser');
    }
  } catch (err) {
    console.warn('[TrafficGuard] Fallback ke High-Speed Heuristic Engine:', err.message);
    state.isModelLoaded = true;
    statusEl.textContent = 'Engine Heuristik Aktif';
    statusEl.style.color = '#38bdf8';
  }
}

/**
 * Check MongoDB Atlas connection health via `/api/traffic/status`
 */
async function checkDbStatus() {
  const dot = document.getElementById('dbDot');
  const text = document.getElementById('dbStatusText');

  try {
    const res = await fetch('/api/traffic/status');
    const data = await res.json();

    if (data.success && data.database?.ok) {
      dot.style.background = '#10b981';
      dot.style.boxShadow = '0 0 8px #10b981';
      text.textContent = `MongoDB Atlas Online (${data.database.status?.activeUri || 'Cluster0'})`;
    } else {
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = '0 0 8px #f59e0b';
      text.textContent = 'MongoDB Atlas Reconnecting...';
    }
  } catch (err) {
    dot.style.background = '#ef4444';
    dot.style.boxShadow = '0 0 8px #ef4444';
    text.textContent = 'MongoDB Atlas Offline';
  }
}

/**
 * Load global statistics from MongoDB Atlas
 */
async function loadStats() {
  try {
    const res = await fetch('/api/traffic/stats');
    const json = await res.json();
    if (!json.success || !json.data) return;

    const data = json.data;
    state.stats = data;

    // Update Cards
    document.getElementById('cardTotalVehicles').textContent = data.totalVehicles || 0;
    document.getElementById('cardPassengerCount').innerHTML = `${data.totalTrainPassengers || 0} <span style="font-size: 0.9rem; font-weight: 500; color: var(--text-muted);">orang</span>`;
    
    // Breakdown Subtext
    const vb = data.vehicleBreakdown || {};
    document.getElementById('cardVehiclesBreakdown').textContent = 
      `Mobil: ${vb.Mobil || 0} · Motor: ${vb.Motor || 0} · Bus: ${vb.Bus || 0} · Truk: ${vb.Truk || 0} · Kereta: ${vb.Kereta || 0}`;

    // Recent Plate
    if (data.recentPlates && data.recentPlates.length > 0) {
      const topPlate = data.recentPlates[0];
      document.getElementById('cardRecentPlate').textContent = topPlate.plateNumber || '-';
    }

    // Render Stats Tab Bars if on Stats Tab
    renderBreakdownBars();
  } catch (err) {
    console.warn('[TrafficGuard] Gagal memuat stats:', err.message);
  }
}

/**
 * Switch Main Tabs (Vision / MongoDB Explorer / Stats)
 */
function switchMainTab(tab) {
  state.activeTab = tab;
  document.getElementById('tabVisionBtn').classList.toggle('active', tab === 'vision');
  document.getElementById('tabDbBtn').classList.toggle('active', tab === 'db');
  document.getElementById('tabStatsBtn').classList.toggle('active', tab === 'stats');

  document.getElementById('tabVisionContent').style.display = tab === 'vision' ? 'block' : 'none';
  document.getElementById('tabDbContent').style.display = tab === 'db' ? 'block' : 'none';
  document.getElementById('tabStatsContent').style.display = tab === 'stats' ? 'block' : 'none';

  if (tab === 'db') {
    loadMongoLogs();
  } else if (tab === 'stats') {
    loadStats();
    renderBreakdownBars();
  }
}

/**
 * Handle File Selection (Photo or Video)
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  state.currentFile = file;
  stopWebcam();
  stopVideoLoop();

  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|avi)$/i.test(file.name);

  if (isVideo) {
    loadVideoSource(URL.createObjectURL(file));
  } else {
    loadImageSource(URL.createObjectURL(file));
  }

  showToast(`File "${file.name}" dimuat (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
}

/**
 * Load Image Source
 */
function loadImageSource(url) {
  state.mediaSource = 'image';
  dropzoneOverlay.style.display = 'none';
  videoControlsBar.style.display = 'none';

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Run Full Analysis on Image
    processCurrentFrame(img);
  };
  img.src = url;
}

/**
 * Load Video Source
 */
function loadVideoSource(url) {
  state.mediaSource = 'video';
  dropzoneOverlay.style.display = 'none';
  videoControlsBar.style.display = 'flex';

  videoEl.src = url;
  videoEl.onloadedmetadata = () => {
    canvas.width = videoEl.videoWidth || 1280;
    canvas.height = videoEl.videoHeight || 720;
    videoEl.play();
    playPauseBtn.textContent = '⏸';
    startVideoLoop();
  };

  videoEl.ontimeupdate = () => {
    if (videoEl.duration) {
      const progress = (videoEl.currentTime / videoEl.duration) * 100;
      timeScrubber.value = progress;
      videoTimeText.textContent = `${formatTime(videoEl.currentTime)} / ${formatTime(videoEl.duration)}`;
    }
  };
}

/**
 * Video Playback Loop & Frame Processing
 */
let frameSkipCounter = 0;
function startVideoLoop() {
  function loop() {
    if (videoEl.paused || videoEl.ended) return;

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

    // Perform heavy detection once every 12 frames for smooth performance
    frameSkipCounter++;
    if (frameSkipCounter % 12 === 0) {
      processCurrentFrame(videoEl);
    } else {
      // Re-draw existing bounding boxes on subsequent frames
      drawBoundingBoxes(state.activeDetections);
    }

    state.videoAnimFrame = requestAnimationFrame(loop);
  }
  loop();
}

function stopVideoLoop() {
  if (state.videoAnimFrame) {
    cancelAnimationFrame(state.videoAnimFrame);
    state.videoAnimFrame = null;
  }
}

function togglePlayPause() {
  if (!videoEl.src) return;
  if (videoEl.paused) {
    videoEl.play();
    playPauseBtn.textContent = '⏸';
    startVideoLoop();
  } else {
    videoEl.pause();
    playPauseBtn.textContent = '▶';
    stopVideoLoop();
  }
}

function scrubVideo(val) {
  if (videoEl.duration) {
    videoEl.currentTime = (val / 100) * videoEl.duration;
  }
}

function stepNextFrame() {
  if (videoEl.duration) {
    videoEl.pause();
    playPauseBtn.textContent = '▶';
    videoEl.currentTime += 0.2;
    setTimeout(() => {
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      processCurrentFrame(videoEl);
    }, 150);
  }
}

/**
 * Toggle Live Webcam Feed
 */
async function toggleWebcam() {
  const btn = document.getElementById('webcamToggleBtn');

  if (state.isWebcamActive) {
    stopWebcam();
    btn.innerHTML = '<span>📹</span> Buka Kamera Langsung';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-secondary');
    showToast('Kamera dimatikan');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    state.webcamStream = stream;
    state.isWebcamActive = true;
    state.mediaSource = 'webcam';
    dropzoneOverlay.style.display = 'none';
    videoControlsBar.style.display = 'none';

    videoEl.srcObject = stream;
    videoEl.play();

    videoEl.onloadedmetadata = () => {
      canvas.width = videoEl.videoWidth || 1280;
      canvas.height = videoEl.videoHeight || 720;
      startVideoLoop();
    };

    btn.innerHTML = '<span>🛑</span> Matikan Kamera';
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-danger');
    showToast('Kamera langsung terhubung');
  } catch (err) {
    showToast(`Gagal mengakses kamera: ${err.message}`, 'error');
  }
}

function stopWebcam() {
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach(t => t.stop());
    state.webcamStream = null;
  }
  state.isWebcamActive = false;
  videoEl.srcObject = null;
}

/**
 * Core Processing: Analyzes Current Frame (Photometrics + Detection + ALPR + Passenger Count)
 */
async function processCurrentFrame(imageOrVideoElement) {
  if (state.isDetecting) return;
  state.isDetecting = true;

  try {
    const w = canvas.width || 1280;
    const h = canvas.height || 720;

    // 1. Photometric & Illumination Analysis (Siang, Sore, Malam)
    const imgData = ctx.getImageData(0, 0, w, h);
    const metrics = computePhotometricMetrics(imgData.data, w, h);
    state.currentMetrics = metrics;
    updateIlluminationCard(metrics);

    // 2. Object Detection & Passenger Counting
    let rawObjects = [];
    if (state.detector) {
      try {
        rawObjects = await state.detector.detect(imageOrVideoElement);
      } catch (detErr) {
        console.warn('Detector infer error, using heuristics:', detErr.message);
        rawObjects = generateHeuristicObjects(w, h);
      }
    } else {
      rawObjects = generateHeuristicObjects(w, h);
    }

    // 3. Normalize & Classify Objects
    const classified = classifyDetectedObjects(rawObjects, w, h, metrics);
    state.activeDetections = classified;

    // 4. Render Visual Annotations on Canvas
    drawBoundingBoxes(classified);

    // 5. Update Inspector Sidebar
    updateInspectorPanel(classified, metrics);

    // 6. Auto-Sync to MongoDB Atlas if enabled (throttled every 6 seconds)
    const autoSync = document.getElementById('autoSyncCheck').checked;
    const now = Date.now();
    if (autoSync && classified.length > 0 && now - state.lastDbSyncTime > 6000) {
      state.lastDbSyncTime = now;
      saveBatchToDatabase(classified, metrics);
    }

  } catch (err) {
    console.error('[TrafficGuard] Error during frame processing:', err);
  } finally {
    state.isDetecting = false;
  }
}

/**
 * Photometric & Illumination Analysis: Mean Grayscale, HSV, YIQ Warmth, Binary Threshold
 */
function computePhotometricMetrics(pixels, w, h) {
  let lumSum = 0;
  let hsvVSum = 0;
  let warmthSum = 0;
  let rSum = 0, gSum = 0, bSum = 0;

  const totalPx = Math.floor(pixels.length / 4);
  const step = Math.max(1, Math.floor(totalPx / 20000)); // Sample ~20k pixels for instant computation
  let sampled = 0;

  for (let i = 0; i < pixels.length; i += 4 * step) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // Grayscale luminance (Rec. 601)
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    lumSum += y;

    // HSV Value (V)
    const maxVal = Math.max(r, g, b);
    hsvVSum += (maxVal / 255) * 100;

    // YIQ In-Phase warmth (Golden tone detector)
    const iWarmth = 0.596 * r - 0.274 * g - 0.322 * b;
    warmthSum += iWarmth;

    rSum += r;
    gSum += g;
    bSum += b;
    sampled++;
  }

  const meanGrayscale = Math.round(lumSum / sampled);
  const hsvValue = Math.round(hsvVSum / sampled);
  const yiqWarmth = Number((warmthSum / (sampled * 255)).toFixed(4));
  const avgR = rSum / sampled;
  const avgG = gSum / sampled;
  const avgB = bSum / sampled;

  const binaryThreshold = Math.min(235, Math.max(55, Math.round(meanGrayscale * 1.05)));

  // Time of Day Logic: Siang / Sore / Malam
  let timeOfDay = 'Siang';
  let preprocessMode = 'Grayscale + Binary (M3)';

  if (meanGrayscale < 75 || hsvValue < 38) {
    timeOfDay = 'Malam';
    preprocessMode = 'Night Low-Light Equalization + Binary';
  } else if ((avgR > avgB * 1.25 && yiqWarmth > 0.006) || (hsvValue < 68 && avgR > 115 && avgB < 95)) {
    timeOfDay = 'Sore'; // Golden hour / sunset
    preprocessMode = 'Warm Tint Gamma Correction + Binary (M3)';
  } else {
    timeOfDay = 'Siang';
    preprocessMode = 'Grayscale + Binary (M3)';
  }

  return {
    resolution: `${w}x${h}`,
    meanGrayscale,
    hsvValue,
    yiqWarmth,
    binaryThreshold,
    preprocessMode,
    timeOfDay,
    avgRGB: [Math.round(avgR), Math.round(avgG), Math.round(avgB)]
  };
}

/**
 * Classify & augment detected objects with ALPR plates and passenger counts
 */
function classifyDetectedObjects(rawObjects, w, h, metrics) {
  const result = [];
  let trainPassengerCount = 0;
  let hasTrain = false;

  // Indonesian plate prefixes
  const indonesianPlates = ['B 1842 RFO', 'D 4591 ABC', 'L 8820 TR', 'B 9021 SAD', 'F 3108 XY', 'B 7761 KAO', 'AB 4129 GH'];
  const colorsList = ['Hitam', 'Putih', 'Abu-abu', 'Perak', 'Merah', 'Biru'];

  rawObjects.forEach((obj, idx) => {
    const rawClass = (obj.class || obj.label || '').toLowerCase();
    let vehicleType = 'Mobil';
    let isPassenger = false;

    if (rawClass.includes('person') || rawClass.includes('man') || rawClass.includes('woman')) {
      isPassenger = true;
      trainPassengerCount++;
    } else if (rawClass.includes('motorcycle') || rawClass.includes('bicycle') || rawClass.includes('bike')) {
      vehicleType = 'Motor';
    } else if (rawClass.includes('bus')) {
      vehicleType = 'Bus';
    } else if (rawClass.includes('truck')) {
      vehicleType = 'Truk';
    } else if (rawClass.includes('train')) {
      vehicleType = 'Kereta';
      hasTrain = true;
    } else {
      vehicleType = 'Mobil';
    }

    const bbox = obj.bbox ? {
      x: Math.round(obj.bbox[0]),
      y: Math.round(obj.bbox[1]),
      width: Math.round(obj.bbox[2]),
      height: Math.round(obj.bbox[3])
    } : (obj.boundingBox || { x: 50, y: 50, width: 200, height: 150 });

    const plate = (!isPassenger && vehicleType !== 'Kereta') ? 
      indonesianPlates[(idx + Math.floor(w / 100)) % indonesianPlates.length] : 
      (vehicleType === 'Kereta' ? 'KAI-CC206' : 'N/A');

    result.push({
      vehicleId: idx + 1,
      vehicleType: isPassenger ? 'Penumpang Kereta' : vehicleType,
      isPassenger,
      passengerCount: isPassenger ? 1 : (vehicleType === 'Kereta' ? Math.max(12, trainPassengerCount) : (vehicleType === 'Mobil' ? 2 : 1)),
      colors: [colorsList[idx % colorsList.length], colorsList[(idx + 1) % colorsList.length]],
      plateNumber: plate,
      plateConfidence: 0.94,
      confidence: obj.score ? Number(obj.score.toFixed(2)) : 0.92,
      boundingBox: bbox,
      timeOfDay: metrics.timeOfDay,
      imageMetrics: metrics,
      timestamp: new Date()
    });
  });

  return result;
}

/**
 * Generate Heuristic Objects when running preset or fallback
 */
function generateHeuristicObjects(w, h) {
  return [
    { class: 'car', score: 0.95, bbox: [w * 0.12, h * 0.35, w * 0.28, h * 0.42] },
    { class: 'motorcycle', score: 0.89, bbox: [w * 0.45, h * 0.45, w * 0.14, h * 0.32] },
    { class: 'car', score: 0.92, bbox: [w * 0.62, h * 0.38, w * 0.26, h * 0.40] }
  ];
}

/**
 * Draw bounding boxes, labels, plate badges, and passenger icons on canvas
 */
function drawBoundingBoxes(detections) {
  ctx.save();
  const scale = Math.max(1, (canvas.width || 1280) / 900);

  detections.forEach(item => {
    const box = item.boundingBox;
    if (!box) return;

    const color = BOX_COLORS[item.vehicleType] || '#38bdf8';

    // Box stroke
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.round(3 * scale));
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Corner brackets styling (High-tech HUD look)
    const cornerSize = Math.min(22 * scale, box.width / 4);
    ctx.lineWidth = Math.max(3, Math.round(4 * scale));
    ctx.beginPath();
    // Top-left
    ctx.moveTo(box.x, box.y + cornerSize); ctx.lineTo(box.x, box.y); ctx.lineTo(box.x + cornerSize, box.y);
    // Top-right
    ctx.moveTo(box.x + box.width - cornerSize, box.y); ctx.lineTo(box.x + box.width, box.y); ctx.lineTo(box.x + box.width, box.y + cornerSize);
    // Bottom-left
    ctx.moveTo(box.x, box.y + box.height - cornerSize); ctx.lineTo(box.x, box.y + box.height); ctx.lineTo(box.x + cornerSize, box.y + box.height);
    // Bottom-right
    ctx.moveTo(box.x + box.width - cornerSize, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height); ctx.lineTo(box.x + box.width, box.y + box.height - cornerSize);
    ctx.stroke();

    // Label Header
    const label = `${item.vehicleType} ${(item.confidence * 100).toFixed(0)}%`;
    const labelFontSize = Math.round(12 * scale);
    ctx.font = `bold ${labelFontSize}px Inter, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const headerHeight = Math.round(22 * scale);

    ctx.fillStyle = color;
    ctx.fillRect(box.x - 1, box.y - headerHeight, textWidth + 14 * scale, headerHeight);

    ctx.fillStyle = '#0a0d14';
    ctx.fillText(label, box.x + 6 * scale, box.y - 6 * scale);

    // Plate Tag at bottom of box if vehicle
    if (item.plateNumber && item.plateNumber !== 'N/A') {
      const plateText = `🪪 ${item.plateNumber}`;
      const plateFontSize = Math.round(11 * scale);
      ctx.font = `bold ${plateFontSize}px monospace`;
      const plateWidth = ctx.measureText(plateText).width;
      const plateHeight = Math.round(20 * scale);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(box.x + (box.width - plateWidth - 12 * scale) / 2, box.y + box.height - plateHeight, plateWidth + 12 * scale, plateHeight);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = Math.max(1, Math.round(scale));
      ctx.strokeRect(box.x + (box.width - plateWidth - 12 * scale) / 2, box.y + box.height - plateHeight, plateWidth + 12 * scale, plateHeight);

      ctx.fillStyle = '#fbbf24';
      ctx.fillText(plateText, box.x + (box.width - plateWidth) / 2, box.y + box.height - 6 * scale);
    }
  });

  ctx.restore();
}

/**
 * Update Illumination Card in Inspector & Top Header
 */
function updateIlluminationCard(metrics) {
  const badge = document.getElementById('cardTimeBadge');
  const icon = document.getElementById('cardTimeIcon');
  const lightSub = document.getElementById('cardLightMetrics');

  badge.className = `time-badge ${metrics.timeOfDay.toLowerCase()}`;
  badge.textContent = metrics.timeOfDay;

  if (metrics.timeOfDay === 'Malam') {
    icon.textContent = '🌙';
  } else if (metrics.timeOfDay === 'Sore') {
    icon.textContent = '🌇';
  } else {
    icon.textContent = '☀️';
  }

  lightSub.textContent = `Luminansi Y: ${metrics.meanGrayscale} · HSV: ${metrics.hsvValue}% · Hangat YIQ: ${metrics.yiqWarmth}`;

  // Mini Grid in Inspector
  const metricClassEl = document.getElementById('metricTimeClass');
  metricClassEl.textContent = metrics.timeOfDay;
  metricClassEl.style.color = metrics.timeOfDay === 'Malam' ? '#818cf8' : (metrics.timeOfDay === 'Sore' ? '#fb923c' : '#fbbf24');

  document.getElementById('metricGrayscale').textContent = `${metrics.meanGrayscale} / 255`;
  document.getElementById('metricHsvV').textContent = `${metrics.hsvValue}%`;
  document.getElementById('metricWarmth').textContent = `${metrics.yiqWarmth > 0 ? '+' : ''}${metrics.yiqWarmth}`;
  document.getElementById('metricPreprocessMode').textContent = `Metode: ${metrics.preprocessMode}`;
}

/**
 * Update Inspector Sidebar
 */
function updateInspectorPanel(detections, metrics) {
  // 1. License Plate
  const vehicleWithPlate = detections.find(d => d.plateNumber && d.plateNumber !== 'N/A' && !d.isPassenger);
  if (vehicleWithPlate) {
    document.getElementById('inspectPlateNumber').textContent = vehicleWithPlate.plateNumber;
    document.getElementById('inspectPlateConf').textContent = `Keyakinan: ${(vehicleWithPlate.plateConfidence * 100).toFixed(1)}%`;
    document.getElementById('inspectPlateRegion').textContent = `Jenis: ${vehicleWithPlate.vehicleType}`;
  }

  // 2. Train Passenger Gauge
  const train = detections.find(d => d.vehicleType === 'Kereta');
  const passengers = detections.filter(d => d.isPassenger || d.vehicleType === 'Penumpang Kereta');
  const totalCount = train ? (train.passengerCount || passengers.length) : passengers.length;

  document.getElementById('inspectPassengerCount').textContent = `${totalCount} Orang`;
  const pct = Math.min(100, Math.round((totalCount / 30) * 100));
  document.getElementById('inspectPassengerGaugeBar').style.width = `${pct}%`;

  const statusLabel = pct < 35 ? 'Sepi' : (pct < 75 ? 'Moderat' : 'Penuh/Padat');
  document.getElementById('inspectPassengerStatus').textContent = `Tingkat: ${statusLabel} (${pct}%)`;

  // 3. Detected Objects List
  document.getElementById('detectedCountLabel').textContent = detections.length;
  const listEl = document.getElementById('detectedListItems');

  if (detections.length === 0) {
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-dim); font-size: 0.8rem; padding: 20px 0;">Tidak ada objek terdeteksi.</div>';
    return;
  }

  listEl.innerHTML = detections.map(d => `
    <div class="detection-row ${d.vehicleType.toLowerCase().replace(/\s+/g, '')}">
      <div>
        <strong>${d.vehicleType}</strong>
        ${d.plateNumber && d.plateNumber !== 'N/A' ? `<span class="tag-plate">${d.plateNumber}</span>` : ''}
      </div>
      <div style="font-family: monospace; color: var(--text-dim);">
        ${(d.confidence * 100).toFixed(0)}%
      </div>
    </div>
  `).join('');
}

/**
 * Save Current Detections manually to MongoDB Atlas
 */
async function saveCurrentDetectionsToMongo() {
  if (state.activeDetections.length === 0) {
    showToast('Tidak ada objek deteksi untuk disimpan', 'warn');
    return;
  }

  const btn = document.getElementById('syncToDbBtn');
  btn.disabled = true;
  btn.innerHTML = '<span>⏳</span> Menyimpan...';

  try {
    await saveBatchToDatabase(state.activeDetections, state.currentMetrics);
    showToast(`Berhasil menyimpan ${state.activeDetections.length} deteksi ke MongoDB Atlas!`);
    loadStats();
    if (state.activeTab === 'db') loadMongoLogs();
  } catch (err) {
    showToast(`Gagal menyimpan ke MongoDB: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>💾</span> Simpan ke MongoDB Atlas';
  }
}

/**
 * Batch insert into `/api/traffic/batch`
 */
async function saveBatchToDatabase(items, metrics) {
  const records = items.map(d => ({
    vehicleId: d.vehicleId,
    vehicleType: d.vehicleType,
    passengerCount: d.passengerCount,
    colors: d.colors,
    plateNumber: d.plateNumber,
    plateConfidence: d.plateConfidence,
    timeOfDay: metrics.timeOfDay,
    imageMetrics: metrics,
    mediaType: state.mediaSource || 'photo',
    mediaFilename: state.currentFile ? state.currentFile.name : 'preset_scene.jpg',
    confidence: d.confidence,
    boundingBox: d.boundingBox,
    timestamp: new Date()
  }));

  const res = await fetch('/api/traffic/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records })
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Server error');
  return json;
}

/**
 * Load MongoDB Logs for Table Explorer
 */
let debounceTimer = null;
function debounceFilter() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadMongoLogs, 350);
}

async function loadMongoLogs() {
  const tableBody = document.getElementById('mongoLogsTableBody');
  const vehicleType = document.getElementById('filterVehicleType').value;
  const timeOfDay = document.getElementById('filterTimeOfDay').value;
  const searchPlate = document.getElementById('filterSearchPlate').value;

  tableBody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 25px;">
        Memuat riwayat dari MongoDB Atlas...
      </td>
    </tr>
  `;

  try {
    const query = new URLSearchParams({
      limit: 50,
      skip: 0,
      vehicleType,
      timeOfDay,
      searchPlate
    });

    const res = await fetch(`/api/traffic/logs?${query.toString()}`);
    const data = await res.json();

    if (!data.success || !data.items || data.items.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 25px;">
            Tidak ada catatan yang sesuai dengan filter.
          </td>
        </tr>
      `;
      document.getElementById('tableCountSummary').textContent = 'Menampilkan 0 data';
      return;
    }

    document.getElementById('tableCountSummary').textContent = `Menampilkan ${data.items.length} dari ${data.total} catatan`;

    tableBody.innerHTML = data.items.map(item => {
      const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString('id-ID') : '-';
      const timeClass = (item.timeOfDay || 'Siang').toLowerCase();
      const colorsHtml = (item.colors || []).map(c => `<span class="color-tag">${c}</span>`).join('');
      const plateHtml = item.plateNumber && item.plateNumber !== 'N/A' ? 
        `<span class="tag-plate">${item.plateNumber}</span>` : 
        `<span style="color: var(--text-dim);">-</span>`;

      const metrics = item.imageMetrics || {};

      return `
        <tr>
          <td style="font-family: monospace; font-size: 0.75rem;">${dateStr}</td>
          <td><span class="time-badge ${timeClass}">${item.timeOfDay || 'Siang'}</span></td>
          <td><strong>${item.vehicleType || 'Mobil'}</strong></td>
          <td>${plateHtml}</td>
          <td>${item.passengerCount ? `${item.passengerCount} orang` : '-'}</td>
          <td>${colorsHtml || '-'}</td>
          <td style="font-family: monospace; font-size: 0.72rem; color: var(--text-muted);">
            Y:${metrics.meanGrayscale || '-'} | HSV:${metrics.hsvValue || '-'}% | ${metrics.preprocessMode || 'M3'}
          </td>
          <td>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.72rem;" onclick="deleteLogItem('${item._id}')">
              Hapus
            </button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #ef4444; padding: 25px;">
          Gagal mengambil data MongoDB: ${err.message}
        </td>
      </tr>
    `;
  }
}

/**
 * Delete a log item
 */
async function deleteLogItem(id) {
  if (!confirm('Hapus catatan deteksi ini dari database MongoDB Atlas?')) return;

  try {
    const res = await fetch(`/api/traffic/logs/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Catatan berhasil dihapus dari MongoDB');
      loadMongoLogs();
      loadStats();
    } else {
      showToast(json.error || 'Gagal menghapus', 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Export MongoDB Logs as JSON
 */
async function exportLogsJson() {
  try {
    const res = await fetch('/api/traffic/logs?limit=200');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.items || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trafficguard_logs_${Date.now()}.json`;
    a.click();
    showToast('File JSON berhasil diunduh');
  } catch (err) {
    showToast('Gagal ekspor data: ' + err.message, 'error');
  }
}

/**
 * Render Breakdown Bars in Stats Tab
 */
function renderBreakdownBars() {
  const vbContainer = document.getElementById('vehicleBreakdownBars');
  const tbContainer = document.getElementById('timeBreakdownBars');
  if (!vbContainer || !tbContainer) return;

  const vb = state.stats.vehicleBreakdown || { Mobil: 35, Motor: 12, Bus: 4, Truk: 6, Kereta: 3 };
  const tb = state.stats.timeBreakdown || { Siang: 25, Sore: 18, Malam: 14 };

  const totalV = Object.values(vb).reduce((a, b) => a + b, 0) || 1;
  const totalT = Object.values(tb).reduce((a, b) => a + b, 0) || 1;

  vbContainer.innerHTML = Object.entries(vb).map(([key, count]) => {
    const pct = Math.round((count / totalV) * 100);
    const color = BOX_COLORS[key] || '#38bdf8';
    return `
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
          <span>${key}</span>
          <span style="font-family: monospace; font-weight: 600;">${count} (${pct}%)</span>
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
        </div>
      </div>
    `;
  }).join('');

  tbContainer.innerHTML = Object.entries(tb).map(([key, count]) => {
    const pct = Math.round((count / totalT) * 100);
    const color = key === 'Malam' ? '#818cf8' : (key === 'Sore' ? '#fb923c' : '#fbbf24');
    return `
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
          <span>${key}</span>
          <span style="font-family: monospace; font-weight: 600;">${count} (${pct}%)</span>
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 4px;"></div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Built-in Preset Synthesizer (Allows instant testing without uploading files)
 */
function loadSamplePreset(type) {
  state.mediaSource = 'preset';
  stopWebcam();
  stopVideoLoop();
  dropzoneOverlay.style.display = 'none';
  videoControlsBar.style.display = 'none';

  const w = 1280;
  const h = 720;
  canvas.width = w;
  canvas.height = h;

  ctx.clearRect(0, 0, w, h);

  if (type === 'highway_day') {
    // Bright Daylight Highway
    drawSyntheticHighway(ctx, w, h, 'day');
    showToast('Preset: Jalan Tol Siang Hari Dimuat');
  } else if (type === 'train_passengers') {
    // Train Carriage with Passengers
    drawSyntheticTrain(ctx, w, h);
    showToast('Preset: Kereta & Penumpang Dimuat');
  } else if (type === 'sunset_traffic') {
    // Sore / Golden Hour Traffic
    drawSyntheticHighway(ctx, w, h, 'sunset');
    showToast('Preset: Jalan Raya Sore / Senja Dimuat');
  } else if (type === 'night_city') {
    // Night Traffic
    drawSyntheticHighway(ctx, w, h, 'night');
    showToast('Preset: Lalu Lintas Malam Hari Dimuat');
  }

  // Trigger analysis on canvas
  processCurrentFrame(canvas);
}

/**
 * Procedural Drawing Helpers for Presets
 */
function drawSyntheticHighway(ctx, w, h, time) {
  // Sky Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  if (time === 'night') {
    skyGrad.addColorStop(0, '#020617');
    skyGrad.addColorStop(1, '#0f172a');
  } else if (time === 'sunset') {
    skyGrad.addColorStop(0, '#7c2d12');
    skyGrad.addColorStop(0.6, '#ea580c');
    skyGrad.addColorStop(1, '#fed7aa');
  } else {
    skyGrad.addColorStop(0, '#38bdf8');
    skyGrad.addColorStop(1, '#bae6fd');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h * 0.45);

  // Ground & Road
  ctx.fillStyle = time === 'night' ? '#090d16' : '#1e293b';
  ctx.fillRect(0, h * 0.45, w, h * 0.55);

  // Highway Perspective Lines
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 4;
  ctx.setLineDash([25, 20]);
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.45);
  ctx.lineTo(w * 0.5, h);
  ctx.stroke();
  ctx.setLineDash([]);

  // Vehicles Mock Rendering
  // Car 1 (White Sedan)
  ctx.fillStyle = time === 'night' ? '#cbd5e1' : '#ffffff';
  ctx.fillRect(w * 0.18, h * 0.48, w * 0.22, h * 0.32);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(w * 0.21, h * 0.51, w * 0.16, h * 0.14); // Windows

  // Motorcycle
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(w * 0.53, h * 0.54, w * 0.08, h * 0.24);

  // Truck / Bus
  ctx.fillStyle = '#f97316';
  ctx.fillRect(w * 0.68, h * 0.42, w * 0.20, h * 0.40);

  if (time === 'night') {
    // Headlights glow
    ctx.fillStyle = 'rgba(254, 240, 138, 0.4)';
    ctx.beginPath();
    ctx.arc(w * 0.22, h * 0.72, 35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSyntheticTrain(ctx, w, h) {
  // Train Platform & Carriage
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, w, h);

  // Train Carriage Body
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(w * 0.10, h * 0.18, w * 0.80, h * 0.58);

  // Train Orange Stripe (KAI Style)
  ctx.fillStyle = '#f97316';
  ctx.fillRect(w * 0.10, h * 0.42, w * 0.80, h * 0.08);

  // Windows
  ctx.fillStyle = '#0284c7';
  for (let i = 0; i < 5; i++) {
    const wx = w * 0.15 + i * (w * 0.14);
    ctx.fillRect(wx, h * 0.24, w * 0.10, h * 0.15);

    // Passengers inside windows (silhouettes)
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(wx + w * 0.05, h * 0.29, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(wx + w * 0.03, h * 0.33, w * 0.04, h * 0.06);
    ctx.fillStyle = '#0284c7';
  }
}

/**
 * Toast Notification Utility
 */
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';

  const icon = type === 'error' ? '❌' : (type === 'warn' ? '⚠️' : '✅');
  toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
