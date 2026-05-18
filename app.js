// ========== CUSTOM MODAL SYSTEM ==========
window.customAlert = (message, title = "Notice") => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        modal.innerHTML = `<div class="custom-modal-content"><h3>${title}</h3><p>${message}</p><div class="custom-modal-buttons"><button class="confirm-btn">OK</button></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.confirm-btn').onclick = () => { modal.remove(); resolve(); };
    });
};
window.customConfirm = (message, title = "Confirm") => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        modal.innerHTML = `<div class="custom-modal-content"><h3>${title}</h3><p>${message}</p><div class="custom-modal-buttons"><button class="confirm-btn">Yes</button><button class="cancel-btn">No</button></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.confirm-btn').onclick = () => { modal.remove(); resolve(true); };
        modal.querySelector('.cancel-btn').onclick = () => { modal.remove(); resolve(false); };
    });
};
window.customPrompt = (message, defaultValue = "", title = "Input") => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        modal.innerHTML = `<div class="custom-modal-content"><h3>${title}</h3><p>${message}</p><input type="text" id="customPromptInput" value="${defaultValue.replace(/"/g, '&quot;')}" placeholder="Enter value..."><div class="custom-modal-buttons"><button class="confirm-btn">OK</button><button class="cancel-btn">Cancel</button></div></div>`;
        document.body.appendChild(modal);
        const input = modal.querySelector('#customPromptInput');
        modal.querySelector('.confirm-btn').onclick = () => { const val = input.value; modal.remove(); resolve(val); };
        modal.querySelector('.cancel-btn').onclick = () => { modal.remove(); resolve(null); };
        input.focus();
    });
};
window.alert = window.customAlert;
window.confirm = window.customConfirm;
window.prompt = window.customPrompt;

// ========== FIREBASE INIT ==========
const firebaseConfig = {
    apiKey: "AIzaSyCWliI60g90f-Ed4ydFBPbz027fo7N29tI",
    authDomain: "ceezy-website.firebaseapp.com",
    projectId: "ceezy-website",
    storageBucket: "ceezy-website.appspot.com",
    messagingSenderId: "59858219268",
    appId: "1:59858219268:web:placeholder"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const messaging = firebase.messaging();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// ========== SUPABASE INIT ==========
const SUPABASE_URL = 'https://brululwrccmvhlhevjkn.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_u8Mb93q3osN_qdtnD2nNBQ_2FNQu9BP';
let supabase = null;
try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false }
        });
        console.log('✅ Supabase initialized');
    } else {
        console.error('❌ Supabase SDK not loaded');
    }
} catch (err) {
    console.error('❌ Failed to initialize Supabase:', err);
}

let currentUser = null;
let heartbeatInterval = null;
let unsubscribeUser = null;
let currentChatPartner = null;
let typingTimeout = null;
let unsubscribeMessages = null;
let adminUnsubscribes = [];
let unsubscribeNotifications = null;

// ========== REFERRAL HELPERS ==========
function generateReferralCode() { return 'r' + Math.random().toString(36).substring(2, 8); }
async function applyReferral(refCode, newUserId) {
    const qRef = db.collection("users").where("referralCode", "==", refCode);
    const snap = await qRef.get(); if (snap.empty) return false;
    const referrerDoc = snap.docs[0]; const referrerId = referrerDoc.id;
    const now = Date.now(); const premiumDuration = 7 * 24 * 60 * 60 * 1000; const newUserDuration = 3 * 24 * 60 * 60 * 1000;
    const referrerData = referrerDoc.data(); const currentExpires = referrerData.premiumExpiresAt || 0;
    const newExpires = Math.max(currentExpires, now) + premiumDuration;
    await db.collection("users").doc(referrerId).update({
        isPremium: true, premiumPlan: 'gold', premiumExpiresAt: newExpires,
        features: { unlimitedSwipes: true, seeWhoLikedYou: true, readReceipts: false, boost: false },
        verified: true
    });
    await db.collection("users").doc(newUserId).update({
        isPremium: true, premiumPlan: 'gold', premiumExpiresAt: now + newUserDuration,
        features: { unlimitedSwipes: true, seeWhoLikedYou: true, readReceipts: false, boost: false },
        verified: true
    });
    return true;
}

// ========== PUSH NOTIFICATIONS ==========
const VAPID_KEY = 'BHnyCbC2nBzDa1LRhTzJDUYcKFa37ZmIi7c_v-AFjTbTjUTfhmiehI8LwnP93EJYm2A9Qs67JG3sqaiS10swqrA';
async function requestPushPermission() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await messaging.getToken({ vapidKey: VAPID_KEY });
            if (currentUser) { await db.collection("users").doc(currentUser.uid).update({ fcmToken: token }); }
        }
    } catch (err) { console.error('Push permission error:', err); }
}
messaging.onMessage((payload) => { showBrowserNotification(payload.notification.title, payload.notification.body); });

// ========== UPDATE BANNER ==========
async function checkForUpdates() {
    if (!currentUser) return;
    const q = db.collection("updates").where("active", "==", true).orderBy("timestamp", "desc").limit(1);
    const snap = await q.get();
    if (!snap.empty) { const data = snap.docs[0].data(); showUpdateBanner(data.message, data.type || 'info'); }
}
function showUpdateBanner(message, type = 'info') {
    const existing = document.getElementById('updateBanner'); if (existing) existing.remove();
    const banner = document.createElement('div'); banner.id = 'updateBanner'; banner.className = 'update-banner';
    banner.innerHTML = `<span>${message}</span><button class="close-btn" onclick="this.parentElement.remove()">✕</button>`;
    document.body.prepend(banner);
}

// ========== BROWSER NOTIFICATIONS ==========
function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'https://randomuser.me/api/portraits/lego/1.jpg' });
    }
}

// ========== REAL LIKES FIX ==========
async function refreshCurrentUser() {
    if (!currentUser) return;
    const snap = await db.collection("users").doc(currentUser.uid).get();
    if (snap.exists) currentUser = snap.data();
}

// ========== NOTIFICATIONS ==========
function showNotificationToast(message) {
    const toast = document.createElement('div'); toast.className = 'notification-toast';
    toast.innerText = message; document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
async function sendLikeNotification(fromUserId, toUserId, fromName) {
    await db.collection("notifications").add({
        toUserId: toUserId, fromUserId: fromUserId, fromName: fromName,
        type: "like", read: false, timestamp: Date.now()
    });
}
function listenForNotifications() {
    if (unsubscribeNotifications) unsubscribeNotifications();
    const q = db.collection("notifications").where("toUserId", "==", currentUser.uid).where("read", "==", false);
    unsubscribeNotifications = q.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const notif = change.doc.data();
                showNotificationToast(`💖 ${notif.fromName} liked you!`);
                showBrowserNotification('New Like!', `${notif.fromName} liked you!`);
                db.collection("notifications").doc(change.doc.id).update({ read: true });
            }
        });
    });
}

// ========== AUTH (with ban check & referral) – ORIGINAL LOGIN SYSTEM UNTOUCHED ==========
window.signupUser = async (email, password, name, age, gender, referralCode) => {
    try {
        const existingQuery = db.collection("users").where("email", "==", email);
        const existingSnap = await existingQuery.get();
        if (!existingSnap.empty) {
            const existingUser = existingSnap.docs[0].data();
            if (existingUser.banned === true) throw new Error("This email is banned from MEET.");
            throw new Error("Email already registered.");
        }
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        await userCred.user.updateProfile({ displayName: name });
        await userCred.user.sendEmailVerification();
        const uid = userCred.user.uid; const referralCodeOwn = generateReferralCode();
        await db.collection("users").doc(uid).set({
            uid, name, email, age: parseInt(age), gender,
            bio: "New here!", interests: [], profilePic: "", matches: [], swipes: [],
            swipesToday: 0, lastSwipeDate: Date.now(), blocked: [], reports: [],
            location: { lat: 40.7128, lng: -74.0060 }, createdAt: Date.now(),
            lastSeen: Date.now(), emailVerified: false,
            privacyLastSeen: true, privacyOnlineStatus: true,
            prefAgeMin: 18, prefAgeMax: 100, prefDistance: 50,
            isPremium: false, premiumPlan: "free", premiumExpiresAt: 0,
            features: { unlimitedSwipes: false, readReceipts: false, seeWhoLikedYou: false, boost: false },
            verified: false, intent: "Serious", introUrl: "", banned: false,
            referralCode: referralCodeOwn
        });
        if (referralCode && referralCode.trim()) { await applyReferral(referralCode.trim(), uid); }
        await customAlert("Account created! Verification email sent.", "Success");
        return userCred.user;
    } catch (err) { await customAlert(err.message, "Signup Error"); throw err; }
};

window.signInWithGoogle = async () => {
    try {
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (!userDoc.exists) {
            const refCode = generateReferralCode();
            await db.collection("users").doc(user.uid).set({
                uid: user.uid, name: user.displayName || user.email.split('@')[0], email: user.email,
                age: 25, gender: "Female", bio: "New here!", interests: [], profilePic: user.photoURL || "",
                matches: [], swipes: [], swipesToday: 0, lastSwipeDate: Date.now(), blocked: [], reports: [],
                location: { lat: 40.7128, lng: -74.0060 }, createdAt: Date.now(),
                lastSeen: Date.now(), emailVerified: true,
                privacyLastSeen: true, privacyOnlineStatus: true,
                prefAgeMin: 18, prefAgeMax: 100, prefDistance: 50,
                isPremium: false, premiumPlan: "free", premiumExpiresAt: 0,
                features: { unlimitedSwipes: false, readReceipts: false, seeWhoLikedYou: false, boost: false },
                verified: false, intent: "Serious", introUrl: "", banned: false,
                referralCode: refCode
            });
        } else {
            const data = userDoc.data();
            if (data.banned) { await auth.signOut(); throw new Error("Your account has been banned."); }
            await db.collection("users").doc(user.uid).update({ lastSeen: Date.now(), emailVerified: true });
        }
        return user;
    } catch (err) { await customAlert(err.message, "Google Sign-In Error"); throw err; }
};

window.loginUserFirebase = async (email, password) => {
    try {
        const userCred = await auth.signInWithEmailAndPassword(email, password);
        if (!userCred.user.emailVerified) { await customAlert("Please verify your email.", "Email Not Verified"); await auth.signOut(); throw new Error("Email not verified"); }
        const snap = await db.collection("users").doc(userCred.user.uid).get();
        const data = snap.data();
        if (data && data.banned) { await auth.signOut(); throw new Error("Your account has been banned."); }
        await db.collection("users").doc(userCred.user.uid).update({ lastSeen: Date.now(), emailVerified: true });
        return userCred.user;
    } catch (err) { throw err; }
};

// ========== QUICK PROFILE MODAL ==========
async function showQuickProfile(userId) {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return;
    const user = userDoc.data();
    const modal = document.createElement('div');
    modal.className = 'quick-profile-modal';
    modal.innerHTML = `
        <div class="quick-profile-content">
            <img src="${user.profilePic || 'https://randomuser.me/api/portraits/lego/1.jpg'}">
            <h3 style="color:white;">${user.name} ${user.verified ? '<i class="fas fa-check-circle" style="color:#3b82f6;"></i>' : ''}</h3>
            <p style="color:#ccc;">${user.age} years old</p>
            <p style="color:#ccc;">${user.bio || "No bio yet"}</p>
            <p style="color:#ccc;">🎯 ${user.intent || "Not set"}</p>
            <p style="color:#ccc;">❤️ ${user.interests?.join(', ') || "No interests"}</p>
            <button class="small-glass close-modal">Close</button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.close-modal').onclick = () => modal.remove();
}

// ========== EVENTS, INTRO, APPEALS ==========
async function loadEvents() {
    const eventsSnap = await db.collection("events").orderBy("date").get();
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const modal = document.createElement('div'); modal.className = 'stripe-modal';
    modal.innerHTML = `<h3>📅 Upcoming Events</h3><div id="eventsList"></div><button id="createEventBtn" class="gradient-btn">+ Create Event</button><button class="small-glass" id="closeEventsModal">Close</button>`;
    document.body.appendChild(modal);
    const eventsDiv = modal.querySelector('#eventsList');
    eventsDiv.innerHTML = events.map(e => `<div class="event-card" data-id="${e.id}"><strong>${e.title}</strong><br>📍 ${e.location}<br>🕒 ${new Date(e.date).toLocaleString()}<br>👥 ${e.attendees?.length || 0} attending<button class="small-glass rsvp-btn" data-id="${e.id}">${e.attendees?.includes(currentUser.uid) ? 'Leave' : 'Join'}</button></div>`).join('');
    modal.querySelectorAll('.rsvp-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation(); const eventId = btn.dataset.id; const eventRef = db.collection("events").doc(eventId);
        const eventSnap = await eventRef.get(); const attendees = eventSnap.data().attendees || [];
        if (attendees.includes(currentUser.uid)) await eventRef.update({ attendees: attendees.filter(id => id !== currentUser.uid) });
        else await eventRef.update({ attendees: [...attendees, currentUser.uid] });
        loadEvents();
    }));
    modal.querySelector('#createEventBtn').onclick = () => {
        customPrompt("Event title:", "", "Create Event").then(title => {
            if(title) customPrompt("Location:", "", "Location").then(location => {
                if(location) customPrompt("Date (YYYY-MM-DD HH:MM):", "", "Date").then(date => {
                    if(date) db.collection("events").add({ title, location, date: new Date(date).getTime(), creator: currentUser.uid, attendees: [currentUser.uid], createdAt: Date.now() }).then(() => loadEvents());
                });
            });
        });
    };
    modal.querySelector('#closeEventsModal').onclick = () => modal.remove();
}
async function uploadIntro(file) {
    const introRef = storage.ref(`intros/${currentUser.uid}/${Date.now()}_${file.name}`);
    await introRef.put(file); const url = await introRef.getDownloadURL();
    await db.collection("users").doc(currentUser.uid).update({ introUrl: url }); await customAlert("Intro uploaded!", "Success");
}
async function submitAppeal(reason) {
    await db.collection("appeals").add({ userId: currentUser.uid, reason, status: "pending", timestamp: Date.now() });
    await customAlert("Appeal submitted.", "Appeal");
}

// ========== ADMIN PANEL ==========
let isAdminLoggedIn = false;
async function renderAdminPanel() {
    if (!isAdminLoggedIn) return;
    adminUnsubscribes.forEach(unsub => unsub());
    adminUnsubscribes = [];
    const adminDiv = document.getElementById('adminPanelDiv') || (() => {
        const div = document.createElement('div');
        div.id = 'adminPanelDiv';
        div.className = 'admin-panel';
        document.getElementById('profileView').querySelector('.glass-card').appendChild(div);
        return div;
    })();
    adminDiv.innerHTML = `
        <h3>👑 Admin Panel</h3>
        <div class="admin-stats" id="adminStats"></div>
        <div class="admin-section">
            <h4>🔍 Ban User</h4>
            <input type="text" id="banUserSearchInput" placeholder="Enter user email or name" style="width:100%; padding:8px; border-radius:20px; background:rgba(255,255,255,0.2); border:none; color:white; margin-bottom:8px;">
            <button class="small-glass" id="searchUserForBanBtn">Search</button>
            <div id="banUserSearchResults" style="margin-top:8px;"></div>
        </div>
        <div class="admin-section">
            <h4>🚫 Banned Users</h4>
            <div id="bannedList"></div>
        </div>
        <div class="admin-section">
            <h4>📢 Appeals</h4>
            <div id="appealsList"></div>
        </div>
        <div class="admin-section">
            <h4>⚠️ Reports</h4>
            <div id="reportsList"></div>
        </div>
        <button class="small-glass" id="adminLogoutBtn">Logout</button>
    `;
    document.getElementById('searchUserForBanBtn').addEventListener('click', async () => {
        const searchTerm = document.getElementById('banUserSearchInput').value.trim().toLowerCase();
        if (!searchTerm) return;
        const usersSnap = await db.collection("users").get();
        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const results = users.filter(u => 
            u.email?.toLowerCase().includes(searchTerm) || 
            u.name?.toLowerCase().includes(searchTerm)
        ).slice(0, 10);
        const resultsDiv = document.getElementById('banUserSearchResults');
        if (results.length === 0) { resultsDiv.innerHTML = '<p style="color:#ccc;">No users found.</p>'; return; }
        resultsDiv.innerHTML = results.map(u => `
            <div class="admin-item" style="display:flex; justify-content:space-between; align-items:center;">
                <span>${u.name} (${u.email}) ${u.banned ? '<span style="color:#ff6b6b;">[BANNED]</span>' : ''}</span>
                ${!u.banned ? `<button class="small-glass ban-user-btn" data-id="${u.id}" data-name="${u.name}">Ban</button>` : `<button class="small-glass unban-user-btn" data-id="${u.id}" data-name="${u.name}">Unban</button>`}
            </div>
        `).join('');
        document.querySelectorAll('.ban-user-btn').forEach(btn => btn.addEventListener('click', async () => {
            const userId = btn.dataset.id; const userName = btn.dataset.name;
            if (await customConfirm(`Ban user ${userName}?`, "Confirm Ban")) {
                await db.collection("users").doc(userId).update({ banned: true });
                await customAlert(`User ${userName} has been banned.`, "Banned");
                renderAdminPanel();
            }
        }));
        document.querySelectorAll('.unban-user-btn').forEach(btn => btn.addEventListener('click', async () => {
            const userId = btn.dataset.id; const userName = btn.dataset.name;
            if (await customConfirm(`Unban user ${userName}?`, "Confirm Unban")) {
                await db.collection("users").doc(userId).update({ banned: false });
                await customAlert(`User ${userName} has been unbanned.`, "Unbanned");
                renderAdminPanel();
            }
        }));
    });
    const usersQuery = db.collection("users");
    const unsubUsers = usersQuery.onSnapshot(snap => {
        const users = snap.docs.map(d => d.data());
        const totalUsers = users.length;
        const premiumUsers = users.filter(u => u.isPremium === true).length;
        const bannedUsers = users.filter(u => u.banned === true);
        document.getElementById('adminStats').innerHTML = `
            <div class="stat-card">Total Users: ${totalUsers}</div>
            <div class="stat-card">Premium: ${premiumUsers}</div>
            <div class="stat-card">Banned: ${bannedUsers.length}</div>
        `;
        document.getElementById('bannedList').innerHTML = bannedUsers.map(u => 
            `<div class="admin-item">${u.name} (${u.email})</div>`
        ).join('') || '<div class="admin-item">None</div>';
    });
    adminUnsubscribes.push(unsubUsers);
    document.getElementById('adminLogoutBtn').onclick = () => { isAdminLoggedIn = false; adminDiv.remove(); adminUnsubscribes.forEach(u=>u()); };
}

// ========== CORE APP FUNCTIONS ==========
async function getAvailableProfiles() {
    const users = await db.collection("users").get();
    return users.docs.map(d => d.data()).filter(u => 
        u.uid !== currentUser.uid && 
        !currentUser.swipes?.includes(u.uid) && 
        !currentUser.blocked?.includes(u.uid) && 
        u.banned !== true
    );
}
function computeCompatibility(user) {
    let shared = (currentUser.interests || []).filter(i => (user.interests || []).includes(i)).length;
    let maxInterests = Math.max((currentUser.interests || []).length, (user.interests || []).length);
    let interestScore = maxInterests ? (shared / maxInterests) * 50 : 0;
    let ageScore = Math.max(0, 50 - Math.abs(currentUser.age - user.age) * 2);
    return Math.min(100, Math.floor(interestScore + ageScore));
}
async function renderSwipeCards() {
    let available = await getAvailableProfiles();
    if(available.length === 0){ 
        document.getElementById('cardsStack').innerHTML = `<div class="glass-card">No more profiles</div>`; 
        return; 
    }
    let idx = 0; const container = document.getElementById('cardsStack');
    function display() {
        if(idx >= available.length) return;
        const p = available[idx];
        container.innerHTML = `<div class="swipe-card quality-match"><img class="card-img" src="${p.profilePic}"><h3>${p.name}, ${p.age}</h3><p>${p.bio}</p><div>🎯 Intent: ${p.intent}</div><div>❤️ Compatibility: ${computeCompatibility(p)}%</div><button class="small-glass report-profile-btn" data-id="${p.uid}">Report</button></div>`;
        const reportBtn = container.querySelector('.report-profile-btn');
        if(reportBtn) reportBtn.addEventListener('click', (e) => { e.stopPropagation(); showReportModal(p.uid, p.name); });
    }
    display();
    document.getElementById('likeBtn').onclick = async () => {
        if(idx >= available.length) return;
        const canSwipe = await checkDailySwipes();
        if (!canSwipe) { await customAlert("Daily swipe limit reached! Upgrade to premium for unlimited swipes.", "Limit Reached"); return; }
        const target = available[idx];
        const swipes = currentUser.swipes || [];
        swipes.push(target.uid);
        await db.collection("users").doc(currentUser.uid).update({ swipes: firebase.firestore.FieldValue.arrayUnion(target.uid), swipesToday: (currentUser.swipesToday || 0) + 1 });
        await sendLikeNotification(currentUser.uid, target.uid, currentUser.name);
        if(target.swipes && target.swipes.includes(currentUser.uid)) {
            const matches = currentUser.matches || [];
            if(!matches.includes(target.uid)) {
                matches.push(target.uid);
                await db.collection("users").doc(currentUser.uid).update({ matches: firebase.firestore.FieldValue.arrayUnion(target.uid) });
                const targetMatches = target.matches || [];
                if(!targetMatches.includes(currentUser.uid)) {
                    targetMatches.push(currentUser.uid);
                    await db.collection("users").doc(target.uid).update({ matches: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
                }
                document.getElementById('matchToast').style.display = 'block';
                setTimeout(() => document.getElementById('matchToast').style.display = 'none', 3000);
                await customAlert(`🎉 New match with ${target.name}!`, "Match!");
            }
        } else {
            await customAlert(`Liked ${target.name}!`, "Like Sent");
        }
        idx++;
        await refreshCurrentUser();
        await renderProfileUI();
        await checkDailySwipes();
        if(idx < available.length) display();
        else await renderSwipeCards();
    };
    document.getElementById('passBtn').onclick = async () => {
        if(idx >= available.length) return;
        const canSwipe = await checkDailySwipes();
        if (!canSwipe) { await customAlert("Daily swipe limit reached! Upgrade to premium for unlimited swipes.", "Limit Reached"); return; }
        const swipes = currentUser.swipes || [];
        swipes.push(available[idx].uid);
        await db.collection("users").doc(currentUser.uid).update({ swipes: firebase.firestore.FieldValue.arrayUnion(available[idx].uid), swipesToday: (currentUser.swipesToday || 0) + 1 });
        idx++;
        await refreshCurrentUser();
        await renderProfileUI();
        await checkDailySwipes();
        if(idx < available.length) display();
        else await renderSwipeCards();
    };
    await checkDailySwipes();
}
async function checkDailySwipes() {
    if (currentUser.features?.unlimitedSwipes === true) {
        document.getElementById('swipeCounter').innerText = `✨ Unlimited swipes (Premium) ✨`;
        return true;
    }
    const today = new Date().toDateString();
    const lastSwipeDate = currentUser.lastSwipeDate ? new Date(currentUser.lastSwipeDate).toDateString() : null;
    if (lastSwipeDate !== today) {
        await db.collection("users").doc(currentUser.uid).update({ swipesToday: 0, lastSwipeDate: Date.now() });
        currentUser.swipesToday = 0;
    }
    const remaining = Math.max(0, 20 - (currentUser.swipesToday || 0));
    document.getElementById('swipeCounter').innerText = `Swipes remaining today: ${remaining}`;
    return remaining > 0;
}
async function renderExplore() {
    let users = await db.collection("users").get();
    let filtered = users.docs.map(d => d.data()).filter(u => u.uid !== currentUser.uid && !currentUser.blocked?.includes(u.uid) && u.banned !== true);
    const minAge = parseInt(document.getElementById('filterAgeMin').value) || 18;
    const maxAge = parseInt(document.getElementById('filterAgeMax').value) || 100;
    const maxDistance = parseInt(document.getElementById('filterDistance').value) || 100;
    const intent = document.getElementById('filterIntent').value;
    const gender = document.getElementById('filterGender').value;
    if(gender) filtered = filtered.filter(u => u.gender === gender);
    if(intent) filtered = filtered.filter(u => u.intent === intent);
    filtered = filtered.filter(u => u.age >= minAge && u.age <= maxAge);
    if(currentUser.location && currentUser.location.lat) {
        const haversine = (loc1, loc2) => {
            if(!loc1 || !loc2) return Infinity;
            const R = 6371;
            const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
            const dLon = (loc2.lng - loc1.lng) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 + Math.cos(loc1.lat * Math.PI/180) * Math.cos(loc2.lat * Math.PI/180) * Math.sin(dLon/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        };
        filtered = filtered.filter(u => u.location && haversine(currentUser.location, u.location) <= maxDistance);
    }
    const pendingLikes = users.docs.map(d => d.data()).filter(u => u.swipes && u.swipes.includes(currentUser.uid) && !currentUser.swipes?.includes(u.uid));
    const matchQueueDiv = document.getElementById('matchQueue');
    if(currentUser.features?.seeWhoLikedYou === true) {
        matchQueueDiv.style.display = 'block';
        document.getElementById('pendingLikesList').innerHTML = pendingLikes.slice(0,5).map(u => `<div style="padding:8px;"><img src="${u.profilePic}" width="40" style="border-radius:50%;"> ${u.name}, ${u.age} <button class="small-glass like-back" data-id="${u.uid}">Like Back</button></div>`).join('');
        document.querySelectorAll('.like-back').forEach(btn => btn.addEventListener('click', async () => {
            const targetId = btn.dataset.id;
            const swipes = currentUser.swipes || [];
            if(!swipes.includes(targetId)) {
                swipes.push(targetId);
                await db.collection("users").doc(currentUser.uid).update({ swipes: firebase.firestore.FieldValue.arrayUnion(targetId) });
                currentUser.swipes = swipes;
                const target = users.docs.find(d => d.id === targetId).data();
                if(target.swipes && target.swipes.includes(currentUser.uid)) {
                    const matches = currentUser.matches || [];
                    if(!matches.includes(targetId)) {
                        matches.push(targetId);
                        await db.collection("users").doc(currentUser.uid).update({ matches: firebase.firestore.FieldValue.arrayUnion(targetId) });
                        currentUser.matches = matches;
                        await customAlert(`✨ Matched with ${target.name}! ✨`, "Match!");
                    }
                }
                renderExplore();
            }
        }));
    } else { matchQueueDiv.style.display = 'none'; }
    document.getElementById('exploreList').innerHTML = filtered.map(u => `<div class="explore-card"><img src="${u.profilePic}" width="80" style="border-radius:50%;"><h4>${u.name}, ${u.age}</h4><button class="small-glass explore-like" data-id="${u.uid}">Like</button><button class="small-glass report-btn" data-id="${u.uid}">Report</button></div>`).join('');
    document.querySelectorAll('.explore-like').forEach(btn => btn.addEventListener('click', async () => {
        const targetId = btn.dataset.id;
        const swipes = currentUser.swipes || [];
        if(!swipes.includes(targetId)) {
            swipes.push(targetId);
            await db.collection("users").doc(currentUser.uid).update({ swipes: firebase.firestore.FieldValue.arrayUnion(targetId) });
            currentUser.swipes = swipes;
            await sendLikeNotification(currentUser.uid, targetId, currentUser.name);
            await customAlert("Liked!", "Success");
            renderExplore();
        }
    }));
    document.querySelectorAll('.report-btn').forEach(btn => btn.addEventListener('click', () => {
        const targetId = btn.dataset.id;
        const target = filtered.find(u => u.uid === targetId);
        showReportModal(targetId, target?.name);
    }));
}
function showReportModal(userId, userName) {
    const modal = document.createElement('div'); modal.className = 'report-modal';
    modal.innerHTML = `<h3>Report ${userName}</h3><button data-reason="Spam">Spam</button><button data-reason="Inappropriate">Inappropriate</button><button data-reason="Fake Profile">Fake Profile</button><button data-reason="Harassment">Harassment</button><button data-reason="Other">Other</button><button id="closeReportModal">Cancel</button>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-reason]').forEach(btn => btn.addEventListener('click', async () => {
        await db.collection("reports").add({ reporterId: currentUser.uid, reportedId: userId, reason: btn.dataset.reason, timestamp: Date.now() });
        modal.remove();
        await customAlert("Reported.", "Report");
    }));
    modal.querySelector('#closeReportModal').onclick = () => modal.remove();
}

// ========== CHAT LIST (with unread dots) ==========
async function renderChatList() {
    const container = document.getElementById('chatListContainer');
    const matches = currentUser.matches || [];
    if(matches.length === 0){ container.innerHTML = `<div class="glass-card">No matches yet. Start swiping!</div>`; return; }
    const users = (await db.collection("users").get()).docs.map(d => d.data());
    const matchedUsers = users.filter(u => matches.includes(u.uid) && u.banned !== true);
    const chatItems = await Promise.all(matchedUsers.map(async (m) => {
        const chatId = [currentUser.uid, m.uid].sort().join('_');
        const unreadSnap = await db.collection("chats").doc(chatId).collection("messages")
            .where("senderId", "==", m.uid).where("read", "==", false).limit(1).get();
        return { ...m, hasUnread: !unreadSnap.empty };
    }));
    container.innerHTML = chatItems.map(m => `
        <div class="chat-list-item" data-id="${m.uid}">
            <div style="position:relative;"><img class="avatar" src="${m.profilePic}">${m.privacyOnlineStatus !== false && (Date.now() - (m.lastSeen||0) < 60000) ? '<span class="online-dot"></span>' : ''}</div>
            <div class="chat-info"><div class="chat-name">${m.name}${m.verified ? '<i class="fas fa-check-circle verified-icon"></i>' : ''}${m.hasUnread ? '<span class="unread-dot"></span>' : ''}</div><div class="last-msg">Tap to chat</div></div>
            <div class="chat-meta"><button class="small-glass block-chat-btn" data-id="${m.uid}">Block</button></div>
        </div>
    `).join('');
    document.querySelectorAll('.chat-list-item').forEach(el => el.addEventListener('click', (e) => { if(!e.target.classList.contains('block-chat-btn')) openChatScreen(el.dataset.id); }));
    document.querySelectorAll('.block-chat-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation(); const targetId = btn.dataset.id;
        const confirm = await customConfirm(`Block ${users.find(u=>u.uid===targetId)?.name}?`, "Block User");
        if(confirm) { const blocked = currentUser.blocked || []; blocked.push(targetId); await db.collection("users").doc(currentUser.uid).update({ blocked: firebase.firestore.FieldValue.arrayUnion(targetId) }); currentUser.blocked = blocked; renderChatList(); }
    }));
}

// ========== FULL-SCREEN CHAT WITH IMAGE/VOICE (FIXED) ==========
async function openChatScreen(partnerId) {
    if(currentUser.verified !== true) { await customAlert("You must verify your identity before chatting.", "Verification Required"); return; }
    currentChatPartner = partnerId;
    const users = (await db.collection("users").get()).docs.map(d => d.data());
    const partner = users.find(u => u.uid === partnerId);
    document.getElementById('chatListContainer').style.display = 'none';
    const screenDiv = document.getElementById('chatScreenContainer');
    screenDiv.style.display = 'block';
    screenDiv.classList.add('fullscreen');
    let statusText = '';
    if(partner.privacyOnlineStatus !== false && (Date.now() - (partner.lastSeen||0) < 60000)) statusText = 'Online';
    else if(partner.privacyLastSeen !== false && partner.lastSeen) statusText = new Date(partner.lastSeen).toLocaleTimeString();
    else statusText = 'Offline';
    screenDiv.innerHTML = `
        <div class="chat-header"><button class="back-btn" id="backToChatList"><i class="fas fa-arrow-left"></i></button><div class="chat-profile" data-id="${partner.uid}"><img src="${partner.profilePic}" id="chatAvatar"><div><div class="chat-name">${partner.name} ${partner.verified ? '<i class="fas fa-check-circle verified-icon"></i>' : ''}</div><div class="chat-status" id="chatStatus">${statusText}</div><div id="typingStatus" style="font-size:0.7rem;"></div></div></div><div class="chat-actions"><i class="fas fa-phone" id="callDemo"></i><i class="fas fa-video" id="videoDemo"></i><i class="fas fa-ban" id="blockFromChat"></i><i class="fas fa-ellipsis-v" id="menuUnmatch"></i></div></div>
        <div class="messages-area" id="messagesArea"></div>
        <div class="input-area"><div class="chat-attach-btns"><button id="sendImageBtn" title="Send Image"><i class="fas fa-image"></i></button><button id="sendVoiceBtn" title="Send Voice"><i class="fas fa-microphone"></i></button></div><input type="text" id="messageInputChat" placeholder="Type a message..."><button id="sendChatMsg"><i class="fas fa-paper-plane"></i></button></div>
    `;
    document.querySelector('.chat-profile').addEventListener('click', () => showQuickProfile(partner.uid));
    document.getElementById('backToChatList').onclick = () => { screenDiv.style.display = 'none'; screenDiv.classList.remove('fullscreen'); document.getElementById('chatListContainer').style.display = 'block'; if(unsubscribeMessages) unsubscribeMessages(); renderChatList(); };
    const chatId = [currentUser.uid, partnerId].sort().join('_');
    
    // Image upload via Supabase (FIXED)
    document.getElementById('sendImageBtn').addEventListener('click', () => {
        if (!supabase) { customAlert("Upload service unavailable. Please try again later.", "Error"); return; }
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0]; if (!file) return;
            if (file.size > 10 * 1024 * 1024) { customAlert("Image must be less than 10MB.", "Error"); return; }
            const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            try {
                const { error } = await supabase.storage.from('chat-images').upload(fileName, file);
                if (error) { console.error('Upload error:', error); customAlert("Image upload failed. Please check your connection.", "Error"); return; }
                const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(fileName);
                await db.collection("chats").doc(chatId).collection("messages").add({ senderId: currentUser.uid, text: urlData.publicUrl, type: 'image', timestamp: Date.now(), status: "sent", read: false });
            } catch (err) { console.error('Upload error:', err); customAlert("Image upload failed.", "Error"); }
        };
        input.click();
    });
    
    // Voice recording via Supabase (FIXED)
    let mediaRecorder, audioChunks = [];
    document.getElementById('sendVoiceBtn').addEventListener('click', async () => {
        if (!supabase) { customAlert("Upload service unavailable.", "Error"); return; }
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                audioChunks = [];
                mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
                mediaRecorder.onstop = async () => {
                    if (audioChunks.length === 0) { customAlert("No audio recorded.", "Error"); return; }
                    const blob = new Blob(audioChunks, { type: 'audio/webm' });
                    const fileName = `${Date.now()}_voice.webm`;
                    try {
                        const { error } = await supabase.storage.from('voice-messages').upload(fileName, blob);
                        if (error) { console.error('Upload error:', error); customAlert("Voice upload failed.", "Error"); return; }
                        const { data: urlData } = supabase.storage.from('voice-messages').getPublicUrl(fileName);
                        await db.collection("chats").doc(chatId).collection("messages").add({ senderId: currentUser.uid, text: urlData.publicUrl, type: 'voice', timestamp: Date.now(), status: "sent", read: false });
                    } catch (err) { console.error('Upload error:', err); customAlert("Voice upload failed.", "Error"); }
                    document.getElementById('sendVoiceBtn').innerHTML = '<i class="fas fa-microphone"></i>';
                };
                mediaRecorder.start();
                document.getElementById('sendVoiceBtn').innerHTML = '<i class="fas fa-stop" style="color:red;"></i>';
            } catch (err) {
                console.error('Microphone error:', err);
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    customAlert("Microphone access denied. Please allow microphone permissions in your browser settings.", "Permission Denied");
                } else {
                    customAlert("Could not access microphone.", "Error");
                }
            }
        } else {
            mediaRecorder.stop();
        }
    });
    
    const typingRef = db.collection("typing").doc(`${currentUser.uid}_${partnerId}`);
    typingRef.onSnapshot(doc => { if(doc.exists && doc.data().isTyping && doc.data().userId === partnerId) document.getElementById('typingStatus').innerHTML = "typing..."; else document.getElementById('typingStatus').innerHTML = ""; });
    const input = document.getElementById('messageInputChat');
    input.addEventListener('input', async () => { await typingRef.set({ userId: currentUser.uid, isTyping: true, timestamp: Date.now() }); if(typingTimeout) clearTimeout(typingTimeout); typingTimeout = setTimeout(async () => { await typingRef.set({ userId: currentUser.uid, isTyping: false, timestamp: Date.now() }); }, 1000); });
    const q = db.collection("chats").doc(chatId).collection("messages").orderBy("timestamp");
    if(unsubscribeMessages) unsubscribeMessages();
    unsubscribeMessages = q.onSnapshot(async snapshot => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const messagesArea = document.getElementById('messagesArea');
        messagesArea.innerHTML = messages.map(msg => {
            const isSent = msg.senderId === currentUser.uid; const time = new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let statusHtml = '';
            if(isSent && currentUser.features?.readReceipts === true) { if(msg.status === 'sent') statusHtml = '<span class="message-status status-sent">✓</span>'; else if(msg.status === 'delivered') statusHtml = '<span class="message-status status-delivered">✓✓</span>'; else if(msg.status === 'read') statusHtml = '<span class="message-status status-read">✓✓</span>'; }
            if (msg.type === 'image') return `<div class="message-bubble ${isSent ? 'sent' : 'received'}"><img src="${msg.text}" style="max-width:200px; border-radius:12px;"><div class="message-time">${time} ${statusHtml}</div></div>`;
            if (msg.type === 'voice') return `<div class="message-bubble ${isSent ? 'sent' : 'received'}"><audio controls src="${msg.text}" style="max-width:200px;"></audio><div class="message-time">${time} ${statusHtml}</div></div>`;
            return `<div class="message-bubble ${isSent ? 'sent' : 'received'}"><div class="message-text">${msg.text}</div><div class="message-time">${time} ${statusHtml}</div></div>`;
        }).join('');
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
    document.getElementById('sendChatMsg').onclick = async () => { const text = input.value.trim(); if(!text) return; await db.collection("chats").doc(chatId).collection("messages").add({ senderId: currentUser.uid, text, timestamp: Date.now(), status: "sent", read: false }); input.value = ''; };
}

// ========== CHAT SEARCH ==========
document.getElementById('chatSearchInput')?.addEventListener('input', function(e) { const term = e.target.value.toLowerCase().trim(); document.querySelectorAll('.chat-list-item').forEach(item => { const name = item.querySelector('.chat-name')?.textContent?.toLowerCase() || ''; item.style.display = name.includes(term) ? 'flex' : 'none'; }); });

// ========== STORIES (FIXED) ==========
document.querySelector('[data-nav="stories"]')?.addEventListener('click', () => {
    if (!currentUser) { customAlert("Please log in to create a story.", "Login Required"); return; }
    if (!supabase) { customAlert("Stories unavailable.", "Error"); return; }
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (file.size > 20 * 1024 * 1024) { customAlert("File must be less than 20MB.", "Error"); return; }
        const fileName = `stories/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        try {
            const { error } = await supabase.storage.from('chat-images').upload(fileName, file);
            if (error) { console.error('Story upload error:', error); customAlert("Story upload failed.", "Error"); return; }
            const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(fileName);
            const modal = document.createElement('div'); modal.className = 'story-modal';
            modal.innerHTML = `<span class="story-close">&times;</span>${file.type.startsWith('video') ? `<video src="${urlData.publicUrl}" controls autoplay></video>` : `<img src="${urlData.publicUrl}">`}`;
            document.body.appendChild(modal); modal.querySelector('.story-close').onclick = () => modal.remove(); setTimeout(() => modal.remove(), 10000);
        } catch (err) { console.error('Story error:', err); customAlert("Story upload failed.", "Error"); }
    };
    input.click();
});

// ========== WATCH STORIES ==========
document.getElementById('watchStoriesBtn')?.addEventListener('click', async () => {
    if (!supabase) { customAlert("Stories unavailable.", "Error"); return; }
    try {
        const { data: files, error } = await supabase.storage.from('chat-images').list('stories', { limit: 20 });
        if (error) { console.error('List error:', error); customAlert("Could not load stories.", "Error"); return; }
        if (!files?.length) { customAlert("No stories available", "Stories"); return; }
        let currentStory = 0; const stories = files.filter(f => f.name.match(/\.(mp4|webm|jpg|jpeg|png|gif)$/));
        if (!stories.length) { customAlert("No stories available", "Stories"); return; }
        const modal = document.createElement('div'); modal.className = 'story-modal';
        const showStory = (index) => { const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(`stories/${stories[index].name}`); const url = urlData.publicUrl; const isVideo = stories[index].name.match(/\.(mp4|webm)$/); modal.innerHTML = `<span class="story-close">&times;</span>${isVideo ? `<video src="${url}" controls autoplay></video>` : `<img src="${url}">`}<div class="story-nav"><button id="prevStory">◀</button><button id="nextStory">▶</button></div>`; modal.querySelector('.story-close').onclick = () => modal.remove(); modal.querySelector('#prevStory')?.addEventListener('click', () => { currentStory = (currentStory - 1 + stories.length) % stories.length; showStory(currentStory); }); modal.querySelector('#nextStory')?.addEventListener('click', () => { currentStory = (currentStory + 1) % stories.length; showStory(currentStory); }); };
        showStory(0); document.body.appendChild(modal); setTimeout(() => modal.remove(), 30000);
    } catch (err) { console.error('Story error:', err); customAlert("Could not load stories.", "Error"); }
});

// ========== PROFILE UI ==========
async function updateProfileCompletion() { const fields = [currentUser.name, currentUser.bio, currentUser.location]; let filled = fields.filter(f => f).length; let percent = (filled/3)*100; document.getElementById('profileProgress').style.width = percent+'%'; }
async function renderProfileUI() {
    document.getElementById('profileUsername').innerText = currentUser.name; document.getElementById('profileStatus').innerText = currentUser.bio || "Hey there!"; document.getElementById('profileAvatar').src = currentUser.profilePic || 'https://randomuser.me/api/portraits/lego/1.jpg'; document.getElementById('matchesCount').innerText = currentUser.matches?.length || 0; document.getElementById('likesCount').innerText = currentUser.swipes?.length || 0; document.getElementById('viewsCount').innerText = "0"; updateProfileCompletion(); if(currentUser.verified) document.querySelector('.verified-badge').style.display = 'inline-block'; else document.querySelector('.verified-badge').style.display = 'none';
    const boostBtn = document.getElementById('boostProfileBtn'); if(currentUser.features?.boost === true) boostBtn.onclick = async () => await customAlert("Boost activated!", "Boost"); else boostBtn.onclick = async () => await customAlert("Upgrade to Platinum to unlock Boost feature.", "Premium Required");
    const settingsList = [{ icon: "fas fa-user-circle", title: "Account", key: "account" },{ icon: "fas fa-lock", title: "Privacy", key: "privacy" },{ icon: "fas fa-sliders-h", title: "Dating Preferences", key: "dating" },{ icon: "fas fa-crown", title: "Premium Features", key: "premium" },{ icon: "fas fa-question-circle", title: "Help & Support", key: "help" },{ icon: "fas fa-gem", title: "Upgrade to Premium", key: "upgrade" },{ icon: "fas fa-id-card", title: "Verify Identity", key: "verify" },{ icon: "fas fa-shield-alt", title: "Admin Panel", key: "admin" },{ icon: "fas fa-calendar-alt", title: "Events", key: "events" },{ icon: "fas fa-gavel", title: "Appeal Ban", key: "appeal" },{ icon: "fas fa-link", title: "Copy Referral Link", key: "referral" },{ icon: "fas fa-address-book", title: "Invite Friends", key: "invite" },{ icon: "fas fa-star", title: "Rate App", key: "rate" },{ icon: "fas fa-trash-alt", title: "Delete Account", key: "delete" }];
    document.getElementById('settingsListContainer').innerHTML = settingsList.map(s => `<div class="settings-item" data-key="${s.key}"><div class="settings-item-left"><i class="${s.icon}"></i><span>${s.title}</span></div><i class="fas fa-chevron-right"></i></div>`).join('');
    document.querySelectorAll('.settings-item').forEach(el => el.addEventListener('click', () => { const key = el.dataset.key; if(key === 'upgrade') showUpgradeModal(); else if(key === 'verify') verifyIdentity(); else if(key === 'admin') showAdminLogin(); else if(key === 'events') loadEvents(); else if(key === 'appeal') submitAppealPrompt(); else if(key === 'referral') copyReferralLink(); else if(key === 'invite') showContactsInvite(); else if(key === 'rate') showRatingModal(); else if(key === 'delete') deleteAccount(); else showSettingsDetail(key); }));
    function copyReferralLink() { const link = `https://ceezy-website.web.app?ref=${currentUser.referralCode}`; navigator.clipboard?.writeText(link).then(() => customAlert("Referral link copied!", "Referral")); }
    document.getElementById('editProfileBtn').onclick = () => { document.getElementById('profileView').classList.remove('active-view'); document.getElementById('editProfileView').style.display = 'block'; loadEditProfile(); };
    document.getElementById('shareProfileBtn').onclick = async () => await customAlert("Share profile link (demo)", "Share");
    document.getElementById('changePhotoBtn').onclick = () => document.getElementById('photoUploadInput').click();
    // Profile picture upload via Supabase (FIXED)
    document.getElementById('photoUploadInput').onchange = async (e) => {
        if(e.target.files[0]){
            if (!supabase) { customAlert("Upload service unavailable.", "Error"); return; }
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) { customAlert("Photo must be less than 5MB.", "Error"); return; }
            const fileName = `${currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            try {
                const { error } = await supabase.storage.from('profile-pictures').upload(fileName, file, { upsert: true });
                if (error) { console.error('Profile upload error:', error); customAlert("Upload failed. Please try again.", "Error"); return; }
                const { data: urlData } = supabase.storage.from('profile-pictures').getPublicUrl(fileName);
                const url = urlData.publicUrl;
                await db.collection("users").doc(currentUser.uid).update({ profilePic: url });
                currentUser.profilePic = url;
                document.getElementById('profileAvatar').src = url + '?t=' + Date.now();
                await customAlert("Photo updated!", "Success");
            } catch (err) { console.error('Profile upload error:', err); customAlert("Upload failed.", "Error"); }
        }
    };
    document.getElementById('logoutBtnProfile').onclick = async () => { if(heartbeatInterval) clearInterval(heartbeatInterval); if(unsubscribeNotifications) unsubscribeNotifications(); localStorage.removeItem('currentUserUid'); window.location.reload(); };
}
async function verifyIdentity() { await db.collection("users").doc(currentUser.uid).update({ verified: true }); await customAlert("Identity verified!", "Verified"); renderProfileUI(); }
async function showAdminLogin() { const pwd = await customPrompt("Admin password:", "", "Admin Login"); if(pwd === 'Crains'){ isAdminLoggedIn = true; renderAdminPanel(); } else await customAlert("Wrong password", "Error"); }
async function submitAppealPrompt() { const reason = await customPrompt("Why unban?", "", "Appeal"); if(reason) await submitAppeal(reason); }
function loadEditProfile() { /* unchanged */ }
function showSettingsDetail(section) { /* unchanged */ }
async function upgradeToPremium(userId, plan) { /* unchanged */ }
function showUpgradeModal() { /* unchanged */ }
async function showContactsInvite() { /* unchanged */ }
function showRatingModal() { /* unchanged */ }
async function deleteAccount() { /* unchanged */ }

// ========== MEET AI ==========
const OPENAI_API_KEY = 'sk-proj--sRSTKZsyezcl06e0A';
let aiConversation = [{ role: "system", content: "You are MEET AI, a helpful assistant." }];
document.getElementById('aiChatToggleBtn').addEventListener('click', () => { if (!currentUser) { customAlert("Login required.", "Login"); return; } const win = document.getElementById('aiChatWindow'); win.style.display = (win.style.display === 'flex') ? 'none' : 'flex'; if (win.style.display === 'flex') document.getElementById('aiChatInput').focus(); });
document.getElementById('closeAiChat').addEventListener('click', () => { document.getElementById('aiChatWindow').style.display = 'none'; });
document.getElementById('sendAiMsg').addEventListener('click', sendAiMessage);
document.getElementById('aiChatInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAiMessage(); });
async function sendAiMessage() { const input = document.getElementById('aiChatInput'); const text = input.value.trim(); if (!text) return; addAiBubble(text, 'user'); aiConversation.push({ role: 'user', content: text }); input.value = ''; const typingDiv = document.createElement('div'); typingDiv.className = 'ai-message bot typing-indicator'; typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>'; document.getElementById('aiChatBody').appendChild(typingDiv); try { const reply = await fetchOpenAIResponse(); typingDiv.remove(); addAiBubble(reply, 'bot'); aiConversation.push({ role: 'assistant', content: reply }); } catch (err) { typingDiv.remove(); addAiBubble("Sorry, try again later.", 'bot'); } }
function addAiBubble(text, sender) { const bubble = document.createElement('div'); bubble.className = `ai-message ${sender}`; bubble.textContent = text; document.getElementById('aiChatBody').appendChild(bubble); }
async function fetchOpenAIResponse() { const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-3.5-turbo', messages: aiConversation, temperature: 0.7, max_tokens: 300 }) }); if (!response.ok) throw new Error(`API error: ${response.status}`); const data = await response.json(); return data.choices[0].message.content; }

// ========== LIFE-CYCLE ==========
function attachNavEvents() { document.querySelectorAll('.nav-item').forEach(item => { item.addEventListener('click', async () => { const viewId = item.dataset.nav; document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view')); if (viewId === 'stories') return; document.getElementById(viewId + 'View').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active')); item.classList.add('active'); if(viewId === 'messages') { document.getElementById('chatListContainer').style.display = 'block'; document.getElementById('chatScreenContainer').style.display = 'none'; if(unsubscribeMessages) unsubscribeMessages(); await renderChatList(); } if(viewId === 'explore') await renderExplore(); if(viewId === 'profile') await renderProfileUI(); if(viewId === 'swipe') await renderSwipeCards(); document.getElementById('editProfileView').style.display = 'none'; document.getElementById('settingsDetailView').style.display = 'none'; }); }); document.querySelector('.nav-item[data-nav="swipe"]').classList.add('active'); }
async function showMainApp() { document.getElementById('loginView').style.display = 'none'; document.getElementById('signupView').style.display = 'none'; document.getElementById('mainApp').style.display = 'block'; await loadCurrentUser(); requestPushPermission(); checkForUpdates(); if(unsubscribeUser) unsubscribeUser(); const userRef = db.collection("users").doc(currentUser.uid); unsubscribeUser = userRef.onSnapshot(docSnap => { if(docSnap.exists) { currentUser = docSnap.data(); renderProfileUI(); renderSwipeCards(); renderExplore(); renderChatList(); } }); await renderAll(); attachNavEvents(); await renderSwipeCards(); renderChatList(); startHeartbeat(); await updateLastSeen(); listenForNotifications(); window.addEventListener('beforeunload', async () => { if(currentUser) await db.collection("users").doc(currentUser.uid).update({ lastSeen: 0 }); if(heartbeatInterval) clearInterval(heartbeatInterval); if(unsubscribeNotifications) unsubscribeNotifications(); }); }
async function startHeartbeat() { if(heartbeatInterval) clearInterval(heartbeatInterval); heartbeatInterval = setInterval(async () => { if(currentUser) await db.collection("users").doc(currentUser.uid).update({ lastSeen: Date.now() }); }, 30000); }
async function updateLastSeen() { if(currentUser) await db.collection("users").doc(currentUser.uid).update({ lastSeen: Date.now() }); }
async function loadCurrentUser() { const uid = localStorage.getItem('currentUserUid'); if(uid) currentUser = (await db.collection("users").doc(uid).get()).data(); }
async function renderAll() { await renderProfileUI(); await renderChatList(); await renderExplore(); }

// ========== UI EVENT BINDING (ORIGINAL – UNTOUCHED) ==========
document.getElementById('goToSignupLink')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('loginView').style.display = 'none'; document.getElementById('signupView').style.display = 'flex'; });
document.getElementById('goToLoginLink')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signupView').style.display = 'none'; document.getElementById('loginView').style.display = 'flex'; });
document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => { const email = await customPrompt("Enter your email:", "", "Reset Password"); if(email) auth.sendPasswordResetEmail(email).then(()=>customAlert("Reset email sent", "Email")).catch(err=>customAlert(err.message, "Error")); });
document.getElementById('appealBanBtn')?.addEventListener('click', async () => { const email = await customPrompt("Enter your email address:", "", "Appeal Ban"); if (!email) return; const usersSnap = await db.collection("users").where("email", "==", email).get(); if (usersSnap.empty) { await customAlert("No account found.", "Not Found"); return; } const userDoc = usersSnap.docs[0]; const userData = userDoc.data(); if (!userData.banned) { await customAlert("Not banned.", "OK"); return; } const reason = await customPrompt("Why unban?", "", "Appeal"); if (reason) { await db.collection("appeals").add({ userId: userDoc.id, reason, status: "pending", timestamp: Date.now() }); await customAlert("Appeal submitted.", "Done"); } });
document.getElementById('googleSignInBtn')?.addEventListener('click', async () => { try{ const user=await window.signInWithGoogle(); localStorage.setItem('currentUserUid',user.uid); currentUser=(await db.collection("users").doc(user.uid).get()).data(); showMainApp(); }catch(err){ await customAlert(err.message, "Error"); } });
document.getElementById('googleSignUpBtn')?.addEventListener('click', async () => { try{ const user=await window.signInWithGoogle(); localStorage.setItem('currentUserUid',user.uid); currentUser=(await db.collection("users").doc(user.uid).get()).data(); showMainApp(); }catch(err){ await customAlert(err.message, "Error"); } });
document.getElementById('signupFormElem')?.addEventListener('submit', async (e) => { e.preventDefault(); const name=document.getElementById('signupName').value, email=document.getElementById('signupEmail').value, pwd=document.getElementById('signupPassword').value, confirm=document.getElementById('confirmPwd').value; if(pwd!==confirm){ await customAlert("Passwords mismatch", "Error"); return; } const gender=document.getElementById('signupGender').value, age=document.getElementById('signupAge').value; const refCode=document.getElementById('signupReferralCode').value; try{ await window.signupUser(email,pwd,name,age,gender, refCode); document.getElementById('signupView').style.display='none'; document.getElementById('loginView').style.display='flex'; }catch(err){ await customAlert("Signup failed: "+err.message, "Error"); } });
document.getElementById('loginFormElem')?.addEventListener('submit', async (e) => { e.preventDefault(); const email=document.getElementById('loginEmail').value, pwd=document.getElementById('loginPassword').value; try{ const user=await window.loginUserFirebase(email,pwd); localStorage.setItem('currentUserUid',user.uid); currentUser=(await db.collection("users").doc(user.uid).get()).data(); showMainApp(); }catch(err){ await customAlert("Login failed: "+err.message, "Error"); } });
document.getElementById('uploadIntroBtn')?.addEventListener('click', () => { const file=document.getElementById('introUploadInput').files[0]; if(file) uploadIntro(file); else customAlert("Select a file first", "Error"); });
document.getElementById('applyFilterBtn')?.addEventListener('click', () => renderExplore());
document.querySelectorAll('.toggle-pwd').forEach(icon=>{ icon.addEventListener('click',function(){ let target=document.getElementById(this.dataset.target); if(target.type==='password') target.type='text'; else target.type='password'; this.classList.toggle('fa-eye');}); });
(function() { const params = new URLSearchParams(window.location.search); const ref = params.get('ref'); if (ref) { const loginGroup = document.getElementById('loginReferralGroup'); const loginInput = document.getElementById('loginReferralCode'); if (loginGroup && loginInput) { loginGroup.style.display = 'block'; loginInput.value = ref; } const signupInput = document.getElementById('signupReferralCode'); if (signupInput) signupInput.value = ref; } })();
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/firebase-messaging-sw.js').then(registration => { console.log('Service Worker registered'); messaging.useServiceWorker(registration); }); }
if(localStorage.getItem('currentUserUid')) { loadCurrentUser().then(()=>{ if(currentUser) showMainApp(); else document.getElementById('loginView').style.display='flex'; }); } else { document.getElementById('loginView').style.display='flex'; }