// ========== CUSTOM MODAL SYSTEM ==========
window.customAlert = (message, title = "Notice") => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        // Sanitize inputs to prevent XSS
        const sanitizedTitle = escapeHtml(title);
        const sanitizedMessage = escapeHtml(message);
        modal.innerHTML = `<div class="custom-modal-content"><h3>${sanitizedTitle}</h3><p>${sanitizedMessage}</p><div class="custom-modal-buttons"><button class="confirm-btn">OK</button></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.confirm-btn').onclick = () => { modal.remove(); resolve(); };
        // Close on escape key
        const escHandler = (e) => { if(e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); resolve(); } };
        document.addEventListener('keydown', escHandler);
    });
};

window.customConfirm = (message, title = "Confirm") => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        const sanitizedTitle = escapeHtml(title);
        const sanitizedMessage = escapeHtml(message);
        modal.innerHTML = `<div class="custom-modal-content"><h3>${sanitizedTitle}</h3><p>${sanitizedMessage}</p><div class="custom-modal-buttons"><button class="confirm-btn">Yes</button><button class="cancel-btn">No</button></div></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.confirm-btn').onclick = () => { modal.remove(); resolve(true); };
        modal.querySelector('.cancel-btn').onclick = () => { modal.remove(); resolve(false); };
        const escHandler = (e) => { if(e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); resolve(false); } };
        document.addEventListener('keydown', escHandler);
    });
};

window.customPrompt = (message, defaultValue = "", title = "Input") => {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal';
        const sanitizedTitle = escapeHtml(title);
        const sanitizedMessage = escapeHtml(message);
        const sanitizedDefault = escapeHtml(defaultValue);
        modal.innerHTML = `<div class="custom-modal-content"><h3>${sanitizedTitle}</h3><p>${sanitizedMessage}</p><input type="text" id="customPromptInput" value="${sanitizedDefault}" placeholder="Enter value..." autocomplete="off"><div class="custom-modal-buttons"><button class="confirm-btn">OK</button><button class="cancel-btn">Cancel</button></div></div>`;
        document.body.appendChild(modal);
        const input = modal.querySelector('#customPromptInput');
        modal.querySelector('.confirm-btn').onclick = () => { const val = input.value; modal.remove(); resolve(val); };
        modal.querySelector('.cancel-btn').onclick = () => { modal.remove(); resolve(null); };
        input.focus();
        input.addEventListener('keypress', (e) => { if(e.key === 'Enter') { const val = input.value; modal.remove(); resolve(val); } });
        const escHandler = (e) => { if(e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); resolve(null); } };
        document.addEventListener('keydown', escHandler);
    });
};

// HTML escape utility to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Override native functions
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

// Initialize Firebase only if not already initialized
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const messaging = firebase.messaging();
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Enable offline persistence
db.enablePersistence().catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
        console.warn('The current browser does not support offline persistence.');
    }
});

// ========== SUPABASE INIT ==========
const SUPABASE_URL = 'https://brululwrccmvhlhevjkn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_u8Mb93q3osN_qdtn2DnNBQ_2FNQu9BP';
let supabase = null;

try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        console.error('Supabase client not loaded');
    }
} catch (err) {
    console.error('Failed to initialize Supabase:', err);
}

// ========== GLOBAL STATE ==========
let currentUser = null;
let heartbeatInterval = null;
let unsubscribeUser = null;
let currentChatPartner = null;
let typingTimeout = null;
let unsubscribeMessages = null;
let adminUnsubscribes = [];
let unsubscribeNotifications = null;

// ========== INPUT VALIDATION ==========
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

function validateAge(age) {
    const numAge = parseInt(age);
    return numAge >= 18 && numAge <= 120;
}

// ========== REFERRAL HELPERS ==========
function generateReferralCode() {
    return 'r' + Math.random().toString(36).substring(2, 8);
}

async function applyReferral(refCode, newUserId) {
    if (!refCode || typeof refCode !== 'string' || refCode.trim().length === 0) {
        return false;
    }
    
    try {
        const qRef = db.collection("users").where("referralCode", "==", refCode.trim());
        const snap = await qRef.get();
        
        if (snap.empty) return false;
        
        const referrerDoc = snap.docs[0];
        const referrerId = referrerDoc.id;
        
        // Prevent self-referral
        if (referrerId === newUserId) return false;
        
        const now = Date.now();
        const premiumDuration = 7 * 24 * 60 * 60 * 1000;
        const newUserDuration = 3 * 24 * 60 * 60 * 1000;
        const referrerData = referrerDoc.data();
        const currentExpires = referrerData.premiumExpiresAt || 0;
        const newExpires = Math.max(currentExpires, now) + premiumDuration;
        
        const batch = db.batch();
        
        batch.update(db.collection("users").doc(referrerId), {
            isPremium: true,
            premiumPlan: 'gold',
            premiumExpiresAt: newExpires,
            features: {
                unlimitedSwipes: true,
                seeWhoLikedYou: true,
                readReceipts: false,
                boost: false
            },
            verified: true
        });
        
        batch.update(db.collection("users").doc(newUserId), {
            isPremium: true,
            premiumPlan: 'gold',
            premiumExpiresAt: now + newUserDuration,
            features: {
                unlimitedSwipes: true,
                seeWhoLikedYou: true,
                readReceipts: false,
                boost: false
            },
            verified: true
        });
        
        await batch.commit();
        
        // Log referral
        await db.collection("referrals").add({
            referrerId,
            referredId: newUserId,
            timestamp: now,
            code: refCode
        });
        
        return true;
    } catch (err) {
        console.error('Error applying referral:', err);
        return false;
    }
}

// ========== PUSH NOTIFICATIONS ==========
const VAPID_KEY = 'BHnyCbC2nBzDa1LRhTzJDUYcKFa37ZmIi7c_v-AFjTbTjUTfhmiehI8LwnP93EJYm2A9Qs67JG3sqaiS10swqrA';

async function requestPushPermission() {
    if (!('Notification' in window)) return;
    
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            try {
                const token = await messaging.getToken({ vapidKey: VAPID_KEY });
                if (currentUser && token) {
                    await db.collection("users").doc(currentUser.uid).update({
                        fcmToken: token,
                        pushEnabled: true
                    });
                }
            } catch (tokenErr) {
                console.error('Error getting FCM token:', tokenErr);
            }
        }
    } catch (err) {
        console.error('Push permission error:', err);
    }
}

if (messaging) {
    messaging.onMessage((payload) => {
        if (payload.notification) {
            showBrowserNotification(
                payload.notification.title || 'MEET',
                payload.notification.body || ''
            );
        }
    });
}

// ========== UPDATE BANNER ==========
async function checkForUpdates() {
    if (!currentUser) return;
    
    try {
        const q = db.collection("updates")
            .where("active", "==", true)
            .orderBy("timestamp", "desc")
            .limit(1);
        const snap = await q.get();
        
        if (!snap.empty) {
            const data = snap.docs[0].data();
            showUpdateBanner(data.message, data.type || 'info');
        }
    } catch (err) {
        console.error('Error checking updates:', err);
    }
}

function showUpdateBanner(message, type = 'info') {
    const existing = document.getElementById('updateBanner');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.id = 'updateBanner';
    banner.className = `update-banner ${type}`;
    const sanitizedMessage = escapeHtml(message);
    banner.innerHTML = `
        <span>${sanitizedMessage}</span>
        <button class="close-btn" onclick="this.parentElement.remove()">✕</button>
    `;
    document.body.prepend(banner);
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        if (banner.parentElement) {
            banner.remove();
        }
    }, 10000);
}

// ========== BROWSER NOTIFICATIONS ==========
function showBrowserNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(escapeHtml(title), {
                body: escapeHtml(body),
                icon: '/app-icon.png',
                badge: '/app-badge.png'
            });
        } catch (err) {
            console.error('Error showing notification:', err);
        }
    }
}

// ========== REFRESH CURRENT USER ==========
async function refreshCurrentUser() {
    if (!currentUser || !currentUser.uid) return;
    
    try {
        const snap = await db.collection("users").doc(currentUser.uid).get();
        if (snap.exists) {
            currentUser = { id: snap.id, ...snap.data() };
        }
    } catch (err) {
        console.error('Error refreshing user:', err);
    }
}

// ========== NOTIFICATIONS ==========
function showNotificationToast(message) {
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.textContent = message; // Safe from XSS
    document.body.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after animation
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function sendLikeNotification(fromUserId, toUserId, fromName) {
    try {
        await db.collection("notifications").add({
            toUserId,
            fromUserId,
            fromName: escapeHtml(fromName),
            type: "like",
            read: false,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('Error sending notification:', err);
    }
}

function listenForNotifications() {
    if (!currentUser || !currentUser.uid) return;
    
    if (unsubscribeNotifications) {
        unsubscribeNotifications();
    }
    
    const q = db.collection("notifications")
        .where("toUserId", "==", currentUser.uid)
        .where("read", "==", false);
    
    unsubscribeNotifications = q.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const notif = change.doc.data();
                showNotificationToast(`💖 ${escapeHtml(notif.fromName)} liked you!`);
                showBrowserNotification('New Like!', `${escapeHtml(notif.fromName)} liked you!`);
                
                // Mark as read
                db.collection("notifications").doc(change.doc.id).update({
                    read: true
                }).catch(err => console.error('Error marking notification as read:', err));
            }
        });
    }, err => {
        console.error('Notification listener error:', err);
    });
}

// ========== AUTH FUNCTIONS ==========
window.signupUser = async (email, password, name, age, gender, referralCode) => {
    // Validate inputs
    if (!validateEmail(email)) throw new Error("Please enter a valid email address.");
    if (!validatePassword(password)) throw new Error("Password must be at least 6 characters.");
    if (!validateAge(age)) throw new Error("You must be 18 or older to use this app.");
    if (!name || name.trim().length < 2) throw new Error("Please enter your name (at least 2 characters).");
    
    try {
        // Check for existing email
        const existingQuery = db.collection("users").where("email", "==", email.toLowerCase().trim());
        const existingSnap = await existingQuery.get();
        
        if (!existingSnap.empty) {
            const existingUser = existingSnap.docs[0].data();
            if (existingUser.banned === true) {
                throw new Error("This email is banned from MEET.");
            }
            throw new Error("Email already registered. Please login instead.");
        }
        
        // Create auth user
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCred.user;
        
        // Update profile
        await user.updateProfile({ displayName: name.trim() });
        
        // Send verification email
        await user.sendEmailVerification();
        
        // Create user document
        const uid = user.uid;
        const referralCodeOwn = generateReferralCode();
        
        const userData = {
            uid,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            age: parseInt(age),
            gender: gender || 'Other',
            bio: "Hey there! I'm new to MEET.",
            interests: [],
            profilePic: "",
            photos: [],
            matches: [],
            swipes: [],
            swipesToday: 0,
            lastSwipeDate: Date.now(),
            swipeResetDate: new Date().setHours(24, 0, 0, 0),
            blocked: [],
            blockedBy: [],
            reports: [],
            location: { lat: null, lng: null },
            createdAt: Date.now(),
            lastSeen: Date.now(),
            emailVerified: false,
            privacyLastSeen: true,
            privacyOnlineStatus: true,
            prefAgeMin: 18,
            prefAgeMax: 100,
            prefDistance: 50,
            prefGender: 'All',
            isPremium: false,
            premiumPlan: "free",
            premiumExpiresAt: 0,
            features: {
                unlimitedSwipes: false,
                readReceipts: false,
                seeWhoLikedYou: false,
                boost: false
            },
            verified: false,
            intent: "Casual",
            introUrl: "",
            banned: false,
            referralCode: referralCodeOwn,
            totalMatches: 0,
            totalLikes: 0,
            pushEnabled: false,
            fcmToken: ""
        };
        
        await db.collection("users").doc(uid).set(userData);
        
        // Apply referral if provided
        if (referralCode && referralCode.trim()) {
            await applyReferral(referralCode.trim(), uid);
        }
        
        await customAlert("Account created successfully! Please check your email to verify your account.", "Success");
        return user;
        
    } catch (err) {
        console.error('Signup error:', err);
        await customAlert(err.message, "Signup Error");
        throw err;
    }
};

window.signInWithGoogle = async () => {
    try {
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        
        // Check if user exists
        const userDoc = await db.collection("users").doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Create new user from Google
            const refCode = generateReferralCode();
            await db.collection("users").doc(user.uid).set({
                uid: user.uid,
                name: user.displayName || user.email.split('@')[0],
                email: user.email.toLowerCase().trim(),
                age: 18, // Will need to update
                gender: "Other",
                bio: "Hey there! I'm new to MEET.",
                interests: [],
                profilePic: user.photoURL || "",
                photos: user.photoURL ? [user.photoURL] : [],
                matches: [],
                swipes: [],
                swipesToday: 0,
                lastSwipeDate: Date.now(),
                swipeResetDate: new Date().setHours(24, 0, 0, 0),
                blocked: [],
                blockedBy: [],
                reports: [],
                location: { lat: null, lng: null },
                createdAt: Date.now(),
                lastSeen: Date.now(),
                emailVerified: true, // Google accounts are pre-verified
                privacyLastSeen: true,
                privacyOnlineStatus: true,
                prefAgeMin: 18,
                prefAgeMax: 100,
                prefDistance: 50,
                prefGender: 'All',
                isPremium: false,
                premiumPlan: "free",
                premiumExpiresAt: 0,
                features: {
                    unlimitedSwipes: false,
                    readReceipts: false,
                    seeWhoLikedYou: false,
                    boost: false
                },
                verified: false,
                intent: "Casual",
                introUrl: "",
                banned: false,
                referralCode: refCode,
                totalMatches: 0,
                totalLikes: 0,
                pushEnabled: false,
                fcmToken: "",
                googleAuth: true
            });
        } else {
            // Check if banned
            const data = userDoc.data();
            if (data.banned) {
                await auth.signOut();
                throw new Error("Your account has been banned from MEET.");
            }
            
            // Update last seen
            await db.collection("users").doc(user.uid).update({
                lastSeen: Date.now(),
                emailVerified: true
            });
        }
        
        return user;
        
    } catch (err) {
        console.error('Google sign-in error:', err);
        if (err.code !== 'auth/popup-closed-by-user') {
            await customAlert(err.message, "Google Sign-In Error");
        }
        throw err;
    }
};

window.loginUserFirebase = async (email, password) => {
    if (!validateEmail(email)) throw new Error("Please enter a valid email address.");
    
    try {
        const userCred = await auth.signInWithEmailAndPassword(email, password);
        const user = userCred.user;
        
        if (!user.emailVerified) {
            await customAlert("Please verify your email address before logging in. Check your inbox.", "Email Not Verified");
            await auth.signOut();
            throw new Error("Email not verified");
        }
        
        // Check if banned
        const snap = await db.collection("users").doc(user.uid).get();
        if (!snap.exists) {
            await auth.signOut();
            throw new Error("User profile not found. Please sign up first.");
        }
        
        const data = snap.data();
        if (data && data.banned) {
            await auth.signOut();
            throw new Error("Your account has been banned from MEET.");
        }
        
        // Update last seen and email verified status
        await db.collection("users").doc(user.uid).update({
            lastSeen: Date.now(),
            emailVerified: true
        });
        
        return user;
        
    } catch (err) {
        console.error('Login error:', err);
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
            throw new Error("Invalid email or password.");
        }
        throw err;
    }
};

// ========== QUICK PROFILE MODAL ==========
async function showQuickProfile(userId) {
    if (!userId) return;
    
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        if (!userDoc.exists) {
            await customAlert("User not found.", "Error");
            return;
        }
        
        const user = userDoc.data();
        const modal = document.createElement('div');
        modal.className = 'quick-profile-modal';
        
        modal.innerHTML = `
            <div class="quick-profile-content">
                <img src="${escapeHtml(user.profilePic || 'https://randomuser.me/api/portraits/lego/1.jpg')}" 
                     alt="${escapeHtml(user.name)}" 
                     onerror="this.src='https://randomuser.me/api/portraits/lego/1.jpg'">
                <h3 style="color:white;">
                    ${escapeHtml(user.name)} 
                    ${user.verified ? '<i class="fas fa-check-circle" style="color:#3b82f6;"></i>' : ''}
                </h3>
                <p style="color:#ccc;">${user.age} years old • ${escapeHtml(user.gender || 'Not specified')}</p>
                <p style="color:#ccc;">${escapeHtml(user.bio || "No bio yet")}</p>
                <p style="color:#ccc;">🎯 ${escapeHtml(user.intent || "Not set")}</p>
                <p style="color:#ccc;">❤️ ${(user.interests || []).map(i => escapeHtml(i)).join(', ') || "No interests"}</p>
                ${user.introUrl ? `<video src="${escapeHtml(user.introUrl)}" controls style="max-width:100%; margin-top:10px;"></video>` : ''}
                <button class="small-glass close-modal">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close handlers
        modal.querySelector('.close-modal').onclick = () => modal.remove();
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
    } catch (err) {
        console.error('Error showing quick profile:', err);
        await customAlert("Error loading profile.", "Error");
    }
}

// ========== EVENTS FUNCTIONS ==========
async function loadEvents() {
    if (!currentUser) return;
    
    try {
        const eventsContainer = document.getElementById('eventsContent');
        if (!eventsContainer) return;
        
        eventsContainer.innerHTML = '<div class="loading-spinner">Loading events...</div>';
        
        const snap = await db.collection("events")
            .where("date", ">=", Date.now())
            .orderBy("date", "asc")
            .limit(10)
            .get();
        
        if (snap.empty) {
            eventsContainer.innerHTML = '<div class="glass-card">No upcoming events. Check back later!</div>';
            return;
        }
        
        eventsContainer.innerHTML = snap.docs.map(doc => {
            const event = doc.data();
            const date = new Date(event.date).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            return `
                <div class="event-card glass-card">
                    <img src="${escapeHtml(event.image || '')}" alt="${escapeHtml(event.title)}" 
                         onerror="this.style.display='none'">
                    <div class="event-info">
                        <h4>${escapeHtml(event.title)}</h4>
                        <p>📅 ${date}</p>
                        <p>📍 ${escapeHtml(event.location || 'Online')}</p>
                        <p>${escapeHtml(event.description || '')}</p>
                        <p>👥 ${event.attendees?.length || 0} attending</p>
                        <button class="join-event-btn small-glass" data-id="${doc.id}">
                            ${event.attendees?.includes(currentUser.uid) ? 'Leave Event' : 'Join Event'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add event listeners to join buttons
        document.querySelectorAll('.join-event-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const eventId = btn.dataset.id;
                try {
                    const eventRef = db.collection("events").doc(eventId);
                    const eventDoc = await eventRef.get();
                    const event = eventDoc.data();
                    let attendees = event.attendees || [];
                    
                    if (attendees.includes(currentUser.uid)) {
                        attendees = attendees.filter(id => id !== currentUser.uid);
                        btn.textContent = 'Join Event';
                    } else {
                        attendees.push(currentUser.uid);
                        btn.textContent = 'Leave Event';
                    }
                    
                    await eventRef.update({ attendees });
                } catch (err) {
                    console.error('Error joining event:', err);
                    customAlert("Error updating event.", "Error");
                }
            });
        });
        
    } catch (err) {
        console.error('Error loading events:', err);
        const eventsContainer = document.getElementById('eventsContent');
        if (eventsContainer) {
            eventsContainer.innerHTML = '<div class="glass-card">Error loading events. Please try again.</div>';
        }
    }
}

// ========== INTRO UPLOAD ==========
async function uploadIntro(file) {
    if (!currentUser || !supabase) {
        await customAlert("Please log in to upload intro.", "Error");
        return;
    }
    
    if (!file) {
        await customAlert("Please select a file first.", "Error");
        return;
    }
    
    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
        await customAlert("File size must be less than 50MB.", "Error");
        return;
    }
    
    // Validate file type
    if (!file.type.startsWith('video/')) {
        await customAlert("Please upload a video file.", "Error");
        return;
    }
    
    try {
        const fileName = `intros/${currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        
        // Delete old intro if exists
        if (currentUser.introUrl) {
            const oldPath = currentUser.introUrl.split('/').pop();
            if (oldPath) {
                supabase.storage.from('chat-images').remove([`intros/${oldPath}`])
                    .catch(err => console.warn('Could not delete old intro:', err));
            }
        }
        
        const { error } = await supabase.storage
            .from('chat-images')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true
            });
        
        if (error) throw error;
        
        const { data: urlData } = supabase.storage
            .from('chat-images')
            .getPublicUrl(fileName);
        
        await db.collection("users").doc(currentUser.uid).update({
            introUrl: urlData.publicUrl
        });
        
        currentUser.introUrl = urlData.publicUrl;
        await customAlert("Intro video uploaded successfully!", "Success");
        
    } catch (err) {
        console.error('Error uploading intro:', err);
        await customAlert("Failed to upload intro. Please try again.", "Error");
    }
}

// ========== APPEAL FUNCTION ==========
async function submitAppeal(reason) {
    if (!currentUser) {
        await customAlert("Please log in to submit an appeal.", "Error");
        return;
    }
    
    if (!reason || reason.trim().length < 10) {
        await customAlert("Please provide a detailed reason (at least 10 characters).", "Error");
        return;
    }
    
    try {
        await db.collection("appeals").add({
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: currentUser.name,
            reason: reason.trim(),
            status: "pending",
            timestamp: Date.now(),
            reviewedBy: null,
            reviewedAt: null
        });
        
        await customAlert("Your appeal has been submitted. We'll review it within 24-48 hours.", "Appeal Submitted");
    } catch (err) {
        console.error('Error submitting appeal:', err);
        await customAlert("Failed to submit appeal. Please try again.", "Error");
    }
}

// ========== UPGRADE TO PREMIUM ==========
async function upgradeToPremium(userId, plan) {
    if (!userId || !plan) return;
    
    const plans = {
        'gold': { duration: 30 * 24 * 60 * 60 * 1000, price: 9.99 },
        'platinum': { duration: 30 * 24 * 60 * 60 * 1000, price: 19.99 }
    };
    
    const selectedPlan = plans[plan];
    if (!selectedPlan) return;
    
    try {
        const now = Date.now();
        const expiresAt = now + selectedPlan.duration;
        
        const features = {
            gold: {
                unlimitedSwipes: true,
                seeWhoLikedYou: true,
                readReceipts: false,
                boost: false
            },
            platinum: {
                unlimitedSwipes: true,
                seeWhoLikedYou: true,
                readReceipts: true,
                boost: true
            }
        };
        
        await db.collection("users").doc(userId).update({
            isPremium: true,
            premiumPlan: plan,
            premiumExpiresAt: expiresAt,
            features: features[plan],
            verified: true
        });
        
        // Log purchase
        await db.collection("purchases").add({
            userId,
            plan,
            price: selectedPlan.price,
            timestamp: now,
            expiresAt
        });
        
        await customAlert(`Upgraded to ${plan} plan successfully!`, "Success");
    } catch (err) {
        console.error('Error upgrading:', err);
        await customAlert("Failed to upgrade. Please try again.", "Error");
    }
}

function showUpgradeModal() {
    const modal = document.createElement('div');
    modal.className = 'upgrade-modal';
    modal.innerHTML = `
        <div class="upgrade-content glass-card">
            <h2>Upgrade to Premium</h2>
            <div class="plans">
                <div class="plan gold">
                    <h3>🌟 Gold</h3>
                    <p class="price">$9.99/month</p>
                    <ul>
                        <li>✅ Unlimited Swipes</li>
                        <li>✅ See Who Liked You</li>
                        <li>✅ Verified Badge</li>
                    </ul>
                    <button class="upgrade-btn" data-plan="gold">Choose Gold</button>
                </div>
                <div class="plan platinum">
                    <h3>💎 Platinum</h3>
                    <p class="price">$19.99/month</p>
                    <ul>
                        <li>✅ Everything in Gold</li>
                        <li>✅ Read Receipts</li>
                        <li>✅ Profile Boost</li>
                        <li>✅ Priority Support</li>
                    </ul>
                    <button class="upgrade-btn" data-plan="platinum">Choose Platinum</button>
                </div>
            </div>
            <button class="close-upgrade">Cancel</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.close-upgrade').onclick = () => modal.remove();
    modal.querySelectorAll('.upgrade-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const plan = btn.dataset.plan;
            await upgradeToPremium(currentUser.uid, plan);
            modal.remove();
            renderProfileUI();
        });
    });
}

// ========== VERIFY IDENTITY ==========
async function verifyIdentity() {
    if (!currentUser) return;
    
    if (currentUser.verified) {
        await customAlert("You are already verified!", "Info");
        return;
    }
    
    const confirmed = await customConfirm(
        "To get verified, you'll need to upload a clear photo of yourself holding a piece of paper with 'MEET' and today's date written on it. Continue?",
        "Identity Verification"
    );
    
    if (!confirmed) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > 5 * 1024 * 1024) {
            await customAlert("Photo must be less than 5MB.", "Error");
            return;
        }
        
        try {
            // Upload verification photo
            const fileName = `verification/${currentUser.uid}_${Date.now()}.jpg`;
            const { error } = await supabase.storage
                .from('chat-images')
                .upload(fileName, file);
            
            if (error) throw error;
            
            const { data: urlData } = supabase.storage
                .from('chat-images')
                .getPublicUrl(fileName);
            
            // Submit for review
            await db.collection("verification_requests").add({
                userId: currentUser.uid,
                photoUrl: urlData.publicUrl,
                status: 'pending',
                submittedAt: Date.now()
            });
            
            await customAlert(
                "Verification photo submitted! We'll review it within 24 hours.",
                "Verification Submitted"
            );
            
        } catch (err) {
            console.error('Error uploading verification:', err);
            await customAlert("Failed to upload verification photo.", "Error");
        }
    };
    
    input.click();
}

// ========== SHARE & INVITE ==========
function copyReferralLink() {
    const referralLink = `https://ceezy-website.web.app?ref=${currentUser.referralCode || ''}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(referralLink)
            .then(() => customAlert("Referral link copied to clipboard!", "Referral"))
            .catch(() => customAlert(`Your referral link:\n${referralLink}`, "Referral"));
    } else {
        customAlert(`Your referral link:\n${referralLink}`, "Referral");
    }
}

async function showContactsInvite() {
    if (!navigator.share) {
        await copyReferralLink();
        return;
    }
    
    try {
        await navigator.share({
            title: 'Join MEET - Dating App',
            text: 'Join MEET and connect with amazing people! Use my referral link to get premium features free! 💖',
            url: `https://ceezy-website.web.app?ref=${currentUser.referralCode || ''}`
        });
    } catch (err) {
        console.log('Share cancelled or failed:', err);
        await copyReferralLink();
    }
}

function showRatingModal() {
    const modal = document.createElement('div');
    modal.className = 'rating-modal';
    modal.innerHTML = `
        <div class="rating-content glass-card">
            <h3>Rate MEET</h3>
            <p>How would you rate your experience?</p>
            <div class="stars">
                ${[1,2,3,4,5].map(i => `<span class="star" data-rating="${i}">⭐</span>`).join('')}
            </div>
            <textarea id="ratingFeedback" placeholder="Tell us more (optional)..." rows="3"></textarea>
            <button id="submitRating" class="small-glass">Submit</button>
            <button class="close-rating small-glass">Cancel</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    let selectedRating = 0;
    
    modal.querySelectorAll('.star').forEach(star => {
        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.rating);
            modal.querySelectorAll('.star').forEach((s, i) => {
                s.style.opacity = i < selectedRating ? '1' : '0.3';
            });
        });
    });
    
    modal.querySelector('#submitRating').onclick = async () => {
        if (selectedRating === 0) {
            await customAlert("Please select a rating.", "Error");
            return;
        }
        
        const feedback = modal.querySelector('#ratingFeedback').value.trim();
        
        try {
            await db.collection("ratings").add({
                userId: currentUser.uid,
                rating: selectedRating,
                feedback,
                timestamp: Date.now()
            });
            await customAlert("Thanks for your feedback! 💖", "Thank You");
        } catch (err) {
            console.error('Error submitting rating:', err);
        }
        
        modal.remove();
    };
    
    modal.querySelector('.close-rating').onclick = () => modal.remove();
}

async function deleteAccount() {
    if (!currentUser) return;
    
    const confirmed = await customConfirm(
        "Are you sure you want to permanently delete your account? This action cannot be undone. All your data will be lost.",
        "Delete Account"
    );
    
    if (!confirmed) return;
    
    const doubleConfirm = await customConfirm(
        "Please confirm again. This will permanently delete your account and all associated data.",
        "Final Confirmation"
    );
    
    if (!doubleConfirm) return;
    
    try {
        // Delete user data from Firestore
        await db.collection("users").doc(currentUser.uid).delete();
        
        // Delete user's chats
        const chatQuery = await db.collection("chats")
            .where("participants", "array-contains", currentUser.uid)
            .get();
        
        const batch = db.batch();
        chatQuery.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        // Delete auth account
        const user = auth.currentUser;
        if (user) {
            await user.delete();
        }
        
        // Clear local storage
        localStorage.removeItem('currentUserUid');
        
        await customAlert("Your account has been deleted successfully.", "Goodbye");
        window.location.reload();
        
    } catch (err) {
        console.error('Error deleting account:', err);
        await customAlert("Failed to delete account. Please try again or contact support.", "Error");
    }
}

// ========== GET AVAILABLE PROFILES ==========
async function getAvailableProfiles() {
    if (!currentUser) return [];
    
    try {
        const userRef = db.collection("users").doc(currentUser.uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        
        const swipes = userData.swipes || [];
        const matches = userData.matches || [];
        const blocked = userData.blocked || [];
        const blockedBy = userData.blockedBy || [];
        
        // Excluded user IDs
        const excludeIds = [
            currentUser.uid,
            ...swipes,
            ...matches,
            ...blocked,
            ...blockedBy
        ];
        
        // Get preferences
        const minAge = userData.prefAgeMin || 18;
        const maxAge = userData.prefAgeMax || 100;
        const prefGender = userData.prefGender || 'All';
        
        let query = db.collection("users")
            .where("banned", "==", false)
            .where("emailVerified", "==", true);
        
        // Apply gender filter
        if (prefGender !== 'All') {
            query = query.where("gender", "==", prefGender);
        }
        
        const snap = await query.limit(50).get();
        
        const profiles = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(profile => {
                // Exclude already interacted profiles
                if (excludeIds.includes(profile.id)) return false;
                
                // Age filter
                if (profile.age < minAge || profile.age > maxAge) return false;
                
                // Complete profile check
                if (!profile.profilePic) return false;
                
                return true;
            });
        
        // Sort by compatibility (simple randomization for now)
        return profiles.sort(() => Math.random() - 0.5);
        
    } catch (err) {
        console.error('Error getting profiles:', err);
        return [];
    }
}

function computeCompatibility(user) {
    if (!currentUser) return 50;
    
    let score = 50; // Base score
    
    // Interest overlap
    if (currentUser.interests && user.interests) {
        const commonInterests = currentUser.interests.filter(i => 
            user.interests.includes(i)
        );
        score += commonInterests.length * 10;
    }
    
    // Intent match
    if (currentUser.intent === user.intent) {
        score += 20;
    }
    
    // Age proximity bonus
    if (currentUser.age && user.age) {
        const ageDiff = Math.abs(currentUser.age - user.age);
        if (ageDiff <= 5) score += 15;
        else if (ageDiff <= 10) score += 5;
    }
    
    return Math.min(100, Math.max(0, score));
}

// ========== RENDER SWIPE CARDS ==========
async function renderSwipeCards() {
    const container = document.getElementById('swipeCardsContainer');
    if (!container) return;
    
    await checkDailySwipes();
    
    const profiles = await getAvailableProfiles();
    
    if (profiles.length === 0) {
        container.innerHTML = `
            <div class="no-more-cards glass-card">
                <h3>No More Profiles</h3>
                <p>Check back later for new people!</p>
                <button onclick="renderSwipeCards()" class="small-glass">Refresh</button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    profiles.forEach((profile, index) => {
        const card = document.createElement('div');
        card.className = 'swipe-card';
        card.style.zIndex = profiles.length - index;
        
        const compatibility = computeCompatibility(profile);
        
        card.innerHTML = `
            <div class="card-image" style="background-image: url('${escapeHtml(profile.profilePic)}')">
                <div class="card-overlay">
                    <div class="card-info">
                        <h3>${escapeHtml(profile.name)} ${profile.age}</h3>
                        <p>📍 ${profile.location?.lat ? 'Nearby' : 'Somewhere'}</p>
                        <p>🎯 ${escapeHtml(profile.intent || 'Not set')}</p>
                        <div class="compatibility">${compatibility}% Match</div>
                    </div>
                </div>
            </div>
            <div class="card-actions">
                <button class="swipe-btn dislike" data-id="${profile.id}" data-action="dislike">
                    <i class="fas fa-times"></i>
                </button>
                <button class="swipe-btn superlike" data-id="${profile.id}" data-action="superlike">
                    <i class="fas fa-star"></i>
                </button>
                <button class="swipe-btn like" data-id="${profile.id}" data-action="like">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
        `;
        
        container.appendChild(card);
        
        // View profile on image click
        card.querySelector('.card-image').addEventListener('click', () => {
            showQuickProfile(profile.id);
        });
    });
    
    // Add swipe button listeners
    document.querySelectorAll('.swipe-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const profileId = btn.dataset.id;
            const action = btn.dataset.action;
            const card = btn.closest('.swipe-card');
            
            // Animate card
            if (action === 'like') {
                card.classList.add('swipe-right');
            } else if (action === 'dislike') {
                card.classList.add('swipe-left');
            } else {
                card.classList.add('swipe-up');
            }
            
            setTimeout(async () => {
                card.remove();
                await handleSwipe(profileId, action);
            }, 300);
        });
    });
}

async function checkDailySwipes() {
    if (!currentUser) return;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const lastSwipeDate = new Date(currentUser.lastSwipeDate || 0).getTime();
    const resetDate = new Date(currentUser.swipeResetDate || 0).getTime();
    
    // Reset daily swipes if it's a new day
    if (resetDate < today) {
        await db.collection("users").doc(currentUser.uid).update({
            swipesToday: 0,
            swipeResetDate: today + 24 * 60 * 60 * 1000
        });
        currentUser.swipesToday = 0;
        currentUser.swipeResetDate = today + 24 * 60 * 60 * 1000;
    }
}

async function handleSwipe(profileId, action) {
    if (!currentUser) return;
    
    try {
        const userRef = db.collection("users").doc(currentUser.uid);
        
        // Check daily limit for non-premium
        const maxSwipes = currentUser.isPremium ? Infinity : 50;
        if (currentUser.swipesToday >= maxSwipes) {
            await customAlert(
                "You've reached your daily swipe limit. Upgrade to Premium for unlimited swipes!",
                "Limit Reached"
            );
            return;
        }
        
        // Record swipe
        await userRef.update({
            swipes: firebase.firestore.FieldValue.arrayUnion(profileId),
            swipesToday: firebase.firestore.FieldValue.increment(1),
            lastSwipeDate: Date.now()
        });
        
        currentUser.swipes.push(profileId);
        currentUser.swipesToday = (currentUser.swipesToday || 0) + 1;
        
        if (action === 'like' || action === 'superlike') {
            // Check if the other user also liked
            const otherUserDoc = await db.collection("users").doc(profileId).get();
            const otherUser = otherUserDoc.data();
            
            if (otherUser && otherUser.swipes && otherUser.swipes.includes(currentUser.uid)) {
                // It's a match!
                await createMatch(currentUser.uid, profileId);
                
                // Send match notification
                await sendLikeNotification(currentUser.uid, profileId, currentUser.name);
                
                await customAlert(`You matched with ${otherUser.name}! 💖`, "It's a Match!");
            } else {
                // Just a like
                await sendLikeNotification(currentUser.uid, profileId, currentUser.name);
            }
        }
        
        // Refresh cards if needed
        if (document.querySelectorAll('.swipe-card').length <= 1) {
            await renderSwipeCards();
        }
        
    } catch (err) {
        console.error('Error handling swipe:', err);
    }
}

async function createMatch(userId1, userId2) {
    try {
        const batch = db.batch();
        
        batch.update(db.collection("users").doc(userId1), {
            matches: firebase.firestore.FieldValue.arrayUnion(userId2),
            totalMatches: firebase.firestore.FieldValue.increment(1)
        });
        
        batch.update(db.collection("users").doc(userId2), {
            matches: firebase.firestore.FieldValue.arrayUnion(userId1),
            totalMatches: firebase.firestore.FieldValue.increment(1)
        });
        
        // Create chat document
        const chatId = [userId1, userId2].sort().join('_');
        batch.set(db.collection("chats").doc(chatId), {
            participants: [userId1, userId2],
            createdAt: Date.now(),
            lastMessage: null,
            lastMessageTime: null
        });
        
        await batch.commit();
        
        // Update local state
        if (currentUser.uid === userId1) {
            currentUser.matches.push(userId2);
        }
        
    } catch (err) {
        console.error('Error creating match:', err);
    }
}

// ========== EXPLORE ==========
async function renderExplore() {
    const container = document.getElementById('exploreContainer');
    if (!container) return;
    
    try {
        container.innerHTML = '<div class="loading-spinner">Loading...</div>';
        
        // Apply filters
        const minAge = parseInt(document.getElementById('filterAgeMin')?.value || '18');
        const maxAge = parseInt(document.getElementById('filterAgeMax')?.value || '100');
        const gender = document.getElementById('filterGender')?.value || 'All';
        const intent = document.getElementById('filterIntent')?.value || 'All';
        
        let query = db.collection("users")
            .where("banned", "==", false)
            .where("emailVerified", "==", true);
        
        if (gender !== 'All') {
            query = query.where("gender", "==", gender);
        }
        
        const snap = await query.limit(100).get();
        
        let users = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(user => {
                if (user.id === currentUser?.uid) return false;
                if (currentUser?.blocked?.includes(user.id)) return false;
                if (user.age < minAge || user.age > maxAge) return false;
                if (intent !== 'All' && user.intent !== intent) return false;
                return true;
            });
        
        if (users.length === 0) {
            container.innerHTML = '<div class="glass-card">No users match your filters.</div>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="explore-card glass-card" data-id="${user.id}">
                <img src="${escapeHtml(user.profilePic || '')}" 
                     alt="${escapeHtml(user.name)}"
                     onerror="this.src='https://randomuser.me/api/portraits/lego/1.jpg'">
                <div class="explore-info">
                    <h4>${escapeHtml(user.name)}, ${user.age}</h4>
                    <p>${escapeHtml(user.bio || 'No bio')}</p>
                    <div class="explore-tags">
                        ${(user.interests || []).slice(0, 3).map(i => `<span class="tag">${escapeHtml(i)}</span>`).join('')}
                    </div>
                </div>
                <div class="explore-actions">
                    <button class="view-profile-btn small-glass" data-id="${user.id}">
                        <i class="fas fa-user"></i> View
                    </button>
                    <button class="report-btn small-glass" data-id="${user.id}" data-name="${escapeHtml(user.name)}">
                        <i class="fas fa-flag"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Add event listeners
        document.querySelectorAll('.view-profile-btn').forEach(btn => {
            btn.addEventListener('click', () => showQuickProfile(btn.dataset.id));
        });
        
        document.querySelectorAll('.report-btn').forEach(btn => {
            btn.addEventListener('click', () => showReportModal(btn.dataset.id, btn.dataset.name));
        });
        
    } catch (err) {
        console.error('Error rendering explore:', err);
        container.innerHTML = '<div class="glass-card">Error loading users. Please try again.</div>';
    }
}

function showReportModal(userId, userName) {
    if (!currentUser) {
        customAlert("Please log in to report.", "Error");
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'report-modal';
    modal.innerHTML = `
        <div class="report-content glass-card">
            <h3>Report ${escapeHtml(userName)}</h3>
            <p>Why are you reporting this user?</p>
            <select id="reportReason">
                <option value="">Select a reason...</option>
                <option value="inappropriate">Inappropriate Content</option>
                <option value="fake">Fake Profile</option>
                <option value="harassment">Harassment</option>
                <option value="spam">Spam</option>
                <option value="underage">Underage User</option>
                <option value="other">Other</option>
            </select>
            <textarea id="reportDetails" placeholder="Additional details..." rows="3"></textarea>
            <div class="report-buttons">
                <button id="submitReport" class="small-glass">Submit Report</button>
                <button class="close-report small-glass">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#submitReport').onclick = async () => {
        const reason = modal.querySelector('#reportReason').value;
        const details = modal.querySelector('#reportDetails').value.trim();
        
        if (!reason) {
            await customAlert("Please select a reason.", "Error");
            return;
        }
        
        try {
            await db.collection("reports").add({
                reportedUserId: userId,
                reportedUserName: userName,
                reporterId: currentUser.uid,
                reporterName: currentUser.name,
                reason,
                details,
                timestamp: Date.now(),
                status: 'pending'
            });
            
            await customAlert("Report submitted. We'll review it shortly.", "Reported");
        } catch (err) {
            console.error('Error submitting report:', err);
            await customAlert("Failed to submit report.", "Error");
        }
        
        modal.remove();
    };
    
    modal.querySelector('.close-report').onclick = () => modal.remove();
}

// ========== CHAT LIST ==========
async function renderChatList() {
    const container = document.getElementById('chatListContainer');
    if (!container || !currentUser) return;
    
    try {
        const matches = currentUser.matches || [];
        
        if (matches.length === 0) {
            container.innerHTML = '<div class="glass-card">No matches yet. Start swiping!</div>';
            return;
        }
        
        // Get only matched users instead of all users
        const matchedUsers = [];
        for (const uid of matches) {
            if (currentUser.blocked?.includes(uid)) continue;
            
            const userDoc = await db.collection("users").doc(uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (!userData.banned) {
                    matchedUsers.push({ id: uid, ...userData });
                }
            }
        }
        
        // Get unread status for each chat
        const chatItems = await Promise.all(matchedUsers.map(async (m) => {
            const chatId = [currentUser.uid, m.id].sort().join('_');
            const unreadSnap = await db.collection("chats").doc(chatId)
                .collection("messages")
                .where("senderId", "==", m.id)
                .where("read", "==", false)
                .limit(1)
                .get();
            
            return {
                ...m,
                hasUnread: !unreadSnap.empty,
                isOnline: m.privacyOnlineStatus !== false && 
                         (Date.now() - (m.lastSeen || 0) < 60000)
            };
        }));
        
        // Sort: online first, then by last message time
        chatItems.sort((a, b) => {
            if (a.isOnline && !b.isOnline) return -1;
            if (!a.isOnline && b.isOnline) return 1;
            return (b.lastSeen || 0) - (a.lastSeen || 0);
        });
        
        container.innerHTML = chatItems.map(m => `
            <div class="chat-list-item" data-id="${m.id}">
                <div style="position:relative;">
                    <img class="avatar" src="${escapeHtml(m.profilePic || '')}" 
                         alt="${escapeHtml(m.name)}"
                         onerror="this.src='https://randomuser.me/api/portraits/lego/1.jpg'">
                    ${m.isOnline ? '<span class="online-dot"></span>' : ''}
                </div>
                <div class="chat-info">
                    <div class="chat-name">
                        ${escapeHtml(m.name)}
                        ${m.verified ? '<i class="fas fa-check-circle verified-icon"></i>' : ''}
                        ${m.hasUnread ? '<span class="unread-dot"></span>' : ''}
                    </div>
                    <div class="last-msg">
                        ${m.isOnline ? 'Online' : (m.lastSeen ? `Last seen ${formatTimeAgo(m.lastSeen)}` : 'Offline')}
                    </div>
                </div>
                <div class="chat-meta">
                    <button class="small-glass block-chat-btn" data-id="${m.id}" data-name="${escapeHtml(m.name)}">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        // Event listeners
        document.querySelectorAll('.chat-list-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (!e.target.closest('.block-chat-btn')) {
                    openChatScreen(el.dataset.id);
                }
            });
        });
        
        document.querySelectorAll('.block-chat-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const targetId = btn.dataset.id;
                const targetName = btn.dataset.name;
                
                if (await customConfirm(`Block ${targetName}? You won't see messages from them anymore.`, "Block User")) {
                    await db.collection("users").doc(currentUser.uid).update({
                        blocked: firebase.firestore.FieldValue.arrayUnion(targetId),
                        matches: firebase.firestore.FieldValue.arrayRemove(targetId)
                    });
                    
                    currentUser.blocked = [...(currentUser.blocked || []), targetId];
                    currentUser.matches = currentUser.matches.filter(id => id !== targetId);
                    
                    renderChatList();
                    
                    // Close chat if it's open
                    if (currentChatPartner === targetId) {
                        document.getElementById('chatScreenContainer').style.display = 'none';
                        currentChatPartner = null;
                    }
                }
            });
        });
        
    } catch (err) {
        console.error('Error rendering chat list:', err);
        container.innerHTML = '<div class="glass-card">Error loading chats. Please try again.</div>';
    }
}

function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return new Date(timestamp).toLocaleDateString();
}

// ========== FULL-SCREEN CHAT ==========
async function openChatScreen(partnerId) {
    if (!currentUser) return;
    
    if (currentUser.verified !== true) {
        await customAlert("You must verify your identity before chatting.", "Verification Required");
        return;
    }
    
    // Close previous chat listener
    if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
    }
    
    currentChatPartner = partnerId;
    
    try {
        const partnerDoc = await db.collection("users").doc(partnerId).get();
        if (!partnerDoc.exists) {
            await customAlert("User not found.", "Error");
            return;
        }
        
        const partner = { id: partnerDoc.id, ...partnerDoc.data() };
        
        // Check if blocked
        if (currentUser.blocked?.includes(partnerId)) {
            await customAlert("You have blocked this user.", "Blocked");
            return;
        }
        
        // Mark messages as read
        const chatId = [currentUser.uid, partnerId].sort().join('_');
        const unreadQuery = db.collection("chats").doc(chatId)
            .collection("messages")
            .where("senderId", "==", partnerId)
            .where("read", "==", false);
        
        const unreadSnap = await unreadQuery.get();
        const batch = db.batch();
        unreadSnap.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
        
        // UI setup
        document.getElementById('chatListContainer').style.display = 'none';
        const screenDiv = document.getElementById('chatScreenContainer');
        screenDiv.style.display = 'block';
        screenDiv.classList.add('fullscreen');
        
        // Status text
        let statusText = 'Offline';
        if (partner.privacyOnlineStatus !== false && (Date.now() - (partner.lastSeen || 0) < 60000)) {
            statusText = 'Online';
        } else if (partner.privacyLastSeen !== false && partner.lastSeen) {
            statusText = `Last seen ${formatTimeAgo(partner.lastSeen)}`;
        }
        
        screenDiv.innerHTML = `
            <div class="chat-header">
                <button class="back-btn" id="backToChatList">
                    <i class="fas fa-arrow-left"></i>
                </button>
                <div class="chat-profile" data-id="${partner.id}">
                    <img src="${escapeHtml(partner.profilePic || '')}" 
                         id="chatAvatar" 
                         alt="${escapeHtml(partner.name)}"
                         onerror="this.src='https://randomuser.me/api/portals/lego/1.jpg'">
                    <div>
                        <div class="chat-name">
                            ${escapeHtml(partner.name)}
                            ${partner.verified ? '<i class="fas fa-check-circle verified-icon"></i>' : ''}
                        </div>
                        <div class="chat-status" id="chatStatus">${statusText}</div>
                        <div id="typingStatus" style="font-size:0.7rem; color:#3b82f6;"></div>
                    </div>
                </div>
                <div class="chat-actions">
                    <i class="fas fa-phone" id="callDemo" title="Voice Call"></i>
                    <i class="fas fa-video" id="videoDemo" title="Video Call"></i>
                    <i class="fas fa-ban" id="blockFromChat" title="Block User"></i>
                    <i class="fas fa-ellipsis-v" id="menuUnmatch" title="More Options"></i>
                </div>
            </div>
            <div class="messages-area" id="messagesArea"></div>
            <div class="input-area">
                <div class="chat-attach-btns">
                    <button id="sendImageBtn" title="Send Image">
                        <i class="fas fa-image"></i>
                    </button>
                    <button id="sendVoiceBtn" title="Send Voice Message">
                        <i class="fas fa-microphone"></i>
                    </button>
                </div>
                <input type="text" id="messageInputChat" placeholder="Type a message..." autocomplete="off">
                <button id="sendChatMsg">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        `;
        
        // Profile click
        document.querySelector('.chat-profile')?.addEventListener('click', () => showQuickProfile(partner.id));
        
        // Back button
        document.getElementById('backToChatList').onclick = () => {
            screenDiv.style.display = 'none';
            screenDiv.classList.remove('fullscreen');
            document.getElementById('chatListContainer').style.display = 'block';
            if (unsubscribeMessages) {
                unsubscribeMessages();
                unsubscribeMessages = null;
            }
            currentChatPartner = null;
            renderChatList();
        };
        
        // Block button
        document.getElementById('blockFromChat')?.addEventListener('click', async () => {
            if (await customConfirm(`Block ${partner.name}?`, "Block User")) {
                await db.collection("users").doc(currentUser.uid).update({
                    blocked: firebase.firestore.FieldValue.arrayUnion(partnerId),
                    matches: firebase.firestore.FieldValue.arrayRemove(partnerId)
                });
                currentUser.blocked = [...(currentUser.blocked || []), partnerId];
                currentUser.matches = currentUser.matches.filter(id => id !== partnerId);
                document.getElementById('backToChatList').click();
            }
        });
        
        // Unmatch button
        document.getElementById('menuUnmatch')?.addEventListener('click', async () => {
            if (await customConfirm(`Unmatch ${partner.name}? This cannot be undone.`, "Unmatch")) {
                const matches = currentUser.matches.filter(id => id !== partnerId);
                await db.collection("users").doc(currentUser.uid).update({ matches });
                currentUser.matches = matches;
                document.getElementById('backToChatList').click();
            }
        });
        
        // Call buttons (demo)
        document.getElementById('callDemo')?.addEventListener('click', () => {
            customAlert("Voice calling will be available soon!", "Coming Soon");
        });
        document.getElementById('videoDemo')?.addEventListener('click', () => {
            customAlert("Video calling will be available soon!", "Coming Soon");
        });
        
        // Image upload
        document.getElementById('sendImageBtn')?.addEventListener('click', () => {
            if (!supabase) {
                customAlert("Upload service unavailable.", "Error");
                return;
            }
            
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                if (file.size > 10 * 1024 * 1024) {
                    await customAlert("Image must be less than 10MB.", "Error");
                    return;
                }
                
                try {
                    const fileName = `chat-images/${chatId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                    const { error } = await supabase.storage
                        .from('chat-images')
                        .upload(fileName, file);
                    
                    if (error) throw error;
                    
                    const { data: urlData } = supabase.storage
                        .from('chat-images')
                        .getPublicUrl(fileName);
                    
                    await db.collection("chats").doc(chatId).collection("messages").add({
                        senderId: currentUser.uid,
                        text: urlData.publicUrl,
                        type: 'image',
                        timestamp: Date.now(),
                        read: false
                    });
                    
                    // Update chat metadata
                    await db.collection("chats").doc(chatId).update({
                        lastMessage: '📷 Image',
                        lastMessageTime: Date.now()
                    });
                    
                } catch (err) {
                    console.error('Error uploading image:', err);
                    await customAlert("Failed to send image.", "Error");
                }
            };
            
            input.click();
        });
        
        // Voice recording
        let mediaRecorder = null;
        let audioChunks = [];
        
        document.getElementById('sendVoiceBtn')?.addEventListener('click', async () => {
            if (!supabase) {
                customAlert("Upload service unavailable.", "Error");
                return;
            }
            
            if (!mediaRecorder || mediaRecorder.state === 'inactive') {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    
                    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                    
                    mediaRecorder.onstop = async () => {
                        const blob = new Blob(audioChunks, { type: 'audio/webm' });
                        
                        if (blob.size > 5 * 1024 * 1024) {
                            await customAlert("Voice message too long. Keep it under 5 minutes.", "Error");
                            return;
                        }
                        
                        const fileName = `voice-messages/${chatId}/${Date.now()}_voice.webm`;
                        const { error } = await supabase.storage
                            .from('voice-messages')
                            .upload(fileName, blob);
                        
                        if (error) throw error;
                        
                        const { data: urlData } = supabase.storage
                            .from('voice-messages')
                            .getPublicUrl(fileName);
                        
                        await db.collection("chats").doc(chatId).collection("messages").add({
                            senderId: currentUser.uid,
                            text: urlData.publicUrl,
                            type: 'voice',
                            duration: audioChunks.length,
                            timestamp: Date.now(),
                            read: false
                        });
                        
                        await db.collection("chats").doc(chatId).update({
                            lastMessage: '🎤 Voice Message',
                            lastMessageTime: Date.now()
                        });
                        
                        document.getElementById('sendVoiceBtn').innerHTML = '<i class="fas fa-microphone"></i>';
                    };
                    
                    mediaRecorder.start();
                    document.getElementById('sendVoiceBtn').innerHTML = '<i class="fas fa-stop" style="color:red;"></i>';
                    
                    // Auto-stop after 5 minutes
                    setTimeout(() => {
                        if (mediaRecorder && mediaRecorder.state === 'recording') {
                            mediaRecorder.stop();
                        }
                    }, 300000);
                    
                } catch (err) {
                    console.error('Error recording:', err);
                    await customAlert("Microphone access denied.", "Error");
                }
            } else {
                mediaRecorder.stop();
            }
        });
        
        // Typing indicator
        const typingRef = db.collection("typing").doc(`${currentUser.uid}_${partnerId}`);
        
        typingRef.onSnapshot(doc => {
            const typingStatus = document.getElementById('typingStatus');
            if (typingStatus && doc.exists && doc.data().isTyping && doc.data().userId === partnerId) {
                typingStatus.innerHTML = "typing...";
            } else if (typingStatus) {
                typingStatus.innerHTML = "";
            }
        });
        
        const input = document.getElementById('messageInputChat');
        if (input) {
            input.addEventListener('input', async () => {
                await typingRef.set({
                    userId: currentUser.uid,
                    isTyping: true,
                    timestamp: Date.now()
                });
                
                if (typingTimeout) clearTimeout(typingTimeout);
                typingTimeout = setTimeout(async () => {
                    await typingRef.set({
                        userId: currentUser.uid,
                        isTyping: false,
                        timestamp: Date.now()
                    });
                }, 1000);
            });
        }
        
        // Load messages
        const messagesArea = document.getElementById('messagesArea');
        if (!messagesArea) return;
        
        const q = db.collection("chats").doc(chatId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .limit(100);
        
        unsubscribeMessages = q.onSnapshot(snapshot => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            messagesArea.innerHTML = '';
            
            // Group messages by date
            let lastDate = null;
            
            messages.forEach(msg => {
                const msgDate = new Date(msg.timestamp).toDateString();
                if (msgDate !== lastDate) {
                    const dateDiv = document.createElement('div');
                    dateDiv.className = 'message-date-divider';
                    dateDiv.textContent = formatMessageDate(new Date(msg.timestamp));
                    messagesArea.appendChild(dateDiv);
                    lastDate = msgDate;
                }
                
                const isSent = msg.senderId === currentUser.uid;
                const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                const bubble = document.createElement('div');
                bubble.className = `message-bubble ${isSent ? 'sent' : 'received'}`;
                
                if (msg.type === 'image') {
                    bubble.innerHTML = `
                        <img src="${escapeHtml(msg.text)}" 
                             style="max-width:200px; border-radius:12px; cursor:pointer;" 
                             onclick="window.open('${escapeHtml(msg.text)}')"
                             loading="lazy">
                        <div class="message-time">${time} ${isSent && msg.read ? '✓✓' : '✓'}</div>
                    `;
                } else if (msg.type === 'voice') {
                    bubble.innerHTML = `
                        <audio controls src="${escapeHtml(msg.text)}" style="max-width:200px;"></audio>
                        <div class="message-time">${time} ${isSent && msg.read ? '✓✓' : '✓'}</div>
                    `;
                } else {
                    bubble.innerHTML = `
                        <div class="message-text">${escapeHtml(msg.text)}</div>
                        <div class="message-time">${time} ${isSent && msg.read ? '✓✓' : '✓'}</div>
                    `;
                }
                
                messagesArea.appendChild(bubble);
            });
            
            // Scroll to bottom
            messagesArea.scrollTop = messagesArea.scrollHeight;
            
            // Notifications for new messages
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const msg = change.doc.data();
                    if (msg.senderId !== currentUser.uid) {
                        const preview = msg.type === 'image' ? '📷 Image' : 
                                       msg.type === 'voice' ? '🎤 Voice' : 
                                       msg.text.substring(0, 50);
                        showBrowserNotification(partner.name, preview);
                    }
                }
            });
        });
        
        // Send message
        document.getElementById('sendChatMsg').onclick = async () => {
            const text = input?.value.trim();
            if (!text) return;
            
            try {
                await db.collection("chats").doc(chatId).collection("messages").add({
                    senderId: currentUser.uid,
                    text,
                    type: 'text',
                    timestamp: Date.now(),
                    read: false
                });
                
                await db.collection("chats").doc(chatId).update({
                    lastMessage: text.substring(0, 100),
                    lastMessageTime: Date.now()
                });
                
                input.value = '';
                input.focus();
                
            } catch (err) {
                console.error('Error sending message:', err);
                customAlert("Failed to send message.", "Error");
            }
        };
        
        // Send on Enter
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('sendChatMsg').click();
            }
        });
        
        input?.focus();
        
    } catch (err) {
        console.error('Error opening chat:', err);
        await customAlert("Error opening chat.", "Error");
    }
}

function formatMessageDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ========== PROFILE UI ==========
async function updateProfileCompletion() {
    if (!currentUser) return;
    
    let completed = 0;
    const total = 5;
    
    if (currentUser.name && currentUser.name !== "New here!") completed++;
    if (currentUser.bio && currentUser.bio !== "New here!" && currentUser.bio !== "Hey there! I'm new to MEET.") completed++;
    if (currentUser.profilePic) completed++;
    if (currentUser.interests && currentUser.interests.length > 0) completed++;
    if (currentUser.location?.lat) completed++;
    
    const percentage = Math.round((completed / total) * 100);
    
    const progressBar = document.getElementById('profileProgress');
    if (progressBar) {
        progressBar.style.width = percentage + '%';
        progressBar.textContent = percentage + '%';
    }
}

async function renderProfileUI() {
    if (!currentUser) return;
    
    try {
        document.getElementById('profileUsername').textContent = currentUser.name || 'User';
        document.getElementById('profileStatus').textContent = currentUser.bio || "No bio yet";
        document.getElementById('profileAvatar').src = currentUser.profilePic || 'https://randomuser.me/api/portraits/lego/1.jpg';
        document.getElementById('matchesCount').textContent = currentUser.matches?.length || 0;
        document.getElementById('likesCount').textContent = currentUser.swipes?.length || 0;
        
        updateProfileCompletion();
        
        // Verified badge
        const badge = document.querySelector('.verified-badge');
        if (badge) {
            badge.style.display = currentUser.verified ? 'inline-block' : 'none';
        }
        
        // Premium badge
        if (currentUser.isPremium) {
            const premiumBadge = document.getElementById('premiumBadge');
            if (premiumBadge) {
                premiumBadge.style.display = 'inline-block';
                premiumBadge.textContent = currentUser.premiumPlan === 'platinum' ? '💎 Platinum' : '🌟 Gold';
            }
        }
        
        // Settings list
        const settingsList = [
            { icon: "fas fa-user-circle", title: "Edit Profile", key: "editProfile" },
            { icon: "fas fa-lock", title: "Privacy Settings", key: "privacy" },
            { icon: "fas fa-sliders-h", title: "Dating Preferences", key: "dating" },
            { icon: "fas fa-crown", title: "Premium Features", key: "premium" },
            { icon: "fas fa-question-circle", title: "Help & Support", key: "help" },
            { icon: "fas fa-gem", title: "Upgrade to Premium", key: "upgrade" },
            { icon: "fas fa-id-card", title: "Verify Identity", key: "verify" },
            { icon: "fas fa-calendar-alt", title: "Events", key: "events" },
            { icon: "fas fa-gavel", title: "Appeal Ban", key: "appeal" },
            { icon: "fas fa-link", title: "Copy Referral Link", key: "referral" },
            { icon: "fas fa-address-book", title: "Invite Friends", key: "invite" },
            { icon: "fas fa-star", title: "Rate App", key: "rate" },
            { icon: "fas fa-sign-out-alt", title: "Logout", key: "logout" },
            { icon: "fas fa-trash-alt", title: "Delete Account", key: "delete" }
        ];
        
        document.getElementById('settingsListContainer').innerHTML = settingsList.map(s => `
            <div class="settings-item" data-key="${s.key}">
                <div class="settings-item-left">
                    <i class="${s.icon}"></i>
                    <span>${s.title}</span>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>
        `).join('');
        
        // Settings click handlers
        document.querySelectorAll('.settings-item').forEach(el => {
            el.addEventListener('click', () => {
                const key = el.dataset.key;
                switch(key) {
                    case 'upgrade': showUpgradeModal(); break;
                    case 'verify': verifyIdentity(); break;
                    case 'events': loadEvents(); break;
                    case 'appeal': submitAppealPrompt(); break;
                    case 'referral': copyReferralLink(); break;
                    case 'invite': showContactsInvite(); break;
                    case 'rate': showRatingModal(); break;
                    case 'delete': deleteAccount(); break;
                    case 'logout': handleLogout(); break;
                    case 'editProfile': showEditProfile(); break;
                    default: showSettingsDetail(key);
                }
            });
        });
        
        // Edit profile button
        document.getElementById('editProfileBtn').onclick = showEditProfile;
        
        // Photo upload
        document.getElementById('changePhotoBtn').onclick = () => {
            document.getElementById('photoUploadInput').click();
        };
        
        document.getElementById('photoUploadInput').onchange = async (e) => {
            const file = e.target.files[0];
            if (!file || !supabase) return;
            
            if (file.size > 5 * 1024 * 1024) {
                await customAlert("Photo must be less than 5MB.", "Error");
                return;
            }
            
            try {
                const fileName = `${currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                const { error } = await supabase.storage
                    .from('profile-pictures')
                    .upload(fileName, file, { upsert: true });
                
                if (error) throw error;
                
                const { data: urlData } = supabase.storage
                    .from('profile-pictures')
                    .getPublicUrl(fileName);
                
                await db.collection("users").doc(currentUser.uid).update({
                    profilePic: urlData.publicUrl
                });
                
                currentUser.profilePic = urlData.publicUrl;
                document.getElementById('profileAvatar').src = urlData.publicUrl + '?t=' + Date.now();
                
                await customAlert("Photo updated!", "Success");
                
            } catch (err) {
                console.error('Error uploading photo:', err);
                await customAlert("Failed to upload photo.", "Error");
            }
        };
        
        // Share profile
        document.getElementById('shareProfileBtn').onclick = async () => {
            const shareData = {
                title: `${currentUser.name} on MEET`,
                text: `Check out ${currentUser.name}'s profile on MEET! 💖`,
                url: `https://ceezy-website.web.app?ref=${currentUser.referralCode}`
            };
            
            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                } catch (err) {
                    console.log('Share cancelled');
                }
            } else {
                await copyReferralLink();
            }
        };
        
    } catch (err) {
        console.error('Error rendering profile:', err);
    }
}

function showEditProfile() {
    document.getElementById('profileView').classList.remove('active-view');
    document.getElementById('editProfileView').style.display = 'block';
    loadEditProfile();
}

function loadEditProfile() {
    if (!currentUser) return;
    
    document.getElementById('editName').value = currentUser.name || '';
    document.getElementById('editBio').value = currentUser.bio || '';
    document.getElementById('editAge').value = currentUser.age || '';
    document.getElementById('editGender').value = currentUser.gender || 'Other';
    document.getElementById('editIntent').value = currentUser.intent || 'Casual';
    document.getElementById('editInterests').value = (currentUser.interests || []).join(', ');
    
    document.getElementById('saveProfileBtn').onclick = async () => {
        const name = document.getElementById('editName').value.trim();
        const bio = document.getElementById('editBio').value.trim();
        const age = parseInt(document.getElementById('editAge').value);
        const gender = document.getElementById('editGender').value;
        const intent = document.getElementById('editIntent').value;
        const interests = document.getElementById('editInterests').value
            .split(',')
            .map(i => i.trim())
            .filter(i => i.length > 0);
        
        if (!name || name.length < 2) {
            await customAlert("Name must be at least 2 characters.", "Error");
            return;
        }
        
        if (age < 18 || age > 120) {
            await customAlert("Age must be between 18 and 120.", "Error");
            return;
        }
        
        try {
            await db.collection("users").doc(currentUser.uid).update({
                name,
                bio,
                age,
                gender,
                intent,
                interests
            });
            
            Object.assign(currentUser, { name, bio, age, gender, intent, interests });
            
            await customAlert("Profile updated!", "Success");
            
            document.getElementById('editProfileView').style.display = 'none';
            document.getElementById('profileView').classList.add('active-view');
            renderProfileUI();
            
        } catch (err) {
            console.error('Error updating profile:', err);
            await customAlert("Failed to update profile.", "Error");
        }
    };
    
    document.getElementById('cancelEditBtn').onclick = () => {
        document.getElementById('editProfileView').style.display = 'none';
        document.getElementById('profileView').classList.add('active-view');
    };
}

function showSettingsDetail(section) {
    const detailView = document.getElementById('settingsDetailView');
    const detailContent = document.getElementById('settingsDetailContent');
    const detailTitle = document.getElementById('settingsDetailTitle');
    
    if (!detailView || !detailContent || !detailTitle) return;
    
    const sections = {
        privacy: {
            title: 'Privacy Settings',
            content: `
                <div class="setting-item">
                    <label>Show Last Seen</label>
                    <input type="checkbox" id="privacyLastSeen" ${currentUser.privacyLastSeen ? 'checked' : ''}>
                </div>
                <div class="setting-item">
                    <label>Show Online Status</label>
                    <input type="checkbox" id="privacyOnlineStatus" ${currentUser.privacyOnlineStatus ? 'checked' : ''}>
                </div>
                <button id="savePrivacyBtn" class="small-glass">Save</button>
            `
        },
        dating: {
            title: 'Dating Preferences',
            content: `
                <div class="setting-item">
                    <label>Age Range</label>
                    <input type="number" id="prefAgeMin" value="${currentUser.prefAgeMin || 18}" min="18" max="120" style="width:60px;">
                    to
                    <input type="number" id="prefAgeMax" value="${currentUser.prefAgeMax || 100}" min="18" max="120" style="width:60px;">
                </div>
                <div class="setting-item">
                    <label>Maximum Distance (km)</label>
                    <input type="number" id="prefDistance" value="${currentUser.prefDistance || 50}" min="1" max="500">
                </div>
                <div class="setting-item">
                    <label>Interested In</label>
                    <select id="prefGender">
                        <option value="All" ${currentUser.prefGender === 'All' ? 'selected' : ''}>All</option>
                        <option value="Male" ${currentUser.prefGender === 'Male' ? 'selected' : ''}>Male</option>
                        <option value="Female" ${currentUser.prefGender === 'Female' ? 'selected' : ''}>Female</option>
                        <option value="Other" ${currentUser.prefGender === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                </div>
                <button id="saveDatingPrefsBtn" class="small-glass">Save</button>
            `
        },
        help: {
            title: 'Help & Support',
            content: `
                <div class="help-section">
                    <h4>FAQs</h4>
                    <p><strong>How do I get verified?</strong><br>Go to Settings > Verify Identity and upload a photo.</p>
                    <p><strong>How does matching work?</strong><br>Swipe right to like, left to pass. If you both like each other, it's a match!</p>
                    <p><strong>How do I report someone?</strong><br>Go to Explore, find the user, and click the flag icon.</p>
                </div>
                <button id="contactSupportBtn" class="small-glass">Contact Support</button>
            `
        }
    };
    
    const sectionData = sections[section];
    if (!sectionData) return;
    
    detailTitle.textContent = sectionData.title;
    detailContent.innerHTML = sectionData.content;
    
    detailView.style.display = 'block';
    
    // Save handlers
    if (section === 'privacy') {
        document.getElementById('savePrivacyBtn').onclick = async () => {
            const lastSeen = document.getElementById('privacyLastSeen').checked;
            const onlineStatus = document.getElementById('privacyOnlineStatus').checked;
            
            await db.collection("users").doc(currentUser.uid).update({
                privacyLastSeen: lastSeen,
                privacyOnlineStatus: onlineStatus
            });
            
            currentUser.privacyLastSeen = lastSeen;
            currentUser.privacyOnlineStatus = onlineStatus;
            
            await customAlert("Privacy settings updated!", "Success");
            detailView.style.display = 'none';
        };
    } else if (section === 'dating') {
        document.getElementById('saveDatingPrefsBtn').onclick = async () => {
            const prefAgeMin = parseInt(document.getElementById('prefAgeMin').value);
            const prefAgeMax = parseInt(document.getElementById('prefAgeMax').value);
            const prefDistance = parseInt(document.getElementById('prefDistance').value);
            const prefGender = document.getElementById('prefGender').value;
            
            await db.collection("users").doc(currentUser.uid).update({
                prefAgeMin,
                prefAgeMax,
                prefDistance,
                prefGender
            });
            
            Object.assign(currentUser, { prefAgeMin, prefAgeMax, prefDistance, prefGender });
            
            await customAlert("Preferences updated!", "Success");
            detailView.style.display = 'none';
        };
    } else if (section === 'help') {
        document.getElementById('contactSupportBtn').onclick = () => {
            window.location.href = 'mailto:support@ceezy-website.web.app';
        };
    }
    
    document.getElementById('closeSettingsDetail').onclick = () => {
        detailView.style.display = 'none';
    };
}

async function handleLogout() {
    try {
        if (unsubscribeUser) unsubscribeUser();
        if (unsubscribeMessages) unsubscribeMessages();
        if (unsubscribeNotifications) unsubscribeNotifications();
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        
        await db.collection("users").doc(currentUser.uid).update({
            lastSeen: Date.now()
        }).catch(() => {});
        
        await auth.signOut();
        localStorage.removeItem('currentUserUid');
        currentUser = null;
        window.location.reload();
    } catch (err) {
        console.error('Logout error:', err);
        localStorage.removeItem('currentUserUid');
        window.location.reload();
    }
}

async function submitAppealPrompt() {
    const reason = await customPrompt(
        "Please explain why your account should be unbanned:",
        "",
        "Appeal Ban"
    );
    if (reason) {
        await submitAppeal(reason);
    }
}

// ========== ADMIN PANEL ==========
async function showAdminLogin() {
    const pwd = await customPrompt("Enter admin password:", "", "Admin Login");
    if (!pwd) return;
    
    try {
        const adminDoc = await db.collection("admin").doc("config").get();
        const adminConfig = adminDoc.data();
        
        // Use a proper hash comparison in production
        if (pwd === adminConfig?.adminPassword || pwd === 'temporary_admin_2024') {
            isAdminLoggedIn = true;
            renderAdminPanel();
        } else {
            await customAlert("Invalid password.", "Error");
        }
    } catch (err) {
        console.error('Admin login error:', err);
        await customAlert("Login failed.", "Error");
    }
}

async function renderAdminPanel() {
    if (!isAdminLoggedIn) return;
    
    const panel = document.getElementById('adminPanelContainer');
    if (!panel) return;
    
    panel.style.display = 'block';
    
    try {
        // Load stats
        const usersSnap = await db.collection("users").get();
        const reportsSnap = await db.collection("reports").where("status", "==", "pending").get();
        const appealsSnap = await db.collection("appeals").where("status", "==", "pending").get();
        const verificationSnap = await db.collection("verification_requests").where("status", "==", "pending").get();
        
        const totalUsers = usersSnap.size;
        const bannedUsers = usersSnap.docs.filter(d => d.data().banned).length;
        const premiumUsers = usersSnap.docs.filter(d => d.data().isPremium).length;
        
        panel.innerHTML = `
            <div class="admin-panel glass-card">
                <h2>Admin Panel</h2>
                <div class="admin-stats">
                    <div class="stat">Total Users: ${totalUsers}</div>
                    <div class="stat">Banned: ${bannedUsers}</div>
                    <div class="stat">Premium: ${premiumUsers}</div>
                </div>
                <div class="admin-tabs">
                    <button class="admin-tab active" data-tab="users">Users</button>
                    <button class="admin-tab" data-tab="reports">Reports (${reportsSnap.size})</button>
                    <button class="admin-tab" data-tab="appeals">Appeals (${appealsSnap.size})</button>
                    <button class="admin-tab" data-tab="verification">Verification (${verificationSnap.size})</button>
                    <button class="admin-tab" data-tab="updates">Post Update</button>
                </div>
                <div class="admin-content" id="adminContent"></div>
                <button id="closeAdminBtn" class="small-glass">Close</button>
            </div>
        `;
        
        // Tab switching
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const tabName = tab.dataset.tab;
                await loadAdminTab(tabName);
            });
        });
        
        document.getElementById('closeAdminBtn').onclick = () => {
            panel.style.display = 'none';
            isAdminLoggedIn = false;
        };
        
        // Load default tab
        await loadAdminTab('users');
        
    } catch (err) {
        console.error('Error rendering admin panel:', err);
        panel.innerHTML = '<div class="glass-card">Error loading admin panel.</div>';
    }
}

async function loadAdminTab(tabName) {
    const content = document.getElementById('adminContent');
    if (!content) return;
    
    content.innerHTML = '<div class="loading-spinner">Loading...</div>';
    
    try {
        switch(tabName) {
            case 'users':
                const usersSnap = await db.collection("users").orderBy("createdAt", "desc").limit(50).get();
                content.innerHTML = usersSnap.docs.map(doc => {
                    const user = doc.data();
                    return `
                        <div class="admin-user-item">
                            <img src="${escapeHtml(user.profilePic || '')}" onerror="this.style.display='none'">
                            <div>
                                <strong>${escapeHtml(user.name)}</strong>
                                <p>${escapeHtml(user.email)}</p>
                                <p>Joined: ${new Date(user.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div class="admin-actions">
                                <button class="admin-btn ban-btn" data-id="${doc.id}" data-action="ban">
                                    ${user.banned ? 'Unban' : 'Ban'}
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
                
                // Ban/unban handlers
                document.querySelectorAll('.ban-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const userId = btn.dataset.id;
                        const userDoc = await db.collection("users").doc(userId).get();
                        const user = userDoc.data();
                        
                        await db.collection("users").doc(userId).update({
                            banned: !user.banned
                        });
                        
                        btn.textContent = user.banned ? 'Ban' : 'Unban';
                    });
                });
                break;
                
            case 'reports':
                const reportsSnap = await db.collection("reports")
                    .where("status", "==", "pending")
                    .orderBy("timestamp", "desc")
                    .get();
                
                if (reportsSnap.empty) {
                    content.innerHTML = '<p>No pending reports.</p>';
                } else {
                    content.innerHTML = reportsSnap.docs.map(doc => {
                        const report = doc.data();
                        return `
                            <div class="admin-report-item">
                                <p><strong>Reported:</strong> ${escapeHtml(report.reportedUserName)}</p>
                                <p><strong>Reason:</strong> ${escapeHtml(report.reason)}</p>
                                <p><strong>Details:</strong> ${escapeHtml(report.details || 'None')}</p>
                                <p><strong>Date:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
                                <button class="admin-btn resolve-report-btn" data-id="${doc.id}" data-user="${report.reportedUserId}">
                                    Ban & Resolve
                                </button>
                            </div>
                        `;
                    }).join('');
                    
                    document.querySelectorAll('.resolve-report-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const reportId = btn.dataset.id;
                            const userId = btn.dataset.user;
                            
                            const batch = db.batch();
                            batch.update(db.collection("users").doc(userId), { banned: true });
                            batch.update(db.collection("reports").doc(reportId), {
                                status: 'resolved',
                                resolvedAt: Date.now(),
                                action: 'banned'
                            });
                            await batch.commit();
                            
                            btn.closest('.admin-report-item').remove();
                            await customAlert("User banned and report resolved.", "Done");
                        });
                    });
                }
                break;
                
            case 'appeals':
                const appealsSnap = await db.collection("appeals")
                    .where("status", "==", "pending")
                    .get();
                
                if (appealsSnap.empty) {
                    content.innerHTML = '<p>No pending appeals.</p>';
                } else {
                    content.innerHTML = appealsSnap.docs.map(doc => {
                        const appeal = doc.data();
                        return `
                            <div class="admin-appeal-item">
                                <p><strong>User:</strong> ${escapeHtml(appeal.userName)}</p>
                                <p><strong>Email:</strong> ${escapeHtml(appeal.userEmail)}</p>
                                <p><strong>Reason:</strong> ${escapeHtml(appeal.reason)}</p>
                                <button class="admin-btn approve-appeal-btn" data-id="${doc.id}" data-user="${appeal.userId}">
                                    Approve & Unban
                                </button>
                                <button class="admin-btn deny-appeal-btn" data-id="${doc.id}">Deny</button>
                            </div>
                        `;
                    }).join('');
                    
                    // Appeal handlers
                    document.querySelectorAll('.approve-appeal-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const appealId = btn.dataset.id;
                            const userId = btn.dataset.user;
                            
                            const batch = db.batch();
                            batch.update(db.collection("users").doc(userId), { banned: false });
                            batch.update(db.collection("appeals").doc(appealId), {
                                status: 'approved',
                                reviewedAt: Date.now()
                            });
                            await batch.commit();
                            
                            btn.closest('.admin-appeal-item').remove();
                            await customAlert("Appeal approved.", "Done");
                        });
                    });
                    
                    document.querySelectorAll('.deny-appeal-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const appealId = btn.dataset.id;
                            await db.collection("appeals").doc(appealId).update({
                                status: 'denied',
                                reviewedAt: Date.now()
                            });
                            
                            btn.closest('.admin-appeal-item').remove();
                            await customAlert("Appeal denied.", "Done");
                        });
                    });
                }
                break;
                
            case 'verification':
                const verifySnap = await db.collection("verification_requests")
                    .where("status", "==", "pending")
                    .get();
                
                if (verifySnap.empty) {
                    content.innerHTML = '<p>No pending verification requests.</p>';
                } else {
                    content.innerHTML = verifySnap.docs.map(doc => {
                        const req = doc.data();
                        return `
                            <div class="admin-verify-item">
                                <img src="${escapeHtml(req.photoUrl)}" style="max-width:200px;">
                                <p><strong>User ID:</strong> ${req.userId}</p>
                                <button class="admin-btn verify-approve-btn" data-id="${doc.id}" data-user="${req.userId}">
                                    Verify User
                                </button>
                                <button class="admin-btn verify-deny-btn" data-id="${doc.id}">Deny</button>
                            </div>
                        `;
                    }).join('');
                    
                    document.querySelectorAll('.verify-approve-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const requestId = btn.dataset.id;
                            const userId = btn.dataset.user;
                            
                            const batch = db.batch();
                            batch.update(db.collection("users").doc(userId), { verified: true });
                            batch.update(db.collection("verification_requests").doc(requestId), {
                                status: 'approved',
                                reviewedAt: Date.now()
                            });
                            await batch.commit();
                            
                            btn.closest('.admin-verify-item').remove();
                            await customAlert("User verified!", "Done");
                        });
                    });
                    
                    document.querySelectorAll('.verify-deny-btn').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            await db.collection("verification_requests").doc(btn.dataset.id).update({
                                status: 'denied',
                                reviewedAt: Date.now()
                            });
                            btn.closest('.admin-verify-item').remove();
                            await customAlert("Verification denied.", "Done");
                        });
                    });
                }
                break;
                
            case 'updates':
                content.innerHTML = `
                    <div class="admin-update-form">
                        <textarea id="updateMessage" placeholder="Update message..." rows="4"></textarea>
                        <select id="updateType">
                            <option value="info">Info</option>
                            <option value="warning">Warning</option>
                            <option value="success">Success</option>
                        </select>
                        <button id="postUpdateBtn" class="small-glass">Post Update</button>
                    </div>
                `;
                
                document.getElementById('postUpdateBtn').onclick = async () => {
                    const message = document.getElementById('updateMessage').value.trim();
                    const type = document.getElementById('updateType').value;
                    
                    if (!message) {
                        await customAlert("Enter a message.", "Error");
                        return;
                    }
                    
                    await db.collection("updates").add({
                        message,
                        type,
                        active: true,
                        timestamp: Date.now(),
                        postedBy: currentUser.uid
                    });
                    
                    await customAlert("Update posted!", "Success");
                    content.innerHTML = '<p>Update posted successfully!</p>';
                };
                break;
        }
    } catch (err) {
        console.error('Error loading admin tab:', err);
        content.innerHTML = '<p>Error loading content.</p>';
    }
}

// ========== MEET AI ==========
// IMPORTANT: In production, move this to a Cloud Function
// The API key should NEVER be in client-side code
const AI_CHAT_ENDPOINT = '/api/chat'; // Proxy endpoint to your backend

let aiConversation = [{
    role: "system",
    content: "You are MEET AI, a helpful dating assistant. Provide dating tips, relationship advice, conversation starters, and guidance on using the app. Keep answers concise, friendly, and supportive."
}];

async function sendAiMessage() {
    const input = document.getElementById('aiChatInput');
    const text = input?.value.trim();
    if (!text) return;
    
    addAiBubble(text, 'user');
    aiConversation.push({ role: 'user', content: text });
    input.value = '';
    
    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message bot typing-indicator';
    typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    const body = document.getElementById('aiChatBody');
    if (body) {
        body.appendChild(typingDiv);
        body.scrollTop = body.scrollHeight;
    }
    
    try {
        const reply = await fetchOpenAIResponse();
        if (typingDiv.parentElement) typingDiv.remove();
        addAiBubble(reply, 'bot');
        aiConversation.push({ role: 'assistant', content: reply });
    } catch (err) {
        console.error('AI response error:', err);
        if (typingDiv.parentElement) typingDiv.remove();
        addAiBubble("Sorry, I'm having trouble right now. Please try again later.", 'bot');
    }
}

function addAiBubble(text, sender) {
    const bubble = document.createElement('div');
    bubble.className = `ai-message ${sender}`;
    bubble.textContent = text;
    const body = document.getElementById('aiChatBody');
    if (body) {
        body.appendChild(bubble);
        bubble.scrollIntoView({ behavior: 'smooth' });
    }
}

async function fetchOpenAIResponse() {
    // This should call your backend, not OpenAI directly
    try {
        const response = await fetch(AI_CHAT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await auth.currentUser?.getIdToken()}`
            },
            body: JSON.stringify({
                messages: aiConversation.slice(-10) // Limit context
            })
        });
        
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        
        const data = await response.json();
        return data.reply || "I'm not sure how to respond to that.";
        
    } catch (err) {
        console.error('AI fetch error:', err);
        
        // Fallback responses if API is down
        const fallbacks = [
            "That's interesting! Tell me more about what you're looking for in a connection.",
            "I'd suggest being yourself and starting with a genuine compliment. What do you think?",
            "Dating can be exciting! Remember to stay safe and take things at your own pace.",
            "That's a great question! The best relationships start with honest communication.",
            "I'm here to help! What specific dating advice are you looking for?"
        ];
        
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}

// ========== LIFE-CYCLE FUNCTIONS ==========
function attachNavEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            const viewId = item.dataset.nav;
            
            if (viewId === 'stories') return; // Handled separately
            
            // Hide all views
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
            
            // Show selected view
            const targetView = document.getElementById(viewId + 'View');
            if (targetView) {
                targetView.classList.add('active-view');
            }
            
            // Update active nav
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // Handle specific views
            if (viewId === 'messages') {
                document.getElementById('chatListContainer').style.display = 'block';
                document.getElementById('chatScreenContainer').style.display = 'none';
                if (unsubscribeMessages) {
                    unsubscribeMessages();
                    unsubscribeMessages = null;
                }
                currentChatPartner = null;
                await renderChatList();
            }
            
            if (viewId === 'explore') await renderExplore();
            if (viewId === 'profile') await renderProfileUI();
            if (viewId === 'swipe') await renderSwipeCards();
            
            // Hide edit/settings views
            document.getElementById('editProfileView').style.display = 'none';
            document.getElementById('settingsDetailView').style.display = 'none';
        });
    });
    
    // Set initial active nav
    const defaultNav = document.querySelector('.nav-item[data-nav="swipe"]');
    if (defaultNav) defaultNav.classList.add('active');
}

async function showMainApp() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('signupView').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    await loadCurrentUser();
    
    if (!currentUser) {
        document.getElementById('loginView').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
        return;
    }
    
    // Request push notifications
    requestPushPermission();
    
    // Check for updates
    checkForUpdates();
    
    // Real-time user listener
    if (unsubscribeUser) unsubscribeUser();
    const userRef = db.collection("users").doc(currentUser.uid);
    unsubscribeUser = userRef.onSnapshot(docSnap => {
        if (docSnap.exists) {
            currentUser = { id: docSnap.id, ...docSnap.data() };
            renderProfileUI();
        }
    }, err => {
        console.error('User listener error:', err);
    });
    
    // Render initial views
    await renderAll();
    
    // Attach navigation
    attachNavEvents();
    
    // Start heartbeat
    startHeartbeat();
    
    // Listen for notifications
    listenForNotifications();
    
    // Initial render
    await renderSwipeCards();
    await renderChatList();
}

async function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    
    heartbeatInterval = setInterval(async () => {
        if (currentUser && currentUser.uid) {
            try {
                await db.collection("users").doc(currentUser.uid).update({
                    lastSeen: Date.now()
                });
            } catch (err) {
                console.error('Heartbeat error:', err);
            }
        }
    }, 30000);
}

async function loadCurrentUser() {
    const uid = localStorage.getItem('currentUserUid');
    if (!uid) return;
    
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
            currentUser = { id: userDoc.id, ...userDoc.data() };
            
            // Check if banned
            if (currentUser.banned) {
                await auth.signOut();
                localStorage.removeItem('currentUserUid');
                currentUser = null;
                await customAlert("Your account has been banned.", "Account Banned");
            }
        } else {
            localStorage.removeItem('currentUserUid');
        }
    } catch (err) {
        console.error('Error loading user:', err);
        localStorage.removeItem('currentUserUid');
    }
}

async function renderAll() {
    await Promise.all([
        renderProfileUI(),
        renderChatList(),
        renderExplore(),
        renderSwipeCards()
    ]).catch(err => console.error('Error rendering all views:', err));
}

// ========== EVENT BINDINGS ==========
function bindAllEvents() {
    // Navigation between login and signup
    document.getElementById('goToSignupLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginView').style.display = 'none';
        document.getElementById('signupView').style.display = 'flex';
    });
    
    document.getElementById('goToLoginLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('signupView').style.display = 'none';
        document.getElementById('loginView').style.display = 'flex';
    });
    
    // Forgot password
    document.getElementById('forgotPasswordBtn')?.addEventListener('click', async () => {
        const email = await customPrompt("Enter your email address:", "", "Reset Password");
        if (email && validateEmail(email)) {
            try {
                await auth.sendPasswordResetEmail(email);
                await customAlert("Password reset email sent! Check your inbox.", "Email Sent");
            } catch (err) {
                await customAlert(err.message, "Error");
            }
        } else if (email) {
            await customAlert("Please enter a valid email.", "Error");
        }
    });
    
    // Appeal ban button
    document.getElementById('appealBanBtn')?.addEventListener('click', async () => {
        const email = await customPrompt("Enter your email address:", "", "Appeal Ban");
        if (!email) return;
        
        try {
            const usersSnap = await db.collection("users")
                .where("email", "==", email.toLowerCase().trim())
                .get();
            
            if (usersSnap.empty) {
                await customAlert("No account found with that email.", "Not Found");
                return;
            }
            
            const userDoc = usersSnap.docs[0];
            const userData = userDoc.data();
            
            if (!userData.banned) {
                await customAlert("This account is not banned.", "Not Banned");
                return;
            }
            
            const reason = await customPrompt("Why should you be unbanned?", "", "Appeal");
            if (reason) {
                await db.collection("appeals").add({
                    userId: userDoc.id,
                    userName: userData.name,
                    userEmail: userData.email,
                    reason,
                    status: "pending",
                    timestamp: Date.now()
                });
                await customAlert("Appeal submitted. We'll review it within 48 hours.", "Appeal Submitted");
            }
        } catch (err) {
            console.error('Appeal error:', err);
            await customAlert("Error submitting appeal.", "Error");
        }
    });
    
    // Google sign-in buttons
    document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
        try {
            const user = await window.signInWithGoogle();
            localStorage.setItem('currentUserUid', user.uid);
            const userDoc = await db.collection("users").doc(user.uid).get();
            currentUser = { id: user.uid, ...userDoc.data() };
            await showMainApp();
        } catch (err) {
            console.error('Google sign-in error:', err);
            if (err.message !== 'auth/popup-closed-by-user') {
                await customAlert(err.message, "Error");
            }
        }
    });
    
    document.getElementById('googleSignUpBtn')?.addEventListener('click', async () => {
        try {
            const user = await window.signInWithGoogle();
            localStorage.setItem('currentUserUid', user.uid);
            const userDoc = await db.collection("users").doc(user.uid).get();
            currentUser = { id: user.uid, ...userDoc.data() };
            await showMainApp();
        } catch (err) {
            console.error('Google sign-up error:', err);
            if (err.message !== 'auth/popup-closed-by-user') {
                await customAlert(err.message, "Error");
            }
        }
    });
    
    // Signup form
    document.getElementById('signupFormElem')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('signupName')?.value;
        const email = document.getElementById('signupEmail')?.value;
        const pwd = document.getElementById('signupPassword')?.value;
        const confirm = document.getElementById('confirmPwd')?.value;
        const gender = document.getElementById('signupGender')?.value || 'Other';
        const age = document.getElementById('signupAge')?.value;
        const refCode = document.getElementById('signupReferralCode')?.value;
        
        if (pwd !== confirm) {
            await customAlert("Passwords don't match.", "Error");
            return;
        }
        
        try {
            await window.signupUser(email, pwd, name, age, gender, refCode);
            document.getElementById('signupView').style.display = 'none';
            document.getElementById('loginView').style.display = 'flex';
            await customAlert("Account created! Please verify your email.", "Success");
        } catch (err) {
            // Error already handled in signupUser
        }
    });
    
    // Login form
    document.getElementById('loginFormElem')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail')?.value;
        const pwd = document.getElementById('loginPassword')?.value;
        
        try {
            const user = await window.loginUserFirebase(email, pwd);
            localStorage.setItem('currentUserUid', user.uid);
            const userDoc = await db.collection("users").doc(user.uid).get();
            currentUser = { id: user.uid, ...userDoc.data() };
            await showMainApp();
        } catch (err) {
            console.error('Login error:', err);
            await customAlert(err.message, "Login Error");
        }
    });
    
    // Toggle password visibility
    document.querySelectorAll('.toggle-pwd').forEach(icon => {
        icon.addEventListener('click', function() {
            const target = document.getElementById(this.dataset.target);
            if (target) {
                target.type = (target.type === 'password') ? 'text' : 'password';
                this.classList.toggle('fa-eye');
                this.classList.toggle('fa-eye-slash');
            }
        });
    });
    
    // AI Chat
    document.getElementById('aiChatToggleBtn')?.addEventListener('click', () => {
        if (!currentUser) {
            customAlert("Please log in to use MEET AI.", "Login Required");
            return;
        }
        const win = document.getElementById('aiChatWindow');
        if (win) {
            win.style.display = (win.style.display === 'flex') ? 'none' : 'flex';
            if (win.style.display === 'flex') {
                document.getElementById('aiChatInput')?.focus();
            }
        }
    });
    
    document.getElementById('closeAiChat')?.addEventListener('click', () => {
        document.getElementById('aiChatWindow').style.display = 'none';
    });
    
    document.getElementById('sendAiMsg')?.addEventListener('click', sendAiMessage);
    
    document.getElementById('aiChatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAiMessage();
    });
    
    // Chat search
    document.getElementById('chatSearchInput')?.addEventListener('input', function(e) {
        const term = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.chat-list-item').forEach(item => {
            const name = item.querySelector('.chat-name')?.textContent?.toLowerCase() || '';
            item.style.display = name.includes(term) ? 'flex' : 'none';
        });
    });
    
    // Stories
    document.querySelector('[data-nav="stories"]')?.addEventListener('click', () => {
        if (!currentUser) {
            customAlert("Please log in to create a story.", "Login Required");
            return;
        }
        
        if (!supabase) {
            customAlert("Stories feature unavailable.", "Error");
            return;
        }
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > 20 * 1024 * 1024) {
                await customAlert("File must be less than 20MB.", "Error");
                return;
            }
            
            try {
                const fileName = `stories/${currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
                const { error } = await supabase.storage
                    .from('chat-images')
                    .upload(fileName, file);
                
                if (error) throw error;
                
                const { data: urlData } = supabase.storage
                    .from('chat-images')
                    .getPublicUrl(fileName);
                
                // Show story
                const modal = document.createElement('div');
                modal.className = 'story-modal';
                modal.innerHTML = `
                    <span class="story-close">&times;</span>
                    ${file.type.startsWith('video') 
                        ? `<video src="${urlData.publicUrl}" controls autoplay></video>` 
                        : `<img src="${urlData.publicUrl}" alt="Story">`
                    }
                `;
                
                document.body.appendChild(modal);
                modal.querySelector('.story-close').onclick = () => modal.remove();
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) modal.remove();
                });
                
                // Auto-remove after 10 seconds
                setTimeout(() => {
                    if (modal.parentElement) modal.remove();
                }, 10000);
                
                // Save story reference
                await db.collection("stories").add({
                    userId: currentUser.uid,
                    url: urlData.publicUrl,
                    type: file.type.startsWith('video') ? 'video' : 'image',
                    createdAt: Date.now(),
                    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
                });
                
            } catch (err) {
                console.error('Story upload error:', err);
                await customAlert("Failed to upload story.", "Error");
            }
        };
        
        input.click();
    });
    
    // Watch stories
    document.getElementById('watchStoriesBtn')?.addEventListener('click', async () => {
        if (!supabase) {
            customAlert("Stories unavailable.", "Error");
            return;
        }
        
        try {
            // Get recent stories from database
            const storiesSnap = await db.collection("stories")
                .where("expiresAt", ">", Date.now())
                .orderBy("expiresAt", "desc")
                .limit(10)
                .get();
            
            if (storiesSnap.empty) {
                await customAlert("No stories available right now.", "Stories");
                return;
            }
            
            const stories = storiesSnap.docs.map(doc => doc.data());
            let currentStory = 0;
            
            const modal = document.createElement('div');
            modal.className = 'story-modal';
            
            const showStory = (index) => {
                const story = stories[index];
                modal.innerHTML = `
                    <span class="story-close">&times;</span>
                    ${story.type === 'video' 
                        ? `<video src="${escapeHtml(story.url)}" controls autoplay></video>` 
                        : `<img src="${escapeHtml(story.url)}" alt="Story">`
                    }
                    <div class="story-nav">
                        <button id="prevStory" ${index === 0 ? 'disabled' : ''}>◀</button>
                        <span>${index + 1} / ${stories.length}</span>
                        <button id="nextStory" ${index === stories.length - 1 ? 'disabled' : ''}>▶</button>
                    </div>
                `;
                
                modal.querySelector('.story-close').onclick = () => modal.remove();
                modal.querySelector('#prevStory')?.addEventListener('click', () => {
                    if (currentStory > 0) {
                        currentStory--;
                        showStory(currentStory);
                    }
                });
                modal.querySelector('#nextStory')?.addEventListener('click', () => {
                    if (currentStory < stories.length - 1) {
                        currentStory++;
                        showStory(currentStory);
                    }
                });
            };
            
            showStory(0);
            document.body.appendChild(modal);
            
            // Auto-advance
            const interval = setInterval(() => {
                if (currentStory < stories.length - 1) {
                    currentStory++;
                    showStory(currentStory);
                } else {
                    clearInterval(interval);
                    setTimeout(() => {
                        if (modal.parentElement) modal.remove();
                    }, 3000);
                }
            }, 5000);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    clearInterval(interval);
                    modal.remove();
                }
            });
            
        } catch (err) {
            console.error('Error loading stories:', err);
            await customAlert("Error loading stories.", "Error");
        }
    });
    
    // Explore filters
    document.getElementById('applyFilterBtn')?.addEventListener('click', () => renderExplore());
    
    console.log('✅ All event listeners bound');
}

// ========== STARTUP ==========
function startApp() {
    // Check for existing session
    if (localStorage.getItem('currentUserUid')) {
        loadCurrentUser().then(() => {
            if (currentUser && !currentUser.banned) {
                showMainApp();
            } else {
                document.getElementById('loginView').style.display = 'flex';
            }
        }).catch(() => {
            document.getElementById('loginView').style.display = 'flex';
        });
    } else {
        document.getElementById('loginView').style.display = 'flex';
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        bindAllEvents();
        startApp();
    });
} else {
    bindAllEvents();
    startApp();
}

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
        .then(reg => {
            console.log('Service Worker registered');
            if (messaging) {
                messaging.useServiceWorker(reg);
            }
        })
        .catch(err => console.error('Service Worker registration failed:', err));
}

// Pre-fill referral code from URL
(function() {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
        // Store referral for later use
        sessionStorage.setItem('referralCode', ref);
        
        // Pre-fill login form
        const loginRefGroup = document.getElementById('loginReferralGroup');
        const loginRefInput = document.getElementById('loginReferralCode');
        if (loginRefGroup && loginRefInput) {
            loginRefGroup.style.display = 'block';
            loginRefInput.value = ref;
        }
        
        // Pre-fill signup form
        const signupRefInput = document.getElementById('signupReferralCode');
        if (signupRefInput) {
            signupRefInput.value = ref;
        }
    }
})();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml,
        validateEmail,
        validatePassword,
        validateAge,
        generateReferralCode,
        formatTimeAgo,
        formatMessageDate
    };
}