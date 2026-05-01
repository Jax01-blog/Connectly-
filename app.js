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
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, sendEmailVerification, updateEmail, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection, addDoc, query, orderBy, onSnapshot, writeBatch, where, increment, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCWliI60g90f-Ed4ydFBPbz027fo7N29tI",
    authDomain: "ceezy-website.firebaseapp.com",
    projectId: "ceezy-website",
    storageBucket: "ceezy-website.appspot.com",
    messagingSenderId: "59858219268",
    appId: "1:59858219268:web:placeholder"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

let currentUser = null;
let heartbeatInterval = null;
let unsubscribeUser = null;
let currentChatPartner = null;
let typingTimeout = null;
let unsubscribeMessages = null;
let adminUnsubscribes = [];
let unsubscribeNotifications = null;

// ========== REFERRAL HELPERS ==========
function generateReferralCode() {
    return 'r' + Math.random().toString(36).substring(2, 8);
}
async function applyReferral(refCode, newUserId) {
    const qRef = query(collection(db, "users"), where("referralCode", "==", refCode));
    const snap = await getDocs(qRef);
    if (snap.empty) return false;
    const referrerDoc = snap.docs[0];
    const referrerId = referrerDoc.id;
    const now = Date.now();
    const premiumDuration = 7 * 24 * 60 * 60 * 1000;
    const newUserDuration = 3 * 24 * 60 * 60 * 1000;
    const referrerData = referrerDoc.data();
    const currentExpires = referrerData.premiumExpiresAt || 0;
    const newExpires = Math.max(currentExpires, now) + premiumDuration;
    await updateDoc(doc(db, "users", referrerId), {
        isPremium: true, premiumPlan: 'gold', premiumExpiresAt: newExpires,
        features: { unlimitedSwipes: true, seeWhoLikedYou: true, readReceipts: false, boost: false },
        verified: true
    });
    await updateDoc(doc(db, "users", newUserId), {
        isPremium: true, premiumPlan: 'gold', premiumExpiresAt: now + newUserDuration,
        features: { unlimitedSwipes: true, seeWhoLikedYou: true, readReceipts: false, boost: false },
        verified: true
    });
    return true;
}

// ========== NOTIFICATIONS PERMISSION ==========
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().then(perm => {
            console.log('Notification permission:', perm);
        });
    }
}

function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'https://randomuser.me/api/portraits/lego/1.jpg' });
    }
}

// ========== REAL LIKES FIX ==========
async function refreshCurrentUser() {
    if (!currentUser) return;
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    if (snap.exists()) currentUser = snap.data();
}

// ========== NOTIFICATIONS (LIKES & MESSAGES) ==========
function showNotificationToast(message) {
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function sendLikeNotification(fromUserId, toUserId, fromName) {
    await addDoc(collection(db, "notifications"), {
        toUserId: toUserId, fromUserId: fromUserId, fromName: fromName,
        type: "like", read: false, timestamp: Date.now()
    });
}

function listenForNotifications() {
    if (unsubscribeNotifications) unsubscribeNotifications();
    const q = query(collection(db, "notifications"), where("toUserId", "==", currentUser.uid), where("read", "==", false));
    unsubscribeNotifications = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const notif = change.doc.data();
                showNotificationToast(`💖 ${notif.fromName} liked you!`);
                showBrowserNotification('New Like!', `${notif.fromName} liked you!`);
                updateDoc(doc(db, "notifications", change.doc.id), { read: true });
            }
        });
    });
}

// ========== AUTH (with ban check & referral) ==========
window.signupUser = async (email, password, name, age, gender, referralCode) => {
    try {
        const existingQuery = query(collection(db, "users"), where("email", "==", email));
        const existingSnap = await getDocs(existingQuery);
        if (!existingSnap.empty) {
            const existingUser = existingSnap.docs[0].data();
            if (existingUser.banned === true) throw new Error("This email is banned from MEET.");
            throw new Error("Email already registered.");
        }
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName: name });
        await sendEmailVerification(userCred.user);
        const uid = userCred.user.uid;
        const referralCodeOwn = generateReferralCode();
        await setDoc(doc(db, "users", uid), {
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
        if (referralCode && referralCode.trim()) {
            await applyReferral(referralCode.trim(), uid);
        }
        await customAlert("Account created! Verification email sent.", "Success");
        return userCred.user;
    } catch (err) { await customAlert(err.message, "Signup Error"); throw err; }
};

window.signInWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
            const refCode = generateReferralCode();
            await setDoc(doc(db, "users", user.uid), {
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
            if (data.banned) { await signOut(auth); throw new Error("Your account has been banned."); }
            await updateDoc(doc(db, "users", user.uid), { lastSeen: Date.now(), emailVerified: true });
        }
        return user;
    } catch (err) { await customAlert(err.message, "Google Sign-In Error"); throw err; }
};

window.loginUserFirebase = async (email, password) => {
    try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        if (!userCred.user.emailVerified) { await customAlert("Please verify your email.", "Email Not Verified"); await signOut(auth); throw new Error("Email not verified"); }
        const snap = await getDoc(doc(db, "users", userCred.user.uid));
        const data = snap.data();
        if (data && data.banned) { await signOut(auth); throw new Error("Your account has been banned."); }
        await updateDoc(doc(db, "users", userCred.user.uid), { lastSeen: Date.now(), emailVerified: true });
        return userCred.user;
    } catch (err) { throw err; }
};

// ========== QUICK PROFILE MODAL ==========
async function showQuickProfile(userId) {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) return;
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

// ========== EVENTS, INTRO, APPEALS (unchanged) ==========
async function loadEvents() {
    const eventsSnap = await getDocs(query(collection(db, "events"), orderBy("date")));
    const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const modal = document.createElement('div'); modal.className = 'stripe-modal';
    modal.innerHTML = `<h3>📅 Upcoming Events</h3><div id="eventsList"></div><button id="createEventBtn" class="gradient-btn">+ Create Event</button><button class="small-glass" id="closeEventsModal">Close</button>`;
    document.body.appendChild(modal);
    const eventsDiv = modal.querySelector('#eventsList');
    eventsDiv.innerHTML = events.map(e => `<div class="event-card" data-id="${e.id}"><strong>${e.title}</strong><br>📍 ${e.location}<br>🕒 ${new Date(e.date).toLocaleString()}<br>👥 ${e.attendees?.length || 0} attending<button class="small-glass rsvp-btn" data-id="${e.id}">${e.attendees?.includes(currentUser.uid) ? 'Leave' : 'Join'}</button></div>`).join('');
    modal.querySelectorAll('.rsvp-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation(); const eventId = btn.dataset.id; const eventRef = doc(db, "events", eventId);
        const eventSnap = await getDoc(eventRef); const attendees = eventSnap.data().attendees || [];
        if (attendees.includes(currentUser.uid)) await updateDoc(eventRef, { attendees: attendees.filter(id => id !== currentUser.uid) });
        else await updateDoc(eventRef, { attendees: [...attendees, currentUser.uid] });
        loadEvents();
    }));
    modal.querySelector('#createEventBtn').onclick = () => {
        customPrompt("Event title:", "", "Create Event").then(title => {
            if(title) customPrompt("Location:", "", "Location").then(location => {
                if(location) customPrompt("Date (YYYY-MM-DD HH:MM):", "", "Date").then(date => {
                    if(date) addDoc(collection(db, "events"), { title, location, date: new Date(date).getTime(), creator: currentUser.uid, attendees: [currentUser.uid], createdAt: Date.now() }).then(() => loadEvents());
                });
            });
        });
    };
    modal.querySelector('#closeEventsModal').onclick = () => modal.remove();
}

async function uploadIntro(file) {
    const introRef = ref(storage, `intros/${currentUser.uid}/${Date.now()}_${file.name}`);
    await uploadBytes(introRef, file); const url = await getDownloadURL(introRef);
    await updateDoc(doc(db, "users", currentUser.uid), { introUrl: url }); await customAlert("Intro uploaded!", "Success");
}

async function submitAppeal(reason) {
    await addDoc(collection(db, "appeals"), { userId: currentUser.uid, reason, status: "pending", timestamp: Date.now() });
    await customAlert("Appeal submitted.", "Appeal");
}

// ========== ADMIN PANEL (unchanged, works with updated rules) ==========
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
        const usersSnap = await getDocs(collection(db, "users"));
        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const results = users.filter(u => 
            u.email?.toLowerCase().includes(searchTerm) || 
            u.name?.toLowerCase().includes(searchTerm)
        ).slice(0, 10);
        
        const resultsDiv = document.getElementById('banUserSearchResults');
        if (results.length === 0) {
            resultsDiv.innerHTML = '<p style="color:#ccc;">No users found.</p>';
            return;
        }
        resultsDiv.innerHTML = results.map(u => `
            <div class="admin-item" style="display:flex; justify-content:space-between; align-items:center;">
                <span>${u.name} (${u.email}) ${u.banned ? '<span style="color:#ff6b6b;">[BANNED]</span>' : ''}</span>
                ${!u.banned ? `<button class="small-glass ban-user-btn" data-id="${u.id}" data-name="${u.name}">Ban</button>` : `<button class="small-glass unban-user-btn" data-id="${u.id}" data-name="${u.name}">Unban</button>`}
            </div>
        `).join('');
        
        document.querySelectorAll('.ban-user-btn').forEach(btn => btn.addEventListener('click', async () => {
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            if (await customConfirm(`Ban user ${userName}?`, "Confirm Ban")) {
                await updateDoc(doc(db, "users", userId), { banned: true });
                await customAlert(`User ${userName} has been banned.`, "Banned");
                renderAdminPanel();
            }
        }));
        document.querySelectorAll('.unban-user-btn').forEach(btn => btn.addEventListener('click', async () => {
            const userId = btn.dataset.id;
            const userName = btn.dataset.name;
            if (await customConfirm(`Unban user ${userName}?`, "Confirm Unban")) {
                await updateDoc(doc(db, "users", userId), { banned: false });
                await customAlert(`User ${userName} has been unbanned.`, "Unbanned");
                renderAdminPanel();
            }
        }));
    });

    const usersQuery = query(collection(db, "users"));
    const unsubUsers = onSnapshot(usersQuery, (snap) => {
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
    
    const appealsQuery = query(collection(db, "appeals"), orderBy("timestamp", "desc"));
    const unsubAppeals = onSnapshot(appealsQuery, (snap) => {
        const appeals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        document.getElementById('appealsList').innerHTML = appeals.map(a => `
            <div class="admin-item">
                <strong>${a.userId}</strong>: ${a.reason} (${a.status})
                <br>
                <button class="small-glass approve-appeal" data-id="${a.id}">Approve</button>
                <button class="small-glass reject-appeal" data-id="${a.id}">Reject</button>
            </div>
        `).join('') || '<div class="admin-item">None</div>';
        document.querySelectorAll('.approve-appeal').forEach(btn => btn.addEventListener('click', async () => {
            const appealId = btn.dataset.id;
            const appeal = appeals.find(a => a.id === appealId);
            await updateDoc(doc(db, "appeals", appealId), { status: "approved" });
            if (appeal) {
                await updateDoc(doc(db, "users", appeal.userId), { banned: false });
                await customAlert(`Appeal approved and user unbanned.`, "Appeal");
            }
        }));
        document.querySelectorAll('.reject-appeal').forEach(btn => btn.addEventListener('click', async () => {
            await updateDoc(doc(db, "appeals", btn.dataset.id), { status: "rejected" });
        }));
    });
    adminUnsubscribes.push(unsubAppeals);
    
    const reportsQuery = query(collection(db, "reports"), orderBy("timestamp", "desc"));
    const unsubReports = onSnapshot(reportsQuery, (snap) => {
        const reports = snap.docs.map(d => d.data());
        document.getElementById('reportsList').innerHTML = reports.map(r => 
            `<div class="admin-item">Reported: ${r.reportedId} by ${r.reporterId} – Reason: ${r.reason}</div>`
        ).join('') || '<div class="admin-item">None</div>';
    });
    adminUnsubscribes.push(unsubReports);
    
    document.getElementById('adminLogoutBtn').onclick = () => {
        isAdminLoggedIn = false;
        adminDiv.remove();
        adminUnsubscribes.forEach(unsub => unsub());
    };
}

// ========== CORE APP FUNCTIONS (with likes fix) ==========
async function getAvailableProfiles() {
    const users = await getDocs(collection(db, "users"));
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
        await updateDoc(doc(db, "users", currentUser.uid), { swipes, swipesToday: (currentUser.swipesToday || 0) + 1 });
        await sendLikeNotification(currentUser.uid, target.uid, currentUser.name);
        if(target.swipes && target.swipes.includes(currentUser.uid)) {
            const matches = currentUser.matches || [];
            if(!matches.includes(target.uid)) {
                matches.push(target.uid);
                await updateDoc(doc(db, "users", currentUser.uid), { matches });
                const targetMatches = target.matches || [];
                if(!targetMatches.includes(currentUser.uid)) {
                    targetMatches.push(currentUser.uid);
                    await updateDoc(doc(db, "users", target.uid), { matches: targetMatches });
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
        await updateDoc(doc(db, "users", currentUser.uid), { swipes, swipesToday: (currentUser.swipesToday || 0) + 1 });
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
        await updateDoc(doc(db, "users", currentUser.uid), { swipesToday: 0, lastSwipeDate: Date.now() });
        currentUser.swipesToday = 0;
    }
    const remaining = Math.max(0, 20 - (currentUser.swipesToday || 0));
    document.getElementById('swipeCounter').innerText = `Swipes remaining today: ${remaining}`;
    return remaining > 0;
}
async function renderExplore() {
    let users = await getDocs(collection(db, "users"));
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
                await updateDoc(doc(db, "users", currentUser.uid), { swipes });
                currentUser.swipes = swipes;
                const target = users.docs.find(d => d.id === targetId).data();
                if(target.swipes && target.swipes.includes(currentUser.uid)) {
                    const matches = currentUser.matches || [];
                    if(!matches.includes(targetId)) {
                        matches.push(targetId);
                        await updateDoc(doc(db, "users", currentUser.uid), { matches });
                        currentUser.matches = matches;
                        await customAlert(`✨ Matched with ${target.name}! ✨`, "Match!");
                    }
                }
                renderExplore();
            }
        }));
    } else {
        matchQueueDiv.style.display = 'none';
    }
    document.getElementById('exploreList').innerHTML = filtered.map(u => `<div class="explore-card"><img src="${u.profilePic}" width="80" style="border-radius:50%;"><h4>${u.name}, ${u.age}</h4><button class="small-glass explore-like" data-id="${u.uid}">Like</button><button class="small-glass report-btn" data-id="${u.uid}">Report</button></div>`).join('');
    document.querySelectorAll('.explore-like').forEach(btn => btn.addEventListener('click', async () => {
        const targetId = btn.dataset.id;
        const swipes = currentUser.swipes || [];
        if(!swipes.includes(targetId)) {
            swipes.push(targetId);
            await updateDoc(doc(db, "users", currentUser.uid), { swipes });
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
        await addDoc(collection(db, "reports"), { reporterId: currentUser.uid, reportedId: userId, reason: btn.dataset.reason, timestamp: Date.now() });
        modal.remove();
        await customAlert("Reported.", "Report");
    }));
    modal.querySelector('#closeReportModal').onclick = () => modal.remove();
}
async function renderChatList() {
    const container = document.getElementById('chatListContainer');
    const matches = currentUser.matches || [];
    if(matches.length === 0){ container.innerHTML = `<div class="glass-card">No matches yet. Start swiping!</div>`; return; }
    const users = (await getDocs(collection(db, "users"))).docs.map(d => d.data());
    const matchedUsers = users.filter(u => matches.includes(u.uid) && u.banned !== true);
    container.innerHTML = matchedUsers.map(m => `
        <div class="chat-list-item" data-id="${m.uid}">
            <div style="position:relative;"><img class="avatar" src="${m.profilePic}">${m.privacyOnlineStatus !== false && (Date.now() - (m.lastSeen||0) < 60000) ? '<span class="online-dot"></span>' : ''}</div>
            <div class="chat-info"><div class="chat-name">${m.name}${m.verified ? '<i class="fas fa-check-circle verified-icon"></i>' : ''}</div><div class="last-msg">Tap to chat</div></div>
            <div class="chat-meta"><button class="small-glass block-chat-btn" data-id="${m.uid}">Block</button></div>
        </div>
    `).join('');
    document.querySelectorAll('.chat-list-item').forEach(el => el.addEventListener('click', (e) => { if(!e.target.classList.contains('block-chat-btn')) openChatScreen(el.dataset.id); }));
    document.querySelectorAll('.block-chat-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const targetId = btn.dataset.id;
        const confirm = await customConfirm(`Block ${users.find(u=>u.uid===targetId)?.name}?`, "Block User");
        if(confirm) {
            const blocked = currentUser.blocked || [];
            blocked.push(targetId);
            await updateDoc(doc(db, "users", currentUser.uid), { blocked });
            currentUser.blocked = blocked;
            renderChatList();
        }
    }));
}
async function openChatScreen(partnerId) {
    if(currentUser.verified !== true) { await customAlert("You must verify your identity before chatting.", "Verification Required"); return; }
    currentChatPartner = partnerId;
    const users = (await getDocs(collection(db, "users"))).docs.map(d => d.data());
    const partner = users.find(u => u.uid === partnerId);
    document.getElementById('chatListContainer').style.display = 'none';
    const screenDiv = document.getElementById('chatScreenContainer');
    screenDiv.style.display = 'block';
    let statusText = '';
    if(partner.privacyOnlineStatus !== false && (Date.now() - (partner.lastSeen||0) < 60000)) statusText = 'Online';
    else if(partner.privacyLastSeen !== false && partner.lastSeen) statusText = new Date(partner.lastSeen).toLocaleTimeString();
    else statusText = 'Offline';
    screenDiv.innerHTML = `
        <div class="chat-header"><button class="back-btn" id="backToChatList"><i class="fas fa-arrow-left"></i></button><div class="chat-profile" data-id="${partner.uid}"><img src="${partner.profilePic}" id="chatAvatar"><div><div class="chat-name">${partner.name} ${partner.verified ? '<i class="fas fa-check-circle verified-icon"></i>' : ''}</div><div class="chat-status" id="chatStatus">${statusText}</div><div id="typingStatus" style="font-size:0.7rem;"></div></div></div><div class="chat-actions"><i class="fas fa-phone" id="callDemo"></i><i class="fas fa-video" id="videoDemo"></i><i class="fas fa-ban" id="blockFromChat"></i><i class="fas fa-ellipsis-v" id="menuUnmatch"></i></div></div>
        <div class="messages-area" id="messagesArea"></div>
        <div class="input-area"><input type="text" id="messageInputChat" placeholder="Type a message..."><button id="sendChatMsg"><i class="fas fa-paper-plane"></i></button></div>
    `;
    document.querySelector('.chat-profile').addEventListener('click', () => showQuickProfile(partner.uid));
    document.getElementById('backToChatList').onclick = () => { screenDiv.style.display = 'none'; document.getElementById('chatListContainer').style.display = 'block'; if(unsubscribeMessages) unsubscribeMessages(); renderChatList(); };
    document.getElementById('blockFromChat')?.addEventListener('click', async () => {
        const confirm = await customConfirm(`Block ${partner.name}?`, "Block User");
        if(confirm) {
            const blocked = currentUser.blocked || [];
            blocked.push(partnerId);
            await updateDoc(doc(db, "users", currentUser.uid), { blocked });
            currentUser.blocked = blocked;
            document.getElementById('backToChatList').click();
        }
    });
    document.getElementById('menuUnmatch')?.addEventListener('click', async () => {
        const confirm = await customConfirm(`Unmatch ${partner.name}?`, "Unmatch");
        if(confirm) {
            const matches = currentUser.matches.filter(id => id !== partnerId);
            await updateDoc(doc(db, "users", currentUser.uid), { matches });
            currentUser.matches = matches;
            document.getElementById('backToChatList').click();
        }
    });
    const typingRef = doc(db, "typing", `${currentUser.uid}_${partnerId}`);
    onSnapshot(typingRef, (doc) => { if(doc.exists() && doc.data().isTyping && doc.data().userId === partnerId) document.getElementById('typingStatus').innerHTML = "typing..."; else document.getElementById('typingStatus').innerHTML = ""; });
    const input = document.getElementById('messageInputChat');
    input.addEventListener('input', async () => {
        await setDoc(typingRef, { userId: currentUser.uid, isTyping: true, timestamp: Date.now() });
        if(typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(async () => { await setDoc(typingRef, { userId: currentUser.uid, isTyping: false, timestamp: Date.now() }); }, 1000);
    });
    const chatId = [currentUser.uid, partnerId].sort().join('_');
    const messagesArea = document.getElementById('messagesArea');
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp"));
    if(unsubscribeMessages) unsubscribeMessages();
    unsubscribeMessages = onSnapshot(q, async (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        messagesArea.innerHTML = messages.map(msg => {
            const isSent = msg.senderId === currentUser.uid;
            const time = new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            let statusHtml = '';
            if(isSent && currentUser.features?.readReceipts === true) {
                if(msg.status === 'sent') statusHtml = '<span class="message-status status-sent">✓</span>';
                else if(msg.status === 'delivered') statusHtml = '<span class="message-status status-delivered">✓✓</span>';
                else if(msg.status === 'read') statusHtml = '<span class="message-status status-read">✓✓</span>';
            }
            return `<div class="message-bubble ${isSent ? 'sent' : 'received'}"><div class="message-text">${msg.text}</div><div class="message-time">${time} ${statusHtml}</div></div>`;
        }).join('');
        messagesArea.scrollTop = messagesArea.scrollHeight;
        // Show notification for new incoming messages if chat not open
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const msg = change.doc.data();
                if (msg.senderId !== currentUser.uid && currentChatPartner !== msg.senderId) {
                    showBrowserNotification('New Message', `${partner.name}: ${msg.text}`);
                }
            }
        });
        const batch = writeBatch(db);
        messages.forEach(msg => {
            if(msg.senderId === partnerId && !msg.read) {
                const msgRef = doc(db, "chats", chatId, "messages", msg.id);
                batch.update(msgRef, { read: true, status: 'read' });
            }
        });
        await batch.commit();
    });
    document.getElementById('sendChatMsg').onclick = async () => {
        const text = input.value.trim();
        if(!text) return;
        await addDoc(collection(db, "chats", chatId, "messages"), { senderId: currentUser.uid, text, timestamp: Date.now(), status: "sent", read: false });
        input.value = '';
        await setDoc(typingRef, { userId: currentUser.uid, isTyping: false, timestamp: Date.now() });
    };
}

async function updateProfileCompletion() {
    const fields = [currentUser.name, currentUser.bio, currentUser.location];
    let filled = fields.filter(f => f).length;
    let percent = (filled/3)*100;
    document.getElementById('profileProgress').style.width = percent+'%';
}
async function renderProfileUI() {
    document.getElementById('profileUsername').innerText = currentUser.name;
    document.getElementById('profileStatus').innerText = currentUser.bio || "Hey there!";
    document.getElementById('profileAvatar').src = currentUser.profilePic || 'https://randomuser.me/api/portraits/lego/1.jpg';
    document.getElementById('matchesCount').innerText = currentUser.matches?.length || 0;
    document.getElementById('likesCount').innerText = currentUser.swipes?.length || 0;
    document.getElementById('viewsCount').innerText = "0";
    updateProfileCompletion();
    if(currentUser.verified) document.querySelector('.verified-badge').style.display = 'inline-block';
    else document.querySelector('.verified-badge').style.display = 'none';
    const boostBtn = document.getElementById('boostProfileBtn');
    if(currentUser.features?.boost === true) boostBtn.onclick = async () => await customAlert("Boost activated!", "Boost");
    else boostBtn.onclick = async () => await customAlert("Upgrade to Platinum to unlock Boost feature.", "Premium Required");
    
    // ========== SETTINGS LIST with DELETE ACCOUNT ==========
    const settingsList = [
        { icon: "fas fa-user-circle", title: "Account", key: "account" },
        { icon: "fas fa-lock", title: "Privacy", key: "privacy" },
        { icon: "fas fa-sliders-h", title: "Dating Preferences", key: "dating" },
        { icon: "fas fa-crown", title: "Premium Features", key: "premium" },
        { icon: "fas fa-question-circle", title: "Help & Support", key: "help" },
        { icon: "fas fa-gem", title: "Upgrade to Premium", key: "upgrade" },
        { icon: "fas fa-id-card", title: "Verify Identity", key: "verify" },
        { icon: "fas fa-shield-alt", title: "Admin Panel", key: "admin" },
        { icon: "fas fa-calendar-alt", title: "Events", key: "events" },
        { icon: "fas fa-gavel", title: "Appeal Ban", key: "appeal" },
        { icon: "fas fa-link", title: "Copy Referral Link", key: "referral" },
        { icon: "fas fa-address-book", title: "Invite Friends", key: "invite" },
        { icon: "fas fa-star", title: "Rate App", key: "rate" },
        { icon: "fas fa-trash-alt", title: "Delete Account", key: "delete" }   // NEW
    ];
    document.getElementById('settingsListContainer').innerHTML = settingsList.map(s => `<div class="settings-item" data-key="${s.key}"><div class="settings-item-left"><i class="${s.icon}"></i><span>${s.title}</span></div><i class="fas fa-chevron-right"></i></div>`).join('');
    document.querySelectorAll('.settings-item').forEach(el => el.addEventListener('click', () => {
        const key = el.dataset.key;
        if(key === 'upgrade') showUpgradeModal();
        else if(key === 'verify') verifyIdentity();
        else if(key === 'admin') showAdminLogin();
        else if(key === 'events') loadEvents();
        else if(key === 'appeal') submitAppealPrompt();
        else if(key === 'referral') copyReferralLink();
        else if(key === 'invite') showContactsInvite();
        else if(key === 'rate') showRatingModal();
        else if(key === 'delete') deleteAccount();   // NEW
        else showSettingsDetail(key);
    }));
    function copyReferralLink() {
        const link = `https://ceezy-website.web.app?ref=${currentUser.referralCode}`;
        navigator.clipboard?.writeText(link).then(() => customAlert("Referral link copied!", "Referral"));
    }
    document.getElementById('editProfileBtn').onclick = () => { document.getElementById('profileView').classList.remove('active-view'); document.getElementById('editProfileView').style.display = 'block'; loadEditProfile(); };
    document.getElementById('shareProfileBtn').onclick = async () => await customAlert("Share profile link (demo)", "Share");
    document.getElementById('changePhotoBtn').onclick = () => document.getElementById('photoUploadInput').click();
    document.getElementById('photoUploadInput').onchange = async (e) => {
        if(e.target.files[0]){
            const file = e.target.files[0];
            const storageRef = ref(storage, `profilePics/${currentUser.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            await updateDoc(doc(db, "users", currentUser.uid), { profilePic: url });
            currentUser.profilePic = url;
            document.getElementById('profileAvatar').src = url;
            await customAlert("Photo updated!", "Success");
        }
    };
    document.getElementById('logoutBtnProfile').onclick = async () => {
        if(heartbeatInterval) clearInterval(heartbeatInterval);
        if(unsubscribeNotifications) unsubscribeNotifications();
        localStorage.removeItem('currentUserUid');
        window.location.reload();
    };
}
async function verifyIdentity() {
    await updateDoc(doc(db, "users", currentUser.uid), { verified: true });
    await customAlert("Identity verified! You can now chat.", "Verified");
    renderProfileUI();
}
async function showAdminLogin() {
    const pwd = await customPrompt("Admin password:", "", "Admin Login");
    if(pwd === 'Crains'){ isAdminLoggedIn = true; renderAdminPanel(); }
    else await customAlert("Wrong password", "Error");
}
async function submitAppealPrompt() {
    const reason = await customPrompt("Why should we unban you?", "", "Appeal");
    if(reason) await submitAppeal(reason);
}
function loadEditProfile() {
    document.getElementById('editName').value = currentUser.name;
    document.getElementById('editBio').value = currentUser.bio || "";
    document.getElementById('editGender').value = currentUser.gender;
    document.getElementById('editAge').value = currentUser.age;
    document.getElementById('editLocation').value = currentUser.location || "";
    const interests = currentUser.interests || [];
    const container = document.getElementById('interestsContainer');
    function renderTags() { container.innerHTML = interests.map((tag,i) => `<span class="tag">${tag} <i class="fas fa-times-circle remove-tag" data-index="${i}"></i></span>`).join(''); }
    renderTags();
    document.getElementById('newInterestInput').onkeypress = (e) => { if(e.key === 'Enter' && e.target.value.trim()){ interests.push(e.target.value.trim()); renderTags(); e.target.value = ''; } };
    document.getElementById('saveProfileChanges').onclick = async () => {
        await updateDoc(doc(db, "users", currentUser.uid), {
            name: document.getElementById('editName').value,
            bio: document.getElementById('editBio').value,
            gender: document.getElementById('editGender').value,
            age: parseInt(document.getElementById('editAge').value),
            location: document.getElementById('editLocation').value,
            interests: interests,
            intent: document.getElementById('editIntent').value
        });
        currentUser = (await getDoc(doc(db, "users", currentUser.uid))).data();
        await customAlert("Profile updated", "Success");
        document.getElementById('backFromEdit').click();
    };
    document.getElementById('backFromEdit').onclick = () => { document.getElementById('editProfileView').style.display = 'none'; document.getElementById('profileView').classList.add('active-view'); renderProfileUI(); };
}
function showSettingsDetail(section) {
    document.getElementById('profileView').classList.remove('active-view');
    document.getElementById('settingsDetailView').style.display = 'block';
    document.getElementById('settingsTitle').innerText = section;
    let content = '';
    if(section === 'account') content = `<div class="settings-item" id="changeEmailBtn"><div>Change email/phone</div><i class="fas fa-chevron-right"></i></div><div class="settings-item" id="updatePasswordBtn"><div>Update password</div><i class="fas fa-chevron-right"></i></div><div class="settings-item" id="emailVerificationBtn"><div>Email Verification</div><i class="fas fa-envelope"></i></div>`;
    else if(section === 'privacy') content = `<div class="settings-item"><div>Last seen</div><div class="toggle-switch ${currentUser.privacyLastSeen !== false ? 'active' : ''}" id="lastSeenToggle"><div class="toggle-knob"></div></div></div><div class="settings-item"><div>Online status</div><div class="toggle-switch ${currentUser.privacyOnlineStatus !== false ? 'active' : ''}" id="onlineStatusToggle"><div class="toggle-knob"></div></div></div><div class="settings-item" id="blockedUsersBtn"><div>Blocked users</div><i class="fas fa-chevron-right"></i></div><div id="blockedUsersList"></div>`;
    else if(section === 'dating') content = `<div class="settings-item"><div>Age preference</div><div class="dual-slider-container"><div class="range-values"><span>Min: <span id="minAgeVal">${currentUser.prefAgeMin||18}</span></span><span>Max: <span id="maxAgeVal">${currentUser.prefAgeMax||100}</span></span></div><input type="range" id="minAgeSlider" min="18" max="60" value="${currentUser.prefAgeMin||18}"><input type="range" id="maxAgeSlider" min="18" max="60" value="${currentUser.prefAgeMax||100}"></div></div><div class="settings-item"><div>Distance preference</div><input type="range" id="distancePrefSlider" min="5" max="100" value="${currentUser.prefDistance||50}"><span id="distancePrefVal">${currentUser.prefDistance||50}</span> km</div><button class="small-glass" id="savePrefsBtn">Save Preferences</button>`;
    else if(section === 'premium') content = `<div class="premium-card"><i class="fas fa-crown"></i><h3>Premium Features</h3><div><strong>Gold ($3.27/month)</strong><br>✓ Unlimited swipes<br>✓ See who liked you<br><br><strong>Platinum ($12.99/month)</strong><br>✓ All Gold<br>✓ Read receipts<br>✓ Profile boost</div><button class="gradient-btn" id="subscribeGoldBtn">Subscribe to Gold</button><button class="gradient-btn" id="subscribePlatinumBtn">Subscribe to Platinum</button></div>`;
    else content = `<div class="settings-item">FAQ</div><div class="settings-item">Contact support</div>`;
    document.getElementById('settingsDetailContent').innerHTML = content;
    if(section === 'account') {
        document.getElementById('changeEmailBtn')?.addEventListener('click', async () => { const newEmail = await customPrompt("New email:", "", "Change Email"); if(newEmail) updateEmail(auth.currentUser, newEmail).then(()=>customAlert("Email updated", "Success")).catch(err=>customAlert(err.message, "Error")); });
        document.getElementById('updatePasswordBtn')?.addEventListener('click', async () => { const newPwd = await customPrompt("New password:", "", "Change Password"); if(newPwd) updatePassword(auth.currentUser, newPwd).then(()=>customAlert("Password updated", "Success")).catch(err=>customAlert(err.message, "Error")); });
        document.getElementById('emailVerificationBtn')?.addEventListener('click', async () => { sendEmailVerification(auth.currentUser).then(()=>customAlert("Verification email sent", "Email")); });
    }
    if(section === 'privacy') {
        document.getElementById('lastSeenToggle')?.addEventListener('click', async (e) => { e.stopPropagation(); const active = document.getElementById('lastSeenToggle').classList.toggle('active'); await updateDoc(doc(db,"users",currentUser.uid),{ privacyLastSeen: active }); });
        document.getElementById('onlineStatusToggle')?.addEventListener('click', async (e) => { e.stopPropagation(); const active = document.getElementById('onlineStatusToggle').classList.toggle('active'); await updateDoc(doc(db,"users",currentUser.uid),{ privacyOnlineStatus: active }); });
        document.getElementById('blockedUsersBtn')?.addEventListener('click', async () => {
            const blockedUsers = await Promise.all((currentUser.blocked||[]).map(async uid => (await getDoc(doc(db,"users",uid))).data()));
            document.getElementById('blockedUsersList').innerHTML = blockedUsers.map(u => `<div class="blocked-user-item"><span>${u?.name||uid}</span><button class="small-glass unblock-btn" data-id="${uid}">Unblock</button></div>`).join('');
            document.querySelectorAll('.unblock-btn').forEach(btn => btn.addEventListener('click', async () => {
                const newBlocked = (currentUser.blocked||[]).filter(id => id !== btn.dataset.id);
                await updateDoc(doc(db,"users",currentUser.uid),{ blocked: newBlocked });
                currentUser.blocked = newBlocked;
                document.getElementById('blockedUsersBtn').click();
            }));
        });
    }
    if(section === 'dating') {
        const minSlider = document.getElementById('minAgeSlider'), maxSlider = document.getElementById('maxAgeSlider'), distSlider = document.getElementById('distancePrefSlider');
        minSlider.oninput = () => document.getElementById('minAgeVal').innerText = minSlider.value;
        maxSlider.oninput = () => document.getElementById('maxAgeVal').innerText = maxSlider.value;
        distSlider.oninput = () => document.getElementById('distancePrefVal').innerText = distSlider.value;
        document.getElementById('savePrefsBtn').onclick = async () => {
            await updateDoc(doc(db,"users",currentUser.uid),{ prefAgeMin: parseInt(minSlider.value), prefAgeMax: parseInt(maxSlider.value), prefDistance: parseInt(distSlider.value) });
            await customAlert("Preferences saved", "Success");
        };
    }
    if(section === 'premium') {
        document.getElementById('subscribeGoldBtn')?.addEventListener('click', () => upgradeToPremium(currentUser.uid, 'gold'));
        document.getElementById('subscribePlatinumBtn')?.addEventListener('click', () => upgradeToPremium(currentUser.uid, 'platinum'));
    }
    document.getElementById('backFromSettings').onclick = () => { document.getElementById('settingsDetailView').style.display = 'none'; document.getElementById('profileView').classList.add('active-view'); renderProfileUI(); };
}
async function upgradeToPremium(userId, plan) {
    const expiresAt = Date.now() + 30*24*60*60*1000;
    let features = {
        unlimitedSwipes: true,
        seeWhoLikedYou: true,
        readReceipts: plan === 'platinum',
        boost: plan === 'platinum'
    };
    await updateDoc(doc(db, "users", userId), {
        isPremium: true, premiumPlan: plan, premiumExpiresAt: expiresAt,
        features,
        verified: true
    });
    await refreshCurrentUser();
    await customAlert(`Upgraded to ${plan.toUpperCase()}!`, "Premium");
    renderProfileUI();
}
function showUpgradeModal() {
    const modal = document.createElement('div'); modal.className = 'upgrade-modal';
    modal.innerHTML = `<h3>Choose Plan</h3><div class="upgrade-plan" data-plan="gold"><strong>Gold – $3.27/month</strong><br>Unlimited swipes + See who liked you</div><div class="upgrade-plan" data-plan="platinum"><strong>Platinum – $12.99/month</strong><br>All Gold + Read receipts + Boost</div><button class="small-glass" id="closeUpgradeModal">Cancel</button>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.upgrade-plan').forEach(btn => btn.addEventListener('click', async () => {
        await upgradeToPremium(currentUser.uid, btn.dataset.plan);
        modal.remove();
    }));
    modal.querySelector('#closeUpgradeModal').onclick = () => modal.remove();
}

// ========== NEW: INVITE FRIENDS (Share Sheet) ==========
async function showContactsInvite() {
    const link = `https://ceezy-website.web.app?ref=${currentUser.referralCode}`;
    const shareData = {
        title: 'Join MEET',
        text: 'Check out MEET – where sparks glow! Use my link to sign up and we both get premium.',
        url: link
    };
    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.log('Share cancelled', err);
        }
    } else {
        await navigator.clipboard.writeText(link).then(() => {
            customAlert("Referral link copied to clipboard! Share it via your favorite app.", "Invite Friends");
        }).catch(() => {
            customPrompt("Share this link manually:", link, "Invite Friends");
        });
    }
}

// ========== NEW: RATING MODAL ==========
function showRatingModal() {
    const modal = document.createElement('div');
    modal.className = 'custom-modal';
    modal.innerHTML = `
        <div class="custom-modal-content">
            <h3>Rate App</h3>
            <div class="rating-stars" id="ratingStars">
                <span class="star" data-value="1">☆</span>
                <span class="star" data-value="2">☆</span>
                <span class="star" data-value="3">☆</span>
                <span class="star" data-value="4">☆</span>
                <span class="star" data-value="5">☆</span>
            </div>
            <textarea id="reviewComment" rows="3" placeholder="Write a review (optional)" style="width:100%; background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.4); border-radius:16px; color:white; padding:8px; margin:10px 0;"></textarea>
            <div class="custom-modal-buttons">
                <button class="confirm-btn" id="submitRating">Submit</button>
                <button class="cancel-btn" id="closeRating">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    let selectedRating = 0;
    const stars = modal.querySelectorAll('.star');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.value);
            stars.forEach(s => { s.textContent = s.dataset.value <= selectedRating ? '★' : '☆'; });
        });
    });
    modal.querySelector('#closeRating').onclick = () => modal.remove();
    modal.querySelector('#submitRating').onclick = () => {
        const comment = modal.querySelector('#reviewComment').value;
        const subject = encodeURIComponent(`App Rating: ${selectedRating} stars`);
        const body = encodeURIComponent(`Rating: ${selectedRating}/5\nComment: ${comment}\nUser: ${currentUser?.email || 'anonymous'}`);
        window.open(`mailto:czytechnology00@gmail.com?subject=${subject}&body=${body}`, '_blank');
        modal.remove();
        customAlert("Thank you! Your email client will open to send the review.", "Review");
    };
}

// ========== NEW: DELETE ACCOUNT ==========
async function deleteAccount() {
    if (!currentUser) return;
    const confirmed = await customConfirm(
        "Are you sure you want to delete your account? This action cannot be undone. All your data will be permanently removed.",
        "Delete Account"
    );
    if (!confirmed) return;
    try {
        // Delete user document from Firestore
        await deleteDoc(doc(db, "users", currentUser.uid));
        // Sign out from Firebase Auth
        await signOut(auth);
        localStorage.removeItem('currentUserUid');
        customAlert("Your account has been deleted. You will be logged out.", "Account Deleted");
        window.location.reload();
    } catch (err) {
        customAlert("Failed to delete account: " + err.message, "Error");
    }
}

// ========== NEW: MEET AI (Real OpenAI API) ==========
const OPENAI_API_KEY = 'YOUR_OPENAI_API_KEY'; // Replace with your real key

let aiConversation = [
    { role: "system", content: "You are MEET AI, a helpful assistant in a dating app. Provide dating tips, relationship advice, matching suggestions, date plan ideas, emotional support, and guidance on using the app. Keep answers concise and friendly." }
];

// Open/close chat with auth check
document.getElementById('aiChatToggleBtn').addEventListener('click', () => {
    if (!currentUser) {
        customAlert("Please log in to use MEET AI.", "Authentication Required");
        return;
    }
    const win = document.getElementById('aiChatWindow');
    win.style.display = (win.style.display === 'flex') ? 'none' : 'flex';
    if (win.style.display === 'flex') document.getElementById('aiChatInput').focus();
});

document.getElementById('closeAiChat').addEventListener('click', () => {
    document.getElementById('aiChatWindow').style.display = 'none';
});

document.getElementById('sendAiMsg').addEventListener('click', sendAiMessage);
document.getElementById('aiChatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAiMessage();
});

async function sendAiMessage() {
    const input = document.getElementById('aiChatInput');
    const text = input.value.trim();
    if (!text) return;
    addAiBubble(text, 'user');
    aiConversation.push({ role: 'user', content: text });
    input.value = '';

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message bot typing-indicator';
    typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    const body = document.getElementById('aiChatBody');
    body.appendChild(typingDiv);
    body.scrollTop = body.scrollHeight;

    try {
        const reply = await fetchOpenAIResponse();
        typingDiv.remove();
        addAiBubble(reply, 'bot');
        aiConversation.push({ role: 'assistant', content: reply });
    } catch (err) {
        typingDiv.remove();
        addAiBubble("Sorry, I'm having trouble right now. Please try again later.", 'bot');
        console.error('AI error:', err);
    }
}

function addAiBubble(text, sender) {
    const bubble = document.createElement('div');
    bubble.className = `ai-message ${sender}`;
    bubble.textContent = text;
    document.getElementById('aiChatBody').appendChild(bubble);
    bubble.scrollIntoView({ behavior: 'smooth' });
}

async function fetchOpenAIResponse() {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: aiConversation,
            temperature: 0.7,
            max_tokens: 300
        })
    });
    if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

// ========== LIFE-CYCLE ==========
function attachNavEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            const viewId = item.dataset.nav;
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
            document.getElementById(viewId + 'View').classList.add('active-view');
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            if(viewId === 'messages') { document.getElementById('chatListContainer').style.display = 'block'; document.getElementById('chatScreenContainer').style.display = 'none'; if(unsubscribeMessages) unsubscribeMessages(); await renderChatList(); }
            if(viewId === 'explore') await renderExplore();
            if(viewId === 'profile') await renderProfileUI();
            if(viewId === 'swipe') await renderSwipeCards();
            document.getElementById('editProfileView').style.display = 'none';
            document.getElementById('settingsDetailView').style.display = 'none';
        });
    });
    document.querySelector('.nav-item[data-nav="swipe"]').classList.add('active');
}
async function showMainApp() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('signupView').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    await loadCurrentUser();
    requestNotificationPermission();
    if(unsubscribeUser) unsubscribeUser();
    const userRef = doc(db, "users", currentUser.uid);
    unsubscribeUser = onSnapshot(userRef, (docSnap) => { if(docSnap.exists()) { currentUser = docSnap.data(); renderProfileUI(); renderSwipeCards(); renderExplore(); renderChatList(); } });
    await renderAll();
    attachNavEvents();
    await renderSwipeCards();
    renderChatList();
    startHeartbeat();
    await updateLastSeen();
    listenForNotifications();
    window.addEventListener('beforeunload', async () => { if(currentUser) await updateDoc(doc(db,"users",currentUser.uid),{ lastSeen: 0 }); if(heartbeatInterval) clearInterval(heartbeatInterval); if(unsubscribeNotifications) unsubscribeNotifications(); });
}
async function startHeartbeat() { if(heartbeatInterval) clearInterval(heartbeatInterval); heartbeatInterval = setInterval(async () => { if(currentUser) await updateDoc(doc(db,"users",currentUser.uid),{ lastSeen: Date.now() }); }, 30000); }
async function updateLastSeen() { if(currentUser) await updateDoc(doc(db,"users",currentUser.uid),{ lastSeen: Date.now() }); }
async function loadCurrentUser() { const uid = localStorage.getItem('currentUserUid'); if(uid) currentUser = (await getDoc(doc(db,"users",uid))).data(); }
async function renderAll() { await renderProfileUI(); await renderChatList(); await renderExplore(); }

// UI event binding
document.getElementById('goToSignupLink')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('loginView').style.display = 'none'; document.getElementById('signupView').style.display = 'flex'; });
document.getElementById('goToLoginLink')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('signupView').style.display = 'none'; document.getElementById('loginView').style.display = 'flex'; });
document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => { const email = await customPrompt("Enter your email:", "", "Reset Password"); if(email) sendPasswordResetEmail(auth, email).then(()=>customAlert("Reset email sent", "Email")).catch(err=>customAlert(err.message, "Error")); });
document.getElementById('appealBanBtn')?.addEventListener('click', async () => {
    const email = await customPrompt("Enter your email address:", "", "Appeal Ban");
    if (!email) return;
    const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
    if (usersSnap.empty) { await customAlert("No account found with that email.", "Not Found"); return; }
    const userDoc = usersSnap.docs[0];
    const userData = userDoc.data();
    if (!userData.banned) { await customAlert("This account is not banned.", "Not Banned"); return; }
    const reason = await customPrompt("Please explain why you should be unbanned:", "", "Appeal Reason");
    if (reason) {
        await addDoc(collection(db, "appeals"), { userId: userDoc.id, reason, status: "pending", timestamp: Date.now() });
        await customAlert("Your appeal has been submitted.", "Appeal Submitted");
    }
});
document.getElementById('googleSignInBtn')?.addEventListener('click', async () => { try{ const user=await window.signInWithGoogle(); localStorage.setItem('currentUserUid',user.uid); currentUser=(await getDoc(doc(db,"users",user.uid))).data(); showMainApp(); }catch(err){ await customAlert(err.message, "Error"); } });
document.getElementById('googleSignUpBtn')?.addEventListener('click', async () => { try{ const user=await window.signInWithGoogle(); localStorage.setItem('currentUserUid',user.uid); currentUser=(await getDoc(doc(db,"users",user.uid))).data(); showMainApp(); }catch(err){ await customAlert(err.message, "Error"); } });
document.getElementById('signupFormElem')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name=document.getElementById('signupName').value, email=document.getElementById('signupEmail').value, pwd=document.getElementById('signupPassword').value, confirm=document.getElementById('confirmPwd').value;
    if(pwd!==confirm){ await customAlert("Passwords mismatch", "Error"); return; }
    const gender=document.getElementById('signupGender').value, age=document.getElementById('signupAge').value;
    const refCode=document.getElementById('signupReferralCode').value;
    try{
        await window.signupUser(email,pwd,name,age,gender, refCode);
        document.getElementById('signupView').style.display='none'; document.getElementById('loginView').style.display='flex';
    }catch(err){ await customAlert("Signup failed: "+err.message, "Error"); }
});
document.getElementById('loginFormElem')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email=document.getElementById('loginEmail').value, pwd=document.getElementById('loginPassword').value;
    try{
        const user=await window.loginUserFirebase(email,pwd);
        localStorage.setItem('currentUserUid',user.uid);
        currentUser=(await getDoc(doc(db,"users",user.uid))).data();
        showMainApp();
    }catch(err){ await customAlert("Login failed: "+err.message, "Error"); }
});
document.getElementById('uploadIntroBtn')?.addEventListener('click', () => { const file=document.getElementById('introUploadInput').files[0]; if(file) uploadIntro(file); else customAlert("Select a file first", "Error"); });
document.getElementById('applyFilterBtn')?.addEventListener('click', () => renderExplore());
document.querySelectorAll('.toggle-pwd').forEach(icon=>{ icon.addEventListener('click',function(){ let target=document.getElementById(this.dataset.target); if(target.type==='password') target.type='text'; else target.type='password'; this.classList.toggle('fa-eye');}); });

// Pre‑fill referral code from URL
(function() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
        const loginGroup = document.getElementById('loginReferralGroup');
        const loginInput = document.getElementById('loginReferralCode');
        if (loginGroup && loginInput) {
            loginGroup.style.display = 'block';
            loginInput.value = ref;
        }
        const signupInput = document.getElementById('signupReferralCode');
        if (signupInput) signupInput.value = ref;
    }
})();

if(localStorage.getItem('currentUserUid')) {
    loadCurrentUser().then(()=>{
        if(currentUser) showMainApp();
        else document.getElementById('loginView').style.display='flex';
    });
} else {
    document.getElementById('loginView').style.display='flex';
}

// Service worker registration
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js")
        .then(() => console.log("Service Worker Registered"))
        .catch(err => console.log("SW error", err));
}

// Download rules button
document.getElementById('downloadRulesBtn').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([document.getElementById('firebaseRules').value], { type: 'text/plain' }));
    a.download = 'firestore.rules';
    a.click();
    URL.revokeObjectURL(a.href);
};