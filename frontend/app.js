import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc,
  addDoc,
  increment,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// State Management
let currentUser = {
  uid: null,
  tier: "Verified Citizen", // Default
  username: "GuestReader"
};
let activeStatusFilter = "staged"; // staged, accepted, processed, rejected
let activeCategoryFilter = "all"; // all, politics, business, culture
let activeSortOrder = "newest"; // newest, top
let activeTimeFilter = "all"; // all, 24h, 3d
let unsubscribeFeed = null;
let unsubscribeOpinions = null;
let touchStartX = 0;
let touchStartY = 0;
let activeCurationCard = null;

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  setupMockAuth();
  setupEventListeners();
  registerServiceWorker();
});

// 1. Authentication & Identity Management
function setupMockAuth() {
  // Sign in anonymously to Firestore
  signInAnonymously(auth)
    .then((result) => {
      currentUser.uid = result.user.uid;
      
      // Load local tier settings if saved
      const savedTier = localStorage.getItem('mercury_user_tier');
      const savedName = localStorage.getItem('mercury_username');
      if (savedTier) currentUser.tier = savedTier;
      if (savedName) currentUser.username = savedName;
      
      updateProfileUI();
      syncUserProfileToFirestore();
      
      // Load feed once authenticated
      loadFeed();
    })
    .catch((error) => {
      console.error("Anonymous authentication failed:", error);
      // Fallback: load feed anyway (might fail if rules block, but works on local emulator)
      loadFeed();
    });
}

function syncUserProfileToFirestore() {
  if (!currentUser.uid) return;
  setDoc(doc(db, "users", currentUser.uid), {
    username: currentUser.username,
    tier: currentUser.tier,
    last_active: serverTimestamp()
  }, { merge: true }).catch(err => console.log("Profile sync failed (expected if rules restrict or offline):", err));
}

function updateProfileUI() {
  const avatarSpan = document.getElementById('profile-avatar');
  if (currentUser.tier === "Trustee") avatarSpan.textContent = "🏛️";
  else if (currentUser.tier === "Monitor") avatarSpan.textContent = "🕵️";
  else if (currentUser.tier === "Analyst") avatarSpan.textContent = "📊";
  else avatarSpan.textContent = "👤";
  
  // Highlight active tier in modal
  document.querySelectorAll('.identity-item').forEach(item => {
    if (item.getAttribute('data-tier') === currentUser.tier) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// 2. Load and Filter Feed
function loadFeed() {
  if (unsubscribeFeed) {
    unsubscribeFeed();
  }
  
  const feedContainer = document.getElementById('feed-container');
  feedContainer.innerHTML = `
    <div class="feed-skeleton">
      <div class="skeleton-card">
        <div class="skeleton-img"></div>
        <div class="skeleton-title"></div>
        <div class="skeleton-meta"></div>
        <div class="skeleton-text"></div>
      </div>
    </div>
  `;
  
  // Build Query
  let q;
  const storiesRef = collection(db, "stories");
  
  if (activeCategoryFilter === "all") {
    if (activeSortOrder === "newest") {
      q = query(
        storiesRef, 
        where("status", "==", activeStatusFilter),
        orderBy("created_at", "desc")
      );
    } else {
      q = query(
        storiesRef, 
        where("status", "==", activeStatusFilter),
        orderBy("score", "desc"),
        orderBy("created_at", "desc")
      );
    }
  } else {
    // Firestore queries are case-sensitive. Capitalize first letter of category: Politics, Business, Culture
    const formattedCat = activeCategoryFilter.charAt(0).toUpperCase() + activeCategoryFilter.slice(1);
    if (activeSortOrder === "newest") {
      q = query(
        storiesRef, 
        where("status", "==", activeStatusFilter),
        where("category", "==", formattedCat),
        orderBy("created_at", "desc")
      );
    } else {
      q = query(
        storiesRef, 
        where("status", "==", activeStatusFilter),
        where("category", "==", formattedCat),
        orderBy("score", "desc"),
        orderBy("created_at", "desc")
      );
    }
  }
  
  unsubscribeFeed = onSnapshot(q, (snapshot) => {
    feedContainer.innerHTML = "";
    
    if (snapshot.empty) {
      renderEmptyState();
      return;
    }
    
    let renderedCount = 0;
    const now = new Date();
    
    snapshot.forEach((doc) => {
      const story = doc.data();
      story.id = doc.id;
      
      // Client-Side Time Recency Filter
      if (activeTimeFilter !== "all") {
        let storyDate = null;
        if (story.created_at) {
          storyDate = story.created_at.seconds ? new Date(story.created_at.seconds * 1000) : new Date(story.created_at);
        } else if (story.published_date) {
          storyDate = new Date(story.published_date);
        }
        
        if (storyDate && !isNaN(storyDate.getTime())) {
          const ageMs = now - storyDate;
          const ageHours = ageMs / (1000 * 60 * 60);
          if (activeTimeFilter === "24h" && ageHours > 24) {
            return;
          }
          if (activeTimeFilter === "3d" && ageHours > 72) {
            return;
          }
        }
      }
      
      const cardElement = renderStoryCard(story);
      feedContainer.appendChild(cardElement);
      renderedCount++;
    });
    
    if (renderedCount === 0) {
      renderEmptyState();
      return;
    }
    
    // Add an end of feed placeholder card
    const endCard = document.createElement('div');
    endCard.className = 'feed-end-state';
    endCard.innerHTML = `
      <div class="end-icon">🍻</div>
      <h3>You're all caught up!</h3>
      <p>Latest Scottish ${activeCategoryFilter === 'all' ? 'politics, business & culture' : activeCategoryFilter} stories scraped hourly.</p>
    `;
    feedContainer.appendChild(endCard);
    
    setupGestureListeners();
  }, (error) => {
    console.error("Firestore feed snapshot error:", error);
    feedContainer.innerHTML = `
      <div class="feed-end-state">
        <div class="end-icon">⚠️</div>
        <h3>Failed to load feed</h3>
        <p>Ensure your Firebase Firestore database is initialized and credentials in firebase-config.js are correct.</p>
      </div>
    `;
  });
}

function renderEmptyState() {
  const feedContainer = document.getElementById('feed-container');
  feedContainer.innerHTML = `
    <div class="feed-end-state">
      <div class="end-icon">📭</div>
      <h3>No stories here</h3>
      <p>There are no stories in the <b>${activeStatusFilter}</b> queue for <b>${activeCategoryFilter}</b>.</p>
    </div>
  `;
}

function renderStoryCard(story) {
  const card = document.createElement('div');
  card.className = `news-card category-${story.category ? story.category.toLowerCase() : 'general'}`;
  card.setAttribute('data-id', story.id);
  card.style.height = "100%";
  
  // Clean fallback image
  const defaultImages = {
    'Politics': 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=600&fit=crop&q=80',
    'Business': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&fit=crop&q=80',
    'Culture': 'https://images.unsplash.com/photo-1472653423608-f9b208573136?w=600&fit=crop&q=80',
    'General': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&fit=crop&q=80'
  };
  const bgImage = story.lead_image_url || defaultImages[story.category] || defaultImages['General'];
  
  // Format Date
  let dateStr = "No Date";
  if (story.published_date) {
    try {
      const d = new Date(story.published_date);
      dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      dateStr = story.published_date.substring(0, 16);
    }
  }
  
  // Format snippet (strictly limit to prevent scrolling on card)
  const snippet = story.content_text ? story.content_text.substring(0, 130) + "..." : "No text extracted.";
  
  // Curation UI check
  const isCurationAllowed = currentUser.tier === "Monitor" || currentUser.tier === "Trustee";
  let curateButtonsHTML = "";
  if (activeStatusFilter === "staged") {
    curateButtonsHTML = `
      <div class="curate-buttons-container">
        <button class="curate-btn btn-reject" data-action="reject" ${!isCurationAllowed ? 'disabled style="opacity:0.3"' : ''}>✕</button>
        <button class="curate-btn btn-accept" data-action="accept" ${!isCurationAllowed ? 'disabled style="opacity:0.3"' : ''}>✓</button>
      </div>
    `;
  } else if (activeStatusFilter === "processed" && story.intelligence) {
    curateButtonsHTML = `
      <button class="intel-badge-trigger" data-action="intel">
        <span>📊</span> Inspect Intel
      </button>
    `;
  }
  
  card.innerHTML = `
    <img src="${bgImage}" class="card-bg-image" loading="lazy" alt="News Image">
    <div class="card-overlay"></div>
    
    <!-- Top Watermark Source -->
    <div class="card-source-watermark">
      <span>🏛️</span>
      <span>${story.source}</span>
    </div>
    
    <!-- Gesture Hints Overlay -->
    <div class="swipe-indicator swipe-left">✕</div>
    <div class="swipe-indicator swipe-right">✓</div>
    
    <!-- Right-Side Floating Actions Sidebar -->
    <div class="card-sidebar">
      <div class="vote-widget" data-id="${story.id}" style="display: flex; flex-direction: column; align-items: center; gap: 14px;">
        <button class="sidebar-action vote-btn vote-up ${localStorage.getItem('vote_' + story.id) === 'up' ? 'voted' : ''}" data-vote="up" title="Upvote">
          <div class="action-circle">▲</div>
          <span class="action-label vote-score">${story.score || 0}</span>
        </button>
        
        <button class="sidebar-action vote-btn vote-down ${localStorage.getItem('vote_' + story.id) === 'down' ? 'voted' : ''}" data-vote="down" title="Downvote">
          <div class="action-circle">▼</div>
        </button>
      </div>
      
      <button class="sidebar-action" data-action="intel" title="Read Opinions / Intel">
        <div class="action-circle">💬</div>
        <span class="action-label">Opinions</span>
      </button>
      
      <button class="sidebar-action" data-action="share" title="Share link">
        <div class="action-circle">🔗</div>
        <span class="action-label">Share</span>
      </button>
    </div>
    
    <div class="card-details">
      <span class="card-category-badge">${story.category}</span>
      <h2 class="card-title">${story.title}</h2>
      
      <div class="card-meta">
        <span class="meta-source">${story.source}</span>
        <div class="meta-divider"></div>
        <span class="meta-author">${story.author || 'Staff Writer'}</span>
        <div class="meta-divider"></div>
        <span class="meta-date">${dateStr}</span>
      </div>
      
      <p class="card-snippet">${snippet}</p>
      
      <div class="card-actions-wrapper">
        <button class="read-more-btn" data-action="expand">Full Story 📖</button>
        ${curateButtonsHTML}
      </div>
    </div>
  `;
  
  // Store full story text in element memory for cheap drawer expansion
  card.storyText = story.content_text;
  card.storyData = story;
  
  return card;
}

// 3. Touch Gesture Navigation & Swiping
function setupGestureListeners() {
  const cards = document.querySelectorAll('.news-card');
  const isCurationAllowed = currentUser.tier === "Monitor" || currentUser.tier === "Trustee";
  
  cards.forEach(card => {
    // Clean existing listeners
    card.removeEventListener('touchstart', handleTouchStart);
    card.removeEventListener('touchmove', handleTouchMove);
    card.removeEventListener('touchend', handleTouchEnd);
    
    // Swipe gestures only valid in Staged feed and for authorized curators
    if (activeStatusFilter === "staged" && isCurationAllowed) {
      card.addEventListener('touchstart', handleTouchStart, { passive: true });
      card.addEventListener('touchmove', handleTouchMove, { passive: false });
      card.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
  });
}

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  activeCurationCard = e.currentTarget;
  activeCurationCard.style.transition = 'none';
}

function handleTouchMove(e) {
  if (!activeCurationCard) return;
  
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;
  
  const diffX = currentX - touchStartX;
  const diffY = currentY - touchStartY;
  
  // If user is swiping horizontally more than vertically, intercept standard scroll snap
  if (Math.abs(diffX) > Math.abs(diffY)) {
    if (e.cancelable) e.preventDefault(); // Lock vertical scrolling
    
    // Rotate and translate card for elastic physical response
    const rotation = diffX * 0.08;
    activeCurationCard.style.transform = `translateX(${diffX}px) rotate(${rotation}deg)`;
    
    // Dynamic swipe overlay indicators
    const leftIndicator = activeCurationCard.querySelector('.swipe-indicator.swipe-left');
    const rightIndicator = activeCurationCard.querySelector('.swipe-indicator.swipe-right');
    
    if (diffX > 40) {
      // Swiping Right -> Accept
      rightIndicator.style.opacity = Math.min((diffX - 40) / 100, 0.9);
      leftIndicator.style.opacity = 0;
    } else if (diffX < -40) {
      // Swiping Left -> Reject
      leftIndicator.style.opacity = Math.min((Math.abs(diffX) - 40) / 100, 0.9);
      rightIndicator.style.opacity = 0;
    } else {
      leftIndicator.style.opacity = 0;
      rightIndicator.style.opacity = 0;
    }
  }
}

function handleTouchEnd(e) {
  if (!activeCurationCard) return;
  
  activeCurationCard.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
  
  const finalX = e.changedTouches[0].clientX;
  const diffX = finalX - touchStartX;
  const threshold = 130; // Trigger threshold in pixels
  const storyId = activeCurationCard.getAttribute('data-id');
  
  const leftIndicator = activeCurationCard.querySelector('.swipe-indicator.swipe-left');
  const rightIndicator = activeCurationCard.querySelector('.swipe-indicator.swipe-right');
  
  if (diffX > threshold) {
    // Confirmed Accept Curation
    activeCurationCard.style.transform = `translateX(120%) rotate(15deg)`;
    rightIndicator.style.opacity = 1;
    setTimeout(() => updateStoryStatus(storyId, 'accepted'), 200);
  } else if (diffX < -threshold) {
    // Confirmed Reject Curation
    activeCurationCard.style.transform = `translateX(-120%) rotate(-15deg)`;
    leftIndicator.style.opacity = 1;
    setTimeout(() => updateStoryStatus(storyId, 'rejected'), 200);
  } else {
    // Elastic reset snap back
    activeCurationCard.style.transform = 'translateX(0px) rotate(0deg)';
    leftIndicator.style.opacity = 0;
    rightIndicator.style.opacity = 0;
  }
  
  activeCurationCard = null;
}

// 4. Firestore Actions
function updateStoryStatus(storyId, newStatus) {
  const docRef = doc(db, "stories", storyId);
  updateDoc(docRef, {
    status: newStatus
  })
  .then(() => {
    console.log(`Story ${storyId} marked as ${newStatus}`);
    // Snap feed container position adjustments can be handled natively by scroll-snap
  })
  .catch(err => {
    console.error("Curation action write failed:", err);
    alert("Curation action failed. Check your Firebase credentials/rules.");
  });
}

// 5. Intelligence Bottom-Sheet & Details Drawer
function openIntelDrawer(story) {
  const drawer = document.getElementById('intel-drawer');
  document.getElementById('drawer-story-title').textContent = story.title;
  
  let dateStr = "No Date";
  if (story.published_date) {
    try {
      dateStr = new Date(story.published_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {}
  }
  document.getElementById('drawer-story-meta').textContent = `${story.source} | By ${story.author || 'Unknown'} | ${dateStr}`;
  
  const intel = story.intelligence;
  if (!intel) {
    // Default placeholder state (or if viewing staged/accepted before NLP runs)
    document.getElementById('sentiment-indicator').style.left = "50%";
    document.getElementById('sentiment-val-text').textContent = "0.00 (Unprocessed)";
    updateProgressRing('jti-author', 0);
    updateProgressRing('jti-date', 0);
    updateProgressRing('jti-depth', 0);
    document.getElementById('entities-container').innerHTML = '<span class="no-entities">Intelligence processing queue pending...</span>';
  } else {
    // 1. Sentiment slider mapping
    // Firestore score is -1.0 to +1.0. Map it to 0% to 100% position on the slider.
    const sentimentPct = ((intel.sentiment_score + 1) / 2) * 100;
    document.getElementById('sentiment-indicator').style.left = `${sentimentPct}%`;
    document.getElementById('sentiment-val-text').textContent = `${intel.sentiment_score.toFixed(2)}`;
    
    // 2. JTI Progress Rings mapping (0.0 to 1.0 -> 0% to 100%)
    const jti = intel.jti_metrics || {};
    updateProgressRing('jti-author', (jti.author_transparency || 0) * 100);
    updateProgressRing('jti-date', (jti.date_transparency || 0) * 100);
    updateProgressRing('jti-depth', (jti.content_depth || 0) * 100);
    
    // 3. Named Entities Rendering
    const entContainer = document.getElementById('entities-container');
    entContainer.innerHTML = "";
    
    const entities = intel.entities || [];
    if (entities.length === 0) {
      entContainer.innerHTML = '<span class="no-entities">No Named Entities extracted.</span>';
    } else {
      entities.forEach(ent => {
        const span = document.createElement('span');
        span.className = `entity-tag ${ent.label}`;
        span.innerHTML = `${ent.text} <small>${ent.label}</small>`;
        entContainer.appendChild(span);
      });
    }
  }
  
  drawer.setAttribute('data-story-id', story.id);
  loadOpinions(story.id);
  
  drawer.classList.add('open');
}

function updateProgressRing(id, percentage) {
  const ring = document.getElementById(`${id}-ring`);
  const text = document.getElementById(`${id}-text`);
  
  // stroke-dasharray="percentage, 100" maps percentage to circumference
  ring.setAttribute('stroke-dasharray', `${percentage}, 100`);
  text.textContent = `${Math.round(percentage)}%`;
}

// 6. Navigation Tabs & Header Listeners
function setupEventListeners() {
  // Bottom Nav tabs
  document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
      const activeBtn = e.currentTarget;
      activeBtn.classList.add('active');
      activeStatusFilter = activeBtn.getAttribute('data-status');
      loadFeed();
    });
  });
  
  // Category Filtering
  document.querySelectorAll('.category-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.category-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeCategoryFilter = e.target.getAttribute('data-category');
      loadFeed();
    });
  });
  
  // Profile / Identity Selector Modal open
  document.getElementById('profile-btn').addEventListener('click', () => {
    document.getElementById('identity-modal').classList.add('open');
  });
  
  // Identity Option clicking
  document.querySelectorAll('.identity-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const activeItem = e.currentTarget;
      const selectedTier = activeItem.getAttribute('data-tier');
      
      if ((selectedTier === "Monitor" || selectedTier === "Trustee") && !localStorage.getItem('mercury_is_qualified_monitor')) {
        showMonitorQuiz(selectedTier);
        return;
      }
      
      document.querySelectorAll('.identity-item').forEach(i => i.classList.remove('active'));
      activeItem.classList.add('active');
      
      currentUser.tier = selectedTier;
      
      // Standard usernames mapping to tiers
      const names = {
        'Trustee': 'TrusteeAdmin',
        'Monitor': 'MonitorEditor',
        'Analyst': 'AnalystResearcher',
        'Verified Citizen': 'CitizenReader'
      };
      currentUser.username = names[selectedTier];
      
      localStorage.setItem('mercury_user_tier', selectedTier);
      localStorage.setItem('mercury_username', currentUser.username);
      
      updateProfileUI();
      syncUserProfileToFirestore();
    });
  });
  
  // Close Identity Modal
  document.getElementById('close-identity-btn').addEventListener('click', () => {
    document.getElementById('identity-modal').classList.remove('open');
    // Force feed reload to bind/unbind curation gesture hooks based on new permissions
    loadFeed();
  });
  
  // Close Bottom Sheet Intel Drawer
  document.getElementById('close-drawer-btn').addEventListener('click', () => {
    document.getElementById('intel-drawer').classList.remove('open');
  });

  // Close Reader Overlay
  document.getElementById('reader-close-btn').addEventListener('click', closeReaderOverlay);
  
  // Delegate clicks on Feed Container cards (read full content / actions)
  document.getElementById('feed-container').addEventListener('click', (e) => {
    const target = e.target;
    
    // Intercept Voting button clicks
    const voteBtn = target.closest('.vote-btn');
    if (voteBtn) {
      e.stopPropagation();
      const widget = voteBtn.closest('.vote-widget');
      const storyId = widget.getAttribute('data-id');
      const voteType = voteBtn.getAttribute('data-vote');
      handleVote(storyId, voteType, widget);
      return;
    }
    
    const action = target.getAttribute('data-action') || target.parentElement?.getAttribute('data-action');
    if (!action) return;
    
    // Find parent card
    const card = target.closest('.news-card');
    if (!card) return;
    
    const storyId = card.getAttribute('data-id');
    const story = card.storyData;
    
    if (action === "expand") {
      openReaderOverlay(story);
    } else if (action === "share") {
      e.stopPropagation();
      if (navigator.share) {
        navigator.share({
          title: story.title,
          text: `Caledonian Mercury: ${story.title}`,
          url: story.url
        }).catch(err => console.log('Share error:', err));
      } else {
        navigator.clipboard.writeText(story.url)
          .then(() => alert("Story link copied to clipboard!"))
          .catch(err => console.error("Clipboard write failed:", err));
      }
    } else if (action === "accept") {
      updateStoryStatus(storyId, 'accepted');
    } else if (action === "reject") {
      updateStoryStatus(storyId, 'rejected');
    } else if (action === "intel") {
      openIntelDrawer(story);
    }
  });
  
  // Allow closing drawer by clicking the handle
  document.querySelector('.sheet-handle-container').addEventListener('click', () => {
    document.getElementById('intel-drawer').classList.remove('open');
  });

  // Sort Toggle Buttons
  const sortNewestBtn = document.getElementById('sort-newest-btn');
  const sortTopBtn = document.getElementById('sort-top-btn');
  
  if (sortNewestBtn && sortTopBtn) {
    sortNewestBtn.addEventListener('click', () => {
      sortNewestBtn.classList.add('active');
      sortNewestBtn.style.opacity = '1';
      sortTopBtn.classList.remove('active');
      sortTopBtn.style.opacity = '0.5';
      activeSortOrder = "newest";
      loadFeed();
    });
    
    sortTopBtn.addEventListener('click', () => {
      sortTopBtn.classList.add('active');
      sortTopBtn.style.opacity = '1';
      sortNewestBtn.classList.remove('active');
      sortNewestBtn.style.opacity = '0.5';
      activeSortOrder = "top";
      loadFeed();
    });
  }

  // Time Window Filter Buttons
  document.querySelectorAll('.time-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.time-filter-btn').forEach(b => {
        b.classList.remove('active');
        b.style.opacity = '0.5';
      });
      const activeBtn = e.currentTarget;
      activeBtn.classList.add('active');
      activeBtn.style.opacity = '1';
      activeTimeFilter = activeBtn.getAttribute('data-time');
      loadFeed();
    });
  });

  // Suggest a Story Link Form
  const submitStoryForm = document.getElementById('submit-story-form');
  if (submitStoryForm) {
    submitStoryForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const urlInput = document.getElementById('submit-story-url');
      const url = urlInput.value.trim();
      if (!url) return;
      
      const statusEl = document.getElementById('submit-story-status');
      
      addDoc(collection(db, "submissions"), {
        url: url,
        status: "pending",
        submitted_by: currentUser.uid || "anonymous",
        created_at: serverTimestamp()
      })
      .then(() => {
        urlInput.value = "";
        statusEl.style.display = "block";
        setTimeout(() => {
          statusEl.style.display = "none";
        }, 4000);
      })
      .catch(err => {
        console.error("Link submission failed:", err);
        alert("Failed to submit link. Please try again.");
      });
    });
  }

  // Submit Opinion Form
  const submitOpinionForm = document.getElementById('submit-opinion-form');
  const charCounter = document.getElementById('char-counter');
  const opinionContentInput = document.getElementById('opinion-content-input');
  
  if (opinionContentInput && charCounter) {
    opinionContentInput.addEventListener('input', () => {
      const len = opinionContentInput.value.length;
      charCounter.textContent = `${len} / 100 characters minimum`;
      if (len >= 100) {
        charCounter.style.color = '#28a745';
      } else {
        charCounter.style.color = 'rgba(255,255,255,0.4)';
      }
    });
  }
  
  if (submitOpinionForm) {
    submitOpinionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('opinion-title-input');
      const contentInput = document.getElementById('opinion-content-input');
      const statusEl = document.getElementById('submit-opinion-status');
      
      const activeStoryId = document.getElementById('intel-drawer').getAttribute('data-story-id');
      if (!activeStoryId) return;
      
      const title = titleInput.value.trim();
      const content = contentInput.value.trim();
      
      if (content.length < 100) {
        alert("Opinions must be at least 100 characters long.");
        return;
      }
      
      addDoc(collection(db, "opinions"), {
        story_id: activeStoryId,
        author_name: currentUser.username || "Anonymous Citizen",
        title: title,
        content: content,
        created_at: serverTimestamp()
      })
      .then(() => {
        titleInput.value = "";
        contentInput.value = "";
        if (charCounter) {
          charCounter.textContent = "0 / 100 characters minimum";
          charCounter.style.color = 'rgba(255,255,255,0.4)';
        }
        statusEl.style.display = "block";
        setTimeout(() => {
          statusEl.style.display = "none";
        }, 3000);
      })
      .catch(err => {
        console.error("Opinion submit failed:", err);
        alert("Error submitting opinion. Please try again.");
      });
    });
  }
}

// 7. PWA Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker registered successfully:', reg.scope);
        if (window.Notification && Notification.permission === 'default') {
          Notification.requestPermission().then(permission => {
            console.log('Notification permission status:', permission);
          });
        }
      })
      .catch(err => console.log('Service Worker registration failed:', err));
  }
}

function handleVote(storyId, voteType, widgetEl) {
  const key = `vote_${storyId}`;
  const currentVote = localStorage.getItem(key);
  
  let deltaUp = 0;
  let deltaDown = 0;
  let deltaScore = 0;
  
  if (voteType === 'up') {
    if (currentVote === 'up') {
      localStorage.removeItem(key);
      deltaUp = -1;
      deltaScore = -1;
    } else if (currentVote === 'down') {
      localStorage.setItem(key, 'up');
      deltaUp = 1;
      deltaDown = -1;
      deltaScore = 2;
    } else {
      localStorage.setItem(key, 'up');
      deltaUp = 1;
      deltaScore = 1;
    }
  } else if (voteType === 'down') {
    if (currentVote === 'down') {
      localStorage.removeItem(key);
      deltaDown = -1;
      deltaScore = 1;
    } else if (currentVote === 'up') {
      localStorage.setItem(key, 'down');
      deltaUp = -1;
      deltaDown = 1;
      deltaScore = -2;
    } else {
      localStorage.setItem(key, 'down');
      deltaDown = 1;
      deltaScore = -1;
    }
  }
  
  const scoreEl = widgetEl.querySelector('.vote-score');
  const upEl = widgetEl.querySelector('.vote-btn[data-vote="up"]');
  const downEl = widgetEl.querySelector('.vote-btn[data-vote="down"]');
  
  const newScore = parseInt(scoreEl.textContent) + deltaScore;
  scoreEl.textContent = newScore;
  
  const newVote = localStorage.getItem(key);
  if (upEl && downEl) {
    if (newVote === 'up') {
      upEl.classList.add('voted');
      downEl.classList.remove('voted');
    } else if (newVote === 'down') {
      downEl.classList.add('voted');
      upEl.classList.remove('voted');
    } else {
      upEl.classList.remove('voted');
      downEl.classList.remove('voted');
    }
    upEl.style.color = newVote === 'up' ? '#10b981' : 'rgba(255,255,255,0.6)';
    downEl.style.color = newVote === 'down' ? '#ef4444' : 'rgba(255,255,255,0.6)';
  }
  
  const docRef = doc(db, "stories", storyId);
  updateDoc(docRef, {
    upvotes: increment(deltaUp),
    downvotes: increment(deltaDown),
    score: increment(deltaScore)
  }).catch(err => {
    console.error("Failed to sync vote to Firestore:", err);
  });
}

function loadOpinions(storyId) {
  if (unsubscribeOpinions) unsubscribeOpinions();
  
  const opinionsContainer = document.getElementById('opinions-container');
  opinionsContainer.innerHTML = '<span class="no-opinions" style="font-size: 0.85rem; color: rgba(255,255,255,0.4);">Loading community opinions...</span>';
  
  const q = query(
    collection(db, "opinions"),
    where("story_id", "==", storyId),
    orderBy("created_at", "desc")
  );
  
  unsubscribeOpinions = onSnapshot(q, (snapshot) => {
    opinionsContainer.innerHTML = "";
    if (snapshot.empty) {
      opinionsContainer.innerHTML = '<span class="no-opinions" style="font-size: 0.85rem; color: rgba(255,255,255,0.4);">No community opinions submitted yet. Be the first to analyze!</span>';
      return;
    }
    
    snapshot.forEach(docSnap => {
      const op = docSnap.data();
      op.id = docSnap.id;
      const opEl = document.createElement('div');
      opEl.style.background = 'rgba(255,255,255,0.03)';
      opEl.style.padding = '10px';
      opEl.style.borderRadius = '6px';
      opEl.style.border = '1px solid rgba(255,255,255,0.05)';
      opEl.style.marginBottom = '10px';
      
      let dateStr = "Just now";
      if (op.created_at) {
        try {
          dateStr = new Date(op.created_at.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        } catch {}
      }
      
      opEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: rgba(255,255,255,0.5); margin-bottom: 4px;">
          <span style="font-weight: 600; color: #fff;">${op.author_name}</span>
          <span>${dateStr}</span>
        </div>
        <h4 style="margin: 0 0 5px 0; font-size: 0.85rem; color: #fff; font-weight: 600;">${op.title}</h4>
        <p style="margin: 0; font-size: 0.8rem; color: rgba(255,255,255,0.8); line-height: 1.4; white-space: pre-wrap;">${op.content}</p>
      `;
      opinionsContainer.appendChild(opEl);
    });
  }, (err) => {
    console.error("Opinions load failed:", err);
    opinionsContainer.innerHTML = '<span class="no-opinions" style="color: rgba(255,255,255,0.4);">Failed to load opinions.</span>';
  });
}

const QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "1. An article titled 'Holyrood is Doomed! Secret Funding Cuts Revealed!' is submitted. How should a Monitor handle this?",
    options: [
      "Approve it immediately to increase feed engagement.",
      "Reject or flag for sensationalism, rephrasing the title to be neutral and factual.",
      "Accept it, but flag it as positive sentiment."
    ],
    correct: 1
  },
  {
    id: 2,
    question: "2. A citizen suggests a paywalled story link. What is the correct protocol?",
    options: [
      "Reject it instantly since not all users can read it.",
      "Approve it only if it supports a particular political party.",
      "Accept it if it is a high-quality source, as the scraper extracts the full text and Stages it for review."
    ],
    correct: 2
  },
  {
    id: 3,
    question: "3. What is the primary purpose of our 100-character Citizen Micro-Opinions?",
    options: [
      "To restrict free speech and exclude low-income users.",
      "To increase the friction for low-effort toxicity, ensuring posts contribute structured analysis.",
      "To boost website ad revenues."
    ],
    correct: 1
  }
];

let activeQuizTier = null;

function showMonitorQuiz(targetTier) {
  activeQuizTier = targetTier;
  const panel = document.getElementById('monitor-assessment-panel');
  const container = document.getElementById('quiz-question-container');
  const msgEl = document.getElementById('quiz-result-msg');
  
  msgEl.style.display = "none";
  panel.style.display = "block";
  
  container.innerHTML = QUIZ_QUESTIONS.map(q => `
    <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
      <p style="font-size: 0.85rem; color: #fff; font-weight: 600; margin: 0 0 10px 0;">${q.question}</p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${q.options.map((opt, idx) => `
          <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: rgba(255,255,255,0.75); cursor: pointer;">
            <input type="radio" name="q-${q.id}" value="${idx}" style="margin-top: 2px;">
            <span>${opt}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
  
  // Wire buttons
  document.getElementById('quiz-submit-btn').onclick = submitMonitorQuiz;
  document.getElementById('quiz-cancel-btn').onclick = cancelMonitorQuiz;
  
  // Scroll panel into view
  panel.scrollIntoView({ behavior: 'smooth' });
}

function submitMonitorQuiz() {
  const msgEl = document.getElementById('quiz-result-msg');
  let score = 0;
  
  for (const q of QUIZ_QUESTIONS) {
    const selected = document.querySelector(`input[name="q-${q.id}"]:checked`);
    if (!selected) {
      msgEl.textContent = "Please answer all questions before submitting.";
      msgEl.style.color = "#dc3545";
      msgEl.style.display = "block";
      return;
    }
    if (parseInt(selected.value) === q.correct) {
      score++;
    }
  }
  
  if (score === QUIZ_QUESTIONS.length) {
    localStorage.setItem('mercury_is_qualified_monitor', 'true');
    msgEl.textContent = "✔ Congratulations! You passed the Curation Assessment. Curation role unlocked.";
    msgEl.style.color = "#28a745";
    msgEl.style.display = "block";
    
    setTimeout(() => {
      // Complete role assignment
      const targetItem = document.querySelector(`.identity-item[data-tier="${activeQuizTier}"]`);
      if (targetItem) {
        document.querySelectorAll('.identity-item').forEach(i => i.classList.remove('active'));
        targetItem.classList.add('active');
      }
      
      currentUser.tier = activeQuizTier;
      const names = {
        'Trustee': 'TrusteeAdmin',
        'Monitor': 'MonitorEditor'
      };
      currentUser.username = names[activeQuizTier];
      
      localStorage.setItem('mercury_user_tier', activeQuizTier);
      localStorage.setItem('mercury_username', currentUser.username);
      
      updateProfileUI();
      syncUserProfileToFirestore();
      
      document.getElementById('monitor-assessment-panel').style.display = "none";
    }, 2000);
  } else {
    msgEl.textContent = `❌ Score: ${score}/${QUIZ_QUESTIONS.length}. Assessment failed. Please review standard protocols and try again.`;
    msgEl.style.color = "#dc3545";
    msgEl.style.display = "block";
  }
}

function cancelMonitorQuiz() {
  document.getElementById('monitor-assessment-panel').style.display = "none";
  // Restore active identity view to current user tier
  updateProfileUI();
}

function openReaderOverlay(story) {
  const overlay = document.getElementById('reader-overlay');
  const titleEl = document.getElementById('reader-header-title');
  const bodyEl = document.getElementById('reader-body');
  const progressBar = document.getElementById('reader-progress-bar');
  
  titleEl.textContent = story.source || "Story Reader";
  progressBar.style.width = '0%';
  
  // Format Date
  let dateStr = "No Date";
  if (story.published_date) {
    try {
      const d = new Date(story.published_date);
      dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      dateStr = story.published_date;
    }
  }
  
  const defaultImages = {
    'Politics': 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=600&fit=crop&q=80',
    'Business': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&fit=crop&q=80',
    'Culture': 'https://images.unsplash.com/photo-1472653423608-f9b208573136?w=600&fit=crop&q=80',
    'General': 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&fit=crop&q=80'
  };
  const imgUrl = story.lead_image_url || defaultImages[story.category] || defaultImages['General'];
  
  bodyEl.innerHTML = `
    ${imgUrl ? `<img src="${imgUrl}" class="reader-image" alt="Article Image">` : ''}
    <div class="reader-meta">
      <span class="card-category-badge">${story.category}</span>
      <span class="meta-divider"></span>
      <span>${story.source}</span>
      <span class="meta-divider"></span>
      <span>${story.author || 'Staff Writer'}</span>
      <span class="meta-divider"></span>
      <span>${dateStr}</span>
    </div>
    <h1 class="reader-headline">${story.title}</h1>
    <div class="reader-text">${story.content_text || 'No content text available.'}</div>
  `;
  
  overlay.classList.add('open');
  bodyEl.scrollTop = 0;
  
  bodyEl.onscroll = () => {
    const scrollTotal = bodyEl.scrollHeight - bodyEl.clientHeight;
    if (scrollTotal > 0) {
      const progress = (bodyEl.scrollTop / scrollTotal) * 100;
      progressBar.style.width = `${progress}%`;
    }
  };
}

function closeReaderOverlay() {
  const overlay = document.getElementById('reader-overlay');
  overlay.classList.remove('open');
}

