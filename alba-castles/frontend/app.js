// --- MOCK CASTLE DATABASE ---
const CASTLES_DATA = [
  {
    id: "dunnottar",
    title: "Dunnottar Castle",
    region: "Stonehaven, Aberdeenshire",
    lat: 56.9460,
    lng: -2.1972,
    category: "ruin",
    rating: 4.9,
    valuation: "£38,000,000",
    dungeons: 4,
    beds: 0,
    moats: 1,
    acres: 3,
    filmCredits: ["Hamlet (1990)", "Victor Frankenstein (2015)", "Brave (2012 Inspiration)"],
    trumpStats: {
      age: { rating: 4, stat: "Built c. 1200 (800 yrs old)" },
      defensibility: { rating: 5, stat: "160ft Shear Cliffs & Drawbridge" },
      lore: { rating: 5, stat: "Safehouse for the Scottish Crown Jewels" },
      repair: { rating: 2, stat: "Unroofed Historic Ruin" },
      livability: { rating: 1, stat: "No roof, cold sea winds, no heating" }
    },
    description: "A dramatic clifftop fortress perched on a rocky headland in northeastern Scotland. Dunnottar was the home of the Earls Marischal and hid the Scottish Crown Jewels from Oliver Cromwell's invading army.",
    parking: "Available (requires a steep 15-minute clifftop walk to the entrance)",
    photoSpot: "The northern coastal path at sunset, highlighting the dramatic drop",
    admission: "Ticketed (£10.50 Adult, £4.50 Child)",
    reviews: [
      { author: "Fiona M.", rating: 5, text: "Breathtaking views. Prepare for a lot of steps down and back up, but it is absolutely worth every single climb!" },
      { author: "Ian Mac.", rating: 4, text: "Excellent ruins. Highly recommend visiting when the tide is high for stunning sea background photos." }
    ]
  },
  {
    id: "eilean_donan",
    title: "Eilean Donan Castle",
    region: "Kyle of Lochalsh, Highlands",
    lat: 57.2740,
    lng: -5.5161,
    category: "fortress",
    rating: 4.8,
    valuation: "£65,000,000",
    dungeons: 1,
    beds: 12,
    moats: 1,
    acres: 1,
    filmCredits: ["Highlander (1986)", "James Bond: The World Is Not Enough (1999)", "Loch Ness (1996)"],
    trumpStats: {
      age: { rating: 4, stat: "Built c. 1220 (Rebuilt 1932)" },
      defensibility: { rating: 4, stat: "Island fortress with single bridge access" },
      lore: { rating: 4, stat: "Jacobite stronghold blown up by Royal Navy" },
      repair: { rating: 5, stat: "Fully restored 20th-century interior" },
      livability: { rating: 4, stat: "Cozy timber ceilings, modern electrical grid" }
    },
    description: "One of the most iconic images of Scotland, situated on an island where three sea lochs meet. Originally built in the 13th century, it was destroyed during the Jacobite rising and fully rebuilt in the 20th century.",
    parking: "Spacious parking lot directly at the visitor center (easy access)",
    photoSpot: "From the shore just south of the bridge, capturing the reflection in the loch",
    admission: "Ticketed (£12.00 Adult)",
    reviews: [
      { author: "Alastair S.", rating: 5, text: "The bagpiper playing near the bridge makes the atmosphere truly magical. Internal museum is fantastic." }
    ]
  },
  {
    id: "edinburgh",
    title: "Edinburgh Castle",
    region: "Castle Rock, Edinburgh",
    lat: 55.9486,
    lng: -3.2008,
    category: "royal",
    rating: 4.7,
    valuation: "£350,000,000",
    dungeons: 6,
    beds: 50,
    moats: 0,
    acres: 10,
    filmCredits: ["Entrapment (1999)", "One Day (2011)", "Outlander (Inspiration)"],
    trumpStats: {
      age: { rating: 5, stat: "Built c. 1130 (900 yrs old)" },
      defensibility: { rating: 5, stat: "Volcanic rock core, sheer drops on 3 sides" },
      lore: { rating: 5, stat: "Underwent 26 historical sieges" },
      repair: { rating: 5, stat: "Impeccable structural maintenance" },
      livability: { rating: 3, stat: "Cold stone walls, high military security" }
    },
    description: "A historic fortress which dominates the skyline of Edinburgh from its position on Castle Rock. It has served as a royal residence, military stronghold, prison, and home to the Honours of Scotland.",
    parking: "No parking at the castle. Use city center park & rides or public transit",
    photoSpot: "The Vennel Steps in Grassmarket, framing the castle towering above",
    admission: "Ticketed (£19.50 Adult - Book in advance!)",
    reviews: [
      { author: "Sarah P.", rating: 4, text: "Huge place, takes hours to explore. Don't miss the One O'Clock Gun or the St. Margaret's Chapel!" }
    ]
  },
  {
    id: "stirling",
    title: "Stirling Castle",
    region: "Stirling, Central Scotland",
    lat: 56.1238,
    lng: -3.9479,
    category: "royal",
    rating: 4.8,
    valuation: "£280,000,000",
    dungeons: 3,
    beds: 35,
    moats: 1,
    acres: 6,
    filmCredits: ["Braveheart (1995)", "The Outlaw King (2018)", "The Kid in King Arthur's Court (1995)"],
    trumpStats: {
      age: { rating: 4, stat: "Built c. 1110 (Reconstructed c. 1500)" },
      defensibility: { rating: 5, stat: "High volcanic crag overlook" },
      lore: { rating: 5, stat: "Coronation site of Mary Queen of Scots" },
      repair: { rating: 5, stat: "Fully restored Renaissance Palace rooms" },
      livability: { rating: 5, stat: "Royal chambers, monumental fireplaces" }
    },
    description: "One of the largest and most important castles in Scotland, both historically and architecturally. Perched atop Castle Hill, it was the childhood home of Mary, Queen of Scots, and the coronation site of many monarchs.",
    parking: "Limited parking on-site (£4 for 4 hours)",
    photoSpot: "The esplanade looking north towards the Wallace Monument",
    admission: "Ticketed (£18.00 Adult)",
    reviews: [
      { author: "Donald B.", rating: 5, text: "The Great Hall restoration is fantastic. The costumed guides do a brilliant job bringing history alive." }
    ]
  }
];

// --- APP STATE MANAGER ---
let activeTab = "discover";
let map = null;
let currentCastleId = null;

// Persistent User states in LocalStorage
let visitedCastles = JSON.parse(localStorage.getItem("alba_visited")) || [];
let savedCastles = JSON.parse(localStorage.getItem("alba_saved")) || [];
let customReviews = JSON.parse(localStorage.getItem("alba_custom_reviews")) || {};
let offlineReviewQueue = JSON.parse(localStorage.getItem("alba_offline_queue")) || [];

// --- SERVICE WORKER INITIALIZATION ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then(reg => console.log("✔ Service Worker Registered successfully", reg.scope))
      .catch(err => console.error("❌ Service Worker registration failed", err));
  });
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  renderFeed();
  setupTabListeners();
  setupOnlineListeners();
  setupGuideListeners();
  updateOfflineIndicator();
});

// --- RENDER CARD FEED ---
function renderFeed() {
  const feedGrid = document.getElementById("castle-feed");
  feedGrid.innerHTML = "";

  CASTLES_DATA.forEach(castle => {
    const card = document.createElement("div");
    card.className = "castle-card";
    card.onclick = () => openGuide(castle.id);

    // Dynamic rating showing combined state
    const averageRating = getAverageRating(castle);

    card.innerHTML = `
      <div class="castle-card-img-container">
        <img class="castle-card-img" src="assets/castle_hero.png" alt="${castle.title}">
        <div class="castle-card-overlay"></div>
        <span class="category-badge ${castle.category}">${castle.category}</span>
        <span class="castle-card-rating">★ ${averageRating.toFixed(1)}</span>
      </div>
      <div class="castle-card-body">
        <h3 class="castle-card-title">${castle.title}</h3>
        <p class="castle-card-subtitle">${castle.region}</p>
        <div class="castle-card-value">${castle.valuation}</div>
        <div class="castle-card-metrics">
          <span>🏰 ${castle.dungeons} Dung</span> • 
          <span>🛏️ ${castle.beds} Beds</span> • 
          <span>🌊 ${castle.moats} Moat</span> • 
          <span>📐 ${castle.acres} Ac</span>
        </div>
      </div>
    `;
    feedGrid.appendChild(card);
  });
}

// --- RENDER MY JOURNEY LISTS ---
function renderJourney() {
  const visitedList = document.getElementById("journey-visited-list");
  const savedList = document.getElementById("journey-saved-list");
  
  visitedList.innerHTML = "";
  savedList.innerHTML = "";

  const visitedItems = CASTLES_DATA.filter(c => visitedCastles.includes(c.id));
  const savedItems = CASTLES_DATA.filter(c => savedCastles.includes(c.id));

  // Render Visited
  if (visitedItems.length === 0) {
    visitedList.innerHTML = `<div class="empty-journey-state">No castles visited yet. Mark some in the guide sheet!</div>`;
  } else {
    visitedItems.forEach(castle => {
      visitedList.innerHTML += `
        <div class="journey-item-card" onclick="openGuide('${castle.id}')">
          <img class="journey-item-img" src="assets/castle_hero.png" alt="${castle.title}">
          <div class="journey-item-info">
            <h4 class="journey-item-name">${castle.title}</h4>
            <p class="journey-item-region">${castle.region}</p>
          </div>
          <span class="journey-item-badge">🚩 Visited</span>
        </div>
      `;
    });
  }

  // Render Saved
  if (savedItems.length === 0) {
    savedList.innerHTML = `<div class="empty-journey-state">No castles saved. Bookmark them to plan your trip!</div>`;
  } else {
    savedItems.forEach(castle => {
      savedList.innerHTML += `
        <div class="journey-item-card" onclick="openGuide('${castle.id}')">
          <img class="journey-item-img" src="assets/castle_hero.png" alt="${castle.title}">
          <div class="journey-item-info">
            <h4 class="journey-item-name">${castle.title}</h4>
            <p class="journey-item-region">${castle.region}</p>
          </div>
          <span class="journey-item-badge">⭐ Saved</span>
        </div>
      `;
    });
  }
}

// --- TAB NAV LISTENERS ---
function setupTabListeners() {
  const buttons = document.querySelectorAll(".dock-btn");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  activeTab = tabName;
  
  // Update Dock UI
  document.querySelectorAll(".dock-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
  });

  // Show Active Panel
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });

  // Special initializer for Leaflet Map
  if (tabName === "map") {
    setTimeout(initMap, 50);
  } else if (tabName === "journey") {
    renderJourney();
  }
}

// --- MAP ENGINE (LEAFLET) ---
function initMap() {
  if (map) return; // Map already exists

  // Center on Central Scotland
  map = L.map("map-container", {
    zoomControl: false
  }).setView([56.55, -4.2], 7);

  // Add premium high-resolution satellite imagery tiles (Esri World Imagery)
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USDA, USGS, and the GIS User Community',
    maxZoom: 19
  }).addTo(map);

  // Add Custom Pins
  CASTLES_DATA.forEach(castle => {
    const marker = L.marker([castle.lat, castle.lng]).addTo(map);
    
    // Custom styled popup
    const popupContent = `
      <div>
        <h4>${castle.title}</h4>
        <p>${castle.region}</p>
        <button onclick="openGuide('${castle.id}')">View Full Guide</button>
      </div>
    `;
    marker.bindPopup(popupContent);
  });
}

// --- DETAILED GUIDE OVERLAY SHEET ---
function openGuide(castleId) {
  const castle = CASTLES_DATA.find(c => c.id === castleId);
  if (!castle) return;

  currentCastleId = castleId;

  // Populate UI Fields
  document.getElementById("guide-title").innerText = castle.title;
  document.getElementById("guide-region").innerText = castle.region;
  document.getElementById("guide-description").innerText = castle.description;
  document.getElementById("guide-parking").innerText = castle.parking;
  document.getElementById("guide-photo-spot").innerText = castle.photoSpot;
  document.getElementById("guide-admission").innerText = castle.admission;

  // Real Estate Specs
  document.getElementById("guide-valuation").innerText = castle.valuation;
  document.getElementById("guide-dungeons").innerText = `${castle.dungeons} Dungeons`;
  document.getElementById("guide-beds").innerText = `${castle.beds} Beds`;
  document.getElementById("guide-moats").innerText = `${castle.moats} Moats`;
  document.getElementById("guide-acres").innerText = `${castle.acres} Acres`;

  // Trump Stats Bars, Ratings, and Stat Texts
  const trump = castle.trumpStats;
  document.getElementById("trump-age").style.width = `${(trump.age.rating / 5) * 100}%`;
  document.getElementById("trump-age-val").innerText = `${trump.age.rating}/5`;
  document.getElementById("trump-age-stat").innerText = trump.age.stat;
  
  document.getElementById("trump-defensibility").style.width = `${(trump.defensibility.rating / 5) * 100}%`;
  document.getElementById("trump-defensibility-val").innerText = `${trump.defensibility.rating}/5`;
  document.getElementById("trump-defensibility-stat").innerText = trump.defensibility.stat;
  
  document.getElementById("trump-lore").style.width = `${(trump.lore.rating / 5) * 100}%`;
  document.getElementById("trump-lore-val").innerText = `${trump.lore.rating}/5`;
  document.getElementById("trump-lore-stat").innerText = trump.lore.stat;
  
  document.getElementById("trump-repair").style.width = `${(trump.repair.rating / 5) * 100}%`;
  document.getElementById("trump-repair-val").innerText = `${trump.repair.rating}/5`;
  document.getElementById("trump-repair-stat").innerText = trump.repair.stat;
  
  document.getElementById("trump-livability").style.width = `${(trump.livability.rating / 5) * 100}%`;
  document.getElementById("trump-livability-val").innerText = `${trump.livability.rating}/5`;
  document.getElementById("trump-livability-stat").innerText = trump.livability.stat;

  // Film & TV Credits
  const filmContainer = document.getElementById("guide-film-credits");
  filmContainer.innerHTML = "";
  if (castle.filmCredits && castle.filmCredits.length > 0) {
    castle.filmCredits.forEach(credit => {
      filmContainer.innerHTML += `<span class="film-credit-badge">🎬 ${credit}</span>`;
    });
  } else {
    filmContainer.innerHTML = `<span style="font-size: 0.8rem; color: var(--text-muted);">No recorded screen appearances.</span>`;
  }

  const categoryBadge = document.getElementById("guide-category-badge");
  categoryBadge.className = `category-badge ${castle.category}`;
  categoryBadge.innerText = castle.category;

  // Update Buttons
  updateGuideButtonsState();

  // Populate Reviews List
  renderReviews();

  // Slide Sheet Up
  document.getElementById("guide-overlay").classList.add("open");
}

function updateGuideButtonsState() {
  const isVisited = visitedCastles.includes(currentCastleId);
  const isSaved = savedCastles.includes(currentCastleId);

  const visitedBtn = document.getElementById("guide-btn-visited");
  visitedBtn.classList.toggle("active", isVisited);
  document.getElementById("visited-text").innerText = isVisited ? "Conquered! 🚩" : "Mark Visited";

  const bookmarkBtn = document.getElementById("guide-btn-bookmark");
  bookmarkBtn.classList.toggle("active", isSaved);
  document.getElementById("bookmark-text").innerText = isSaved ? "Saved ⭐" : "Save to List";
}

function renderReviews() {
  const reviewsList = document.getElementById("reviews-list");
  reviewsList.innerHTML = "";

  const castle = CASTLES_DATA.find(c => c.id === currentCastleId);
  if (!castle) return;

  // Combine static mock reviews + local stored reviews + queued offline reviews
  const allReviews = [...castle.reviews];
  
  if (customReviews[currentCastleId]) {
    allReviews.push(...customReviews[currentCastleId]);
  }

  // Add queued reviews (mark as syncing)
  const queuedForThis = offlineReviewQueue.filter(r => r.castleId === currentCastleId);
  
  allReviews.forEach(rev => {
    reviewsList.innerHTML += `
      <div class="review-item">
        <div class="review-item-header">
          <span class="review-item-author">${rev.author}</span>
          <span class="review-item-rating">★ ${rev.rating}</span>
        </div>
        <p class="review-item-text">${rev.text}</p>
      </div>
    `;
  });

  queuedForThis.forEach(rev => {
    reviewsList.innerHTML += `
      <div class="review-item" style="border: 1px dashed #ffc107;">
        <div class="review-item-header">
          <span class="review-item-author">${rev.author}</span>
          <span class="review-item-rating">★ ${rev.rating}</span>
        </div>
        <p class="review-item-text">${rev.text}</p>
        <span class="review-item-syncing">⏳ Waiting for connection to sync...</span>
      </div>
    `;
  });
}

function setupGuideListeners() {
  document.getElementById("close-guide-btn").addEventListener("click", () => {
    document.getElementById("guide-overlay").classList.remove("open");
    renderFeed(); // update average ratings in feed
  });

  // Toggle Visited
  document.getElementById("guide-btn-visited").addEventListener("click", () => {
    const idx = visitedCastles.indexOf(currentCastleId);
    if (idx > -1) {
      visitedCastles.splice(idx, 1);
    } else {
      visitedCastles.push(currentCastleId);
    }
    localStorage.setItem("alba_visited", JSON.stringify(visitedCastles));
    updateGuideButtonsState();
  });

  // Toggle Bookmark
  document.getElementById("guide-btn-bookmark").addEventListener("click", () => {
    const idx = savedCastles.indexOf(currentCastleId);
    if (idx > -1) {
      savedCastles.splice(idx, 1);
    } else {
      savedCastles.push(currentCastleId);
    }
    localStorage.setItem("alba_saved", JSON.stringify(savedCastles));
    updateGuideButtonsState();
  });

  // Review Form Submit Handler
  document.getElementById("review-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const author = document.getElementById("review-author").value.trim();
    const rating = parseInt(document.getElementById("review-rating").value);
    const text = document.getElementById("review-text").value.trim();

    if (!author || !text) return;

    const newReview = { author, rating, text };

    if (navigator.onLine) {
      // Simulate direct cloud posting
      saveReviewDirectly(currentCastleId, newReview);
    } else {
      // Queue offline
      queueReviewOffline(currentCastleId, newReview);
    }

    // Reset Form
    document.getElementById("review-author").value = "";
    document.getElementById("review-text").value = "";
    renderReviews();
  });

  // Install App Trigger Listeners
  document.getElementById("install-app-btn").addEventListener("click", () => {
    document.getElementById("install-overlay").classList.add("open");
  });

  document.getElementById("close-install-btn").addEventListener("click", () => {
    document.getElementById("install-overlay").classList.remove("open");
  });
}

// --- REVIEW PERSISTENCE / QUEUE LOGIC ---
function saveReviewDirectly(castleId, review) {
  if (!customReviews[castleId]) {
    customReviews[castleId] = [];
  }
  customReviews[castleId].push(review);
  localStorage.setItem("alba_custom_reviews", JSON.stringify(customReviews));
}

function queueReviewOffline(castleId, review) {
  const queuedReview = { ...review, castleId, timestamp: Date.now() };
  offlineReviewQueue.push(queuedReview);
  localStorage.setItem("alba_offline_queue", JSON.stringify(offlineReviewQueue));
  alert("📡 App is offline. Review saved locally and will auto-sync when connection returns!");
}

// --- ONLINE/OFFLINE ORCHESTRATION ---
function setupOnlineListeners() {
  window.addEventListener("online", () => {
    updateOfflineIndicator();
    processOfflineQueue();
  });
  window.addEventListener("offline", updateOfflineIndicator);
}

function updateOfflineIndicator() {
  const badge = document.getElementById("offline-badge");
  if (badge) {
    badge.style.display = navigator.onLine ? "none" : "block";
  }
}

function processOfflineQueue() {
  if (offlineReviewQueue.length === 0) return;

  console.log(`Processing offline queue... syncing ${offlineReviewQueue.length} items.`);
  
  // Drain the queue and commit directly to customReviews (our simulated Firebase DB)
  offlineReviewQueue.forEach(item => {
    const review = { author: item.author, rating: item.rating, text: item.text };
    saveReviewDirectly(item.castleId, review);
  });

  // Clear queue
  offlineReviewQueue = [];
  localStorage.setItem("alba_offline_queue", JSON.stringify([]));

  alert("📡 Connection restored! Your queued castle reviews have synced successfully.");
  
  if (currentCastleId) {
    renderReviews();
  }
}

// --- UTILITY FUNCTIONS ---
function getAverageRating(castle) {
  const allReviews = [...castle.reviews];
  if (customReviews[castle.id]) {
    allReviews.push(...customReviews[castle.id]);
  }
  if (allReviews.length === 0) return 5.0;
  
  const sum = allReviews.reduce((acc, curr) => acc + curr.rating, 0);
  return sum / allReviews.length;
}
window.openGuide = openGuide; // Bind to window for Leaflet map callbacks
