/**
 * YarnCraft Companion - English & Full Responsive Web Logic
 * Core Controller, State Management & Google Identity Services (GSI)
 */

class CraftApp {
  constructor() {
    this.currentScreen = 'welcome';
    this.screenHistory = [];
    this.currentUser = null;
    this.activeProjectFilter = 'in_progress'; // DEFAULT: uncompleted projects!
    this.authMode = 'login'; // 'login' or 'signup'
    this.webcamStream = null;
    this.webcamTarget = null; // 'yarn', 'project', or 'hook'
    this.currentEditingYarnPhoto = '';
    this.currentEditingProjectPhoto = '';
    this.currentEditingHookPhoto = '';
    this.googleClientId = '';
  }

  async init() {
    try {
      await window.yarnDB.init();
      console.log('IndexedDB initialized');
    } catch (err) {
      console.error('Failed to init DB:', err);
      this.showToast('Database init issue, please refresh', '⚠️');
    }

    // Connect cloud sync status listener
    window.yarnDB.onSyncStatusChange = (status) => this.updateSyncUI(status);

    // Initialize Firebase Auth listener
    this.setupFirebaseAuth();

    // Check active session
    const sessionUser = await window.yarnDB.getCurrentSession();
    if (sessionUser) {
      this.currentUser = sessionUser;
      window.yarnDB.setUserId(sessionUser.uid || sessionUser.id);
      this.updateUserUI();
      this.navigate('dashboard', false);
    } else {
      this.navigate('welcome', false);
    }

    // Refresh categories, hooks, and yarns in form dropdowns
    await this.refreshDropdowns();

    // Register Service Worker for Standalone Application Mode
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('ServiceWorker registration optional:', err);
      });
    }

    // Capture install prompt for desktop / phone home screen installation
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const btn = document.getElementById('pwaInstallBtn');
      if (btn) btn.classList.remove('hidden');
    });
  }

  installPWA() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          this.showToast('YarnCraft installed as an application!', '🎉');
        }
        this.deferredPrompt = null;
      });
    } else {
      this.showToast('To install, use the browser menu & select "Install App"', '💡');
    }
  }

  // --- Real Firebase Authentication & Google Sign-In ---
  setupFirebaseAuth() {
    if (typeof firebase === 'undefined' || !window.firebaseAuth) {
      console.warn('Firebase Auth SDK not loaded yet. Operating in local mode.');
      this.updateSyncUI('offline');
      return;
    }

    window.firebaseAuth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        console.log('🔥 Firebase Auth State: User signed in:', fbUser.email);
        const googleUser = {
          id: fbUser.uid,
          uid: fbUser.uid,
          email: fbUser.email,
          name: fbUser.displayName || 'Google Crafter',
          picture: fbUser.photoURL || '',
          platform: 'Google'
        };

        window.yarnDB.setUserId(fbUser.uid);
        await window.yarnDB.setCurrentSession(googleUser);
        this.currentUser = googleUser;
        this.updateUserUI();
        this.updateSyncUI('synced');

        // Automatically pull latest cloud data to ensure multi-device sync
        try {
          await window.yarnDB.pullAllFromCloud(fbUser.uid);
          await this.refreshDropdowns();
          if (this.currentScreen === 'dashboard') await this.renderDashboard();
          else if (this.currentScreen === 'stash') await this.renderStashPage();
          else if (this.currentScreen === 'projects') await this.renderProjectsPage();
          else if (this.currentScreen === 'hooks') await this.renderHooksPage();
        } catch (e) {
          console.warn('Initial cloud pull failed:', e);
        }

        if (['welcome', 'login'].includes(this.currentScreen)) {
          this.navigate('dashboard');
        }
      } else {
        console.log('🔥 Firebase Auth State: No user signed in');
        this.updateSyncUI('offline');
      }
    });
  }

  async signInWithGoogle() {
    if (!window.firebaseAuth) {
      this.showToast('Connecting to Firebase...', '🔄');
      return;
    }

    try {
      this.showToast('Opening Google Sign-In...', '🔑');
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await window.firebaseAuth.signInWithPopup(provider);
      const fbUser = result.user;
      
      const googleUser = {
        id: fbUser.uid,
        uid: fbUser.uid,
        email: fbUser.email,
        name: fbUser.displayName || 'Google Crafter',
        picture: fbUser.photoURL || '',
        platform: 'Google'
      };

      window.yarnDB.setUserId(fbUser.uid);
      await window.yarnDB.setCurrentSession(googleUser);
      this.currentUser = googleUser;
      this.updateUserUI();
      this.showToast(`Welcome, ${googleUser.name}! (Google Cloud Synced)`, '🎉');

      // Sync cloud data
      await window.yarnDB.pullAllFromCloud(fbUser.uid);
      // Also push any local creations to the cloud so nothing is lost
      await window.yarnDB.pushAllToCloud(fbUser.uid);
      await this.refreshDropdowns();
      this.navigate('dashboard');
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        this.showToast('Sign-in cancelled', 'ℹ️');
      } else if (err.code === 'auth/unauthorized-domain') {
        this.showToast('Please add current domain to Firebase Authorized Domains', '⚠️');
      } else {
        this.showToast('Google Sign-In: ' + (err.message || 'Error occurred'), '❌');
      }
    }
  }

  async syncNowWithCloud() {
    if (!this.currentUser || this.currentUser.isGuest) {
      this.showToast('Please sign in with Google to enable cloud sync', '💡');
      return;
    }

    const uid = this.currentUser.uid || this.currentUser.id;
    this.showToast('Syncing with Google Firestore Cloud...', '☁️');
    this.updateSyncUI('syncing');

    try {
      await window.yarnDB.pullAllFromCloud(uid);
      await window.yarnDB.pushAllToCloud(uid);
      await this.refreshDropdowns();
      if (this.currentScreen === 'dashboard') await this.renderDashboard();
      if (this.currentScreen === 'stash') await this.renderStashPage();
      if (this.currentScreen === 'projects') await this.renderProjectsPage();
      if (this.currentScreen === 'hooks') await this.renderHooksPage();
      this.updateSyncUI('synced');
      this.showToast('Cloud database synchronized successfully!', '✅');
    } catch (err) {
      console.error('Manual sync error:', err);
      this.updateSyncUI('offline');
      this.showToast('Sync failed: ' + err.message, '❌');
    }
  }

  updateSyncUI(status) {
    const dot = document.getElementById('cloudSyncDot');
    const label = document.getElementById('cloudSyncLabel');
    const profileBadge = document.getElementById('profileCloudBadge');

    if (status === 'syncing') {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
      if (label) label.textContent = 'Syncing...';
      if (profileBadge) {
        profileBadge.className = 'craft-badge text-xs !bg-amber-100 !text-amber-800';
        profileBadge.textContent = '🟡 Syncing with Cloud...';
      }
    } else if (status === 'synced') {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
      if (label) label.textContent = 'Cloud Synced';
      if (profileBadge) {
        profileBadge.className = 'craft-badge accent text-xs !bg-emerald-100 !text-emerald-800';
        profileBadge.textContent = '🟢 Connected & Synced';
      }
    } else {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-gray-400';
      if (label) label.textContent = 'Local Cache';
      if (profileBadge) {
        profileBadge.className = 'craft-badge text-xs bg-gray-100 text-gray-600';
        profileBadge.textContent = '⚪ Local Cache Mode';
      }
    }
  }

  openGoogleSetupModal() {
    this.showToast('Firebase Google Sign-In is already active!', '✨');
  }

  closeGoogleSetupModal() {}

  // --- Router & Navigation ---
  navigate(screenId, addToHistory = true) {
    if (addToHistory && this.currentScreen !== screenId) {
      this.screenHistory.push(this.currentScreen);
    }

    // Hide all screens
    document.querySelectorAll('.screen-container').forEach(el => {
      el.classList.remove('active');
    });

    // Show target screen
    const targetEl = document.getElementById(`screen-${screenId}`);
    if (targetEl) {
      targetEl.classList.add('active');
      this.currentScreen = screenId;
    }

    // Top Header visibility (Top navigation bar only)
    const siteHeader = document.getElementById('siteHeader');
    const isAuth = ['welcome', 'login'].includes(screenId);

    if (siteHeader) siteHeader.style.display = isAuth ? 'none' : 'block';

    // Highlight active nav links on desktop and mobile
    document.querySelectorAll('.site-nav-link').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      if (tab === screenId || (screenId === 'yarn-form' && tab === 'stash') || (screenId === 'project-form' && tab === 'projects')) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.onScreenEnter(screenId);
  }

  goBack() {
    if (this.screenHistory.length > 0) {
      const prevScreen = this.screenHistory.pop();
      this.navigate(prevScreen, false);
    } else {
      this.navigate('dashboard', false);
    }
  }

  async onScreenEnter(screenId) {
    if (screenId === 'dashboard') {
      await this.renderDashboard();
    } else if (screenId === 'stash') {
      await this.renderStashPage();
    } else if (screenId === 'projects') {
      await this.renderProjectsPage();
    } else if (screenId === 'hooks') {
      await this.renderHooksPage();
    } else if (screenId === 'profile') {
      this.renderProfilePage();
    }
  }

  // --- Auth Handlers ---
  toggleAuthMode() {
    this.authMode = this.authMode === 'login' ? 'signup' : 'login';
    const heading = document.getElementById('authHeading');
    const submitBtn = document.getElementById('authSubmitBtn');
    const nameField = document.getElementById('authNameField');
    const toggleText = document.getElementById('authToggleText');
    const toggleBtn = document.getElementById('authToggleBtn');

    if (this.authMode === 'signup') {
      heading.textContent = 'Create Account';
      submitBtn.textContent = 'Sign Up';
      nameField.style.display = 'flex';
      toggleText.textContent = 'Already have an account?';
      toggleBtn.textContent = 'Log in';
    } else {
      heading.textContent = 'Login';
      submitBtn.textContent = 'Login';
      nameField.style.display = 'none';
      toggleText.textContent = 'Need an account?';
      toggleBtn.textContent = 'Sign up';
    }
  }

  togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  }

  async handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName').value.trim() || 'Crafter';

    if (!email || !password) {
      this.showToast('Please enter both email and password', '⚠️');
      return;
    }

    try {
      if (this.authMode === 'signup') {
        const existing = await window.yarnDB.getUserByEmail(email);
        if (existing) {
          this.showToast('Email already registered. Please log in.', '⚠️');
          return;
        }

        const newUser = {
          id: 'user_' + Date.now(),
          email: email.toLowerCase(),
          password,
          name,
          createdAt: new Date().toISOString()
        };
        await window.yarnDB.put('users', newUser);
        await window.yarnDB.setCurrentSession(newUser);
        this.currentUser = newUser;
        this.showToast('Account created successfully! Welcome.', '🎉');
      } else {
        const user = await window.yarnDB.getUserByEmail(email);
        if (!user || user.password !== password) {
          this.showToast('Incorrect email or password', '❌');
          return;
        }
        await window.yarnDB.setCurrentSession(user);
        this.currentUser = user;
        this.showToast('Welcome back!', '✨');
      }

      this.updateUserUI();
      this.navigate('dashboard');
    } catch (err) {
      console.error(err);
      this.showToast('Authentication error, please retry', '⚠️');
    }
  }

  async continueAsGuest() {
    const guestUser = {
      id: 'guest_user',
      name: 'Guest Crafter',
      email: 'guest@yarncraft.local',
      isGuest: true
    };
    await window.yarnDB.setCurrentSession(guestUser);
    this.currentUser = guestUser;
    this.updateUserUI();
    this.showToast('Signed in as Guest', '🧶');
    this.navigate('dashboard');
  }

  async loginDemoUser(platform) {
    const socialUser = {
      id: `user_${platform.toLowerCase()}`,
      name: `${platform} Crafter`,
      email: `${platform.toLowerCase()}@craft.user`,
      platform
    };
    await window.yarnDB.setCurrentSession(socialUser);
    this.currentUser = socialUser;
    this.updateUserUI();
    this.showToast(`Signed in via ${platform}`, '✨');
    this.navigate('dashboard');
  }

  async logout() {
    try {
      if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        await window.firebaseAuth.signOut();
      }
    } catch (err) {
      console.warn('Firebase signOut error:', err);
    }
    await window.yarnDB.clearSession();
    this.currentUser = null;
    this.updateSyncUI('offline');
    this.showToast('Signed out safely', '👋');
    this.navigate('welcome', false);
  }

  updateUserUI() {
    if (!this.currentUser) return;
    const name = this.currentUser.name || 'Crafter';
    const email = this.currentUser.email || '';

    const greetingEl = document.getElementById('userGreeting');
    if (greetingEl) greetingEl.textContent = `Hi, ${name} ✨`;

    const profileName = document.getElementById('profileName');
    if (profileName) profileName.textContent = name;

    const profileEmail = document.getElementById('profileEmail');
    if (profileEmail) profileEmail.textContent = email;

    const navAvatar = document.getElementById('navUserAvatar');
    const profileAvatar = document.getElementById('profileAvatar');
    if (this.currentUser.picture) {
      if (navAvatar) navAvatar.innerHTML = `<img src="${this.currentUser.picture}" class="w-full h-full rounded-full object-cover">`;
      if (profileAvatar) profileAvatar.innerHTML = `<img src="${this.currentUser.picture}" class="w-full h-full rounded-full object-cover">`;
    } else {
      if (navAvatar) navAvatar.innerHTML = `🧶`;
      if (profileAvatar) profileAvatar.innerHTML = `🧶`;
    }

    // Update Profile Cloud Card details
    const accountStatus = document.getElementById('profileAccountStatus');
    const googleSignBtn = document.getElementById('profileGoogleSignBtn');
    if (accountStatus) {
      if (this.currentUser.platform === 'Google') {
        accountStatus.textContent = `${email} (${name})`;
      } else if (this.currentUser.isGuest) {
        accountStatus.textContent = 'Guest Mode (Local Offline Only)';
      } else {
        accountStatus.textContent = `${email || 'Local User'}`;
      }
    }

    if (googleSignBtn) {
      googleSignBtn.textContent = this.currentUser.platform === 'Google' ? 'Switch Google Account' : 'Sign in with Google';
    }
  }

  // --- Dynamic Dropdowns ---
  async refreshDropdowns() {
    const types = await window.yarnDB.getAll('yarn_types');
    const hooks = await window.yarnDB.getAll('hooks');

    // 1. Dashboard Yarn Filter Dropdown
    const dashYarnFilter = document.getElementById('dashboardYarnFilter');
    if (dashYarnFilter) {
      const curVal = dashYarnFilter.value;
      dashYarnFilter.innerHTML = '<option value="ALL">All Yarn Types (No filter)</option>' +
        types.map(t => `<option value="${t.id}">${t.icon || '🧶'} ${t.name}</option>`).join('');
      dashYarnFilter.value = curVal || 'ALL';
    }

    // 2. Stash Filter Dropdown
    const stashTypeFilter = document.getElementById('stashTypeFilter');
    if (stashTypeFilter) {
      const curVal = stashTypeFilter.value;
      stashTypeFilter.innerHTML = '<option value="ALL">All Yarn Types (No filter - show all)</option>' +
        types.map(t => `<option value="${t.id}">${t.icon || '🧶'} ${t.name}</option>`).join('');
      stashTypeFilter.value = curVal || 'ALL';
    }

    // 3. Yarn Form Type Dropdown
    const yarnFormType = document.getElementById('yarnFormType');
    if (yarnFormType) {
      yarnFormType.innerHTML = types.map(t => `<option value="${t.id}">${t.icon || '🧶'} ${t.name}</option>`).join('');
    }

    // 4. Project Form Hook Dropdown
    const projectFormHook = document.getElementById('projectFormHook');
    if (projectFormHook) {
      projectFormHook.innerHTML = hooks.map(h => `<option value="${h.id}">${h.size} - ${h.name} (${h.brand || 'Standard'})</option>`).join('');
    }

    // 5. Project Form Yarn Dropdown (from stash)
    const yarns = await window.yarnDB.getAll('yarns');
    const projectFormYarn = document.getElementById('projectFormYarn');
    if (projectFormYarn) {
      if (yarns.length === 0) {
        projectFormYarn.innerHTML = '<option value="">No yarns in stash yet</option>';
      } else {
        projectFormYarn.innerHTML = '<option value="">-- Select yarn from stash (optional) --</option>' +
          yarns.map(y => `<option value="${y.id}">${y.name} (${y.amount} skeins left)</option>`).join('');
      }
    }
  }

  // =========================================================================
  // SCREEN: MAIN DASHBOARD (Shows BOTH Ongoing Projects & Yarn Stash)
  // =========================================================================
  async renderDashboard() {
    const projects = await window.yarnDB.getAll('projects');
    const yarns = await window.yarnDB.getAll('yarns');
    const hooks = await window.yarnDB.getAll('hooks');

    const inProgressProjects = projects.filter(p => p.status === 'in_progress');
    const completedProjects = projects.filter(p => p.status === 'completed');
    const totalSkeins = yarns.reduce((acc, y) => acc + (Number(y.amount) || 0), 0);

    // Update Quick Stats
    document.getElementById('statProjectsCount').textContent = inProgressProjects.length;
    document.getElementById('statYarnCount').textContent = totalSkeins;
    document.getElementById('statDoneCount').textContent = completedProjects.length;
    document.getElementById('statHooksCount').textContent = hooks.length;

    // Render Ongoing Projects List on Dashboard
    const projContainer = document.getElementById('dashboardProjectsList');
    if (inProgressProjects.length === 0) {
      projContainer.innerHTML = `
        <div class="col-span-full craft-card text-center py-10 text-gray-400">
          <p class="text-3xl mb-2">🧶</p>
          <p class="text-sm font-semibold">No ongoing projects currently</p>
          <button class="mt-3 btn-accent !py-2 !px-4 text-xs" onclick="app.openAddProject()">Start Your First Project &rarr;</button>
        </div>
      `;
    } else {
      projContainer.innerHTML = inProgressProjects.slice(0, 3).map(p => this.renderProjectCardHTML(p, true)).join('');
    }

    // Render Yarn Stash Overview on Dashboard
    await this.renderDashboardYarns();
  }

  async renderDashboardYarns() {
    const filterSelect = document.getElementById('dashboardYarnFilter');
    const filterId = filterSelect ? filterSelect.value : 'ALL';
    const yarns = await window.yarnDB.getYarns(filterId);

    const container = document.getElementById('dashboardYarnsList');
    if (yarns.length === 0) {
      container.innerHTML = `
        <div class="col-span-full craft-card text-center py-10 text-gray-400">
          <p class="text-3xl mb-2">📦</p>
          <p class="text-sm font-semibold">No yarns found in this category</p>
          <button class="mt-3 btn-accent !py-2 !px-4 text-xs" onclick="app.openAddYarn()">Add Yarn &rarr;</button>
        </div>
      `;
      return;
    }

    container.innerHTML = yarns.map(y => `
      <div class="craft-card p-3 flex flex-col justify-between !rounded-2xl">
        <div class="cursor-pointer" onclick="app.openEditYarn('${y.id}')">
          <div class="w-full h-28 rounded-xl bg-gray-100 overflow-hidden mb-2.5 relative flex items-center justify-center">
            ${y.image ? `<img src="${y.image}" class="w-full h-full object-cover">` : `<span class="text-3xl">🧶</span>`}
            <span class="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/95 text-craftGreen shadow-xs">
              ${y.typeName ? y.typeName.split(' ')[0] : 'Yarn'}
            </span>
          </div>
          <h4 class="font-bold text-craftGreen text-xs line-clamp-1 mb-1" title="${y.name}">${y.name}</h4>
        </div>

        <!-- Quick Stepper (+/-) -->
        <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <span class="text-[11px] font-semibold text-gray-400">Skeins</span>
          <div class="stepper-container !p-0.5">
            <button class="stepper-btn !w-6 !h-6 !text-sm" onclick="app.quickAdjustYarn('${y.id}', -1, event)">-</button>
            <span class="stepper-count !min-w-[24px] !text-xs font-extrabold">${y.amount}</span>
            <button class="stepper-btn !w-6 !h-6 !text-sm" onclick="app.quickAdjustYarn('${y.id}', 1, event)">+</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  async quickAdjustYarn(yarnId, delta, event) {
    if (event) event.stopPropagation();
    const updated = await window.yarnDB.adjustYarnAmount(yarnId, delta);
    if (updated) {
      if (this.currentScreen === 'dashboard') {
        await this.renderDashboard();
      } else if (this.currentScreen === 'stash') {
        await this.renderStashPage();
      }
      this.showToast(`${updated.name} updated to ${updated.amount} skeins`, '🧶');
    }
  }

  // =========================================================================
  // SCREEN: YARN STASH PAGE (Filter dropdown, +/- steppers)
  // =========================================================================
  async renderStashPage() {
    const filterSelect = document.getElementById('stashTypeFilter');
    const filterId = filterSelect ? filterSelect.value : 'ALL';
    const searchQuery = (document.getElementById('stashSearchInput')?.value || '').toLowerCase().trim();

    let yarns = await window.yarnDB.getYarns(filterId);

    if (searchQuery) {
      yarns = yarns.filter(y => 
        (y.name && y.name.toLowerCase().includes(searchQuery)) ||
        (y.typeName && y.typeName.toLowerCase().includes(searchQuery)) ||
        (y.colorNotes && y.colorNotes.toLowerCase().includes(searchQuery))
      );
    }

    const container = document.getElementById('stashItemsList');
    if (yarns.length === 0) {
      container.innerHTML = `
        <div class="col-span-full craft-card text-center py-12 text-gray-400">
          <p class="text-4xl mb-2">🧵</p>
          <p class="text-sm font-semibold">No yarns match your filter</p>
          <button class="mt-4 btn-accent !py-2 !px-5 text-xs mx-auto" onclick="app.openAddYarn()">Add First Yarn Ball</button>
        </div>
      `;
      return;
    }

    container.innerHTML = yarns.map(y => `
      <div class="craft-card p-4 flex gap-4 items-center">
        <!-- Photo -->
        <div class="w-24 h-24 rounded-2xl bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer shadow-xs" onclick="app.openEditYarn('${y.id}')">
          ${y.image ? `<img src="${y.image}" class="w-full h-full object-cover">` : `<span class="text-4xl">🧶</span>`}
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0 cursor-pointer" onclick="app.openEditYarn('${y.id}')">
          <div class="flex items-center gap-1.5 mb-1.5">
            <span class="craft-badge accent !text-[11px] !py-0.5 !px-2.5">${y.typeName || 'General'}</span>
          </div>
          <h4 class="font-extrabold text-craftGreen text-base truncate">${y.name}</h4>
          <p class="text-xs text-gray-400 mt-1 truncate">${y.colorNotes || 'No dye lot notes'}</p>
        </div>

        <!-- Stepper -->
        <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span class="text-[11px] font-bold text-gray-400">Amount</span>
          <div class="stepper-container">
            <button class="stepper-btn" onclick="app.quickAdjustYarn('${y.id}', -1, event)">-</button>
            <span class="stepper-count font-black text-sm">${y.amount}</span>
            <button class="stepper-btn" onclick="app.quickAdjustYarn('${y.id}', 1, event)">+</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  async openAddYarn() {
    await this.refreshDropdowns();
    document.getElementById('yarnFormTitle').textContent = 'Add New Yarn';
    document.getElementById('yarnFormId').value = '';
    document.getElementById('yarnFormName').value = '';
    document.getElementById('yarnFormAmount').value = 1;
    document.getElementById('yarnFormNotes').value = '';
    document.getElementById('yarnFormDeleteBtn').classList.add('hidden');
    this.setYarnPhotoPreview('');
    this.navigate('yarn-form');
  }

  async openEditYarn(yarnId) {
    await this.refreshDropdowns();
    const yarn = await window.yarnDB.get('yarns', yarnId);
    if (!yarn) return;

    document.getElementById('yarnFormTitle').textContent = 'Edit Yarn Details';
    document.getElementById('yarnFormId').value = yarn.id;
    document.getElementById('yarnFormName').value = yarn.name || '';
    document.getElementById('yarnFormType').value = yarn.typeId || '';
    document.getElementById('yarnFormAmount').value = yarn.amount || 0;
    document.getElementById('yarnFormNotes').value = yarn.colorNotes || '';
    document.getElementById('yarnFormDeleteBtn').classList.remove('hidden');
    this.setYarnPhotoPreview(yarn.image || '');
    this.navigate('yarn-form');
  }

  setYarnPhotoPreview(dataUrl) {
    this.currentEditingYarnPhoto = dataUrl || '';
    const img = document.getElementById('yarnPhotoImg');
    const placeholder = document.getElementById('yarnPhotoPlaceholder');
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  }

  adjustFormStepper(inputId, delta) {
    const input = document.getElementById(inputId);
    if (input) {
      const current = parseInt(input.value) || 0;
      input.value = Math.max(0, current + delta);
    }
  }

  async handleSaveYarn(e) {
    e.preventDefault();
    const yarnId = document.getElementById('yarnFormId').value || 'yarn_' + Date.now();
    const name = document.getElementById('yarnFormName').value.trim();
    const typeSelect = document.getElementById('yarnFormType');
    const typeId = typeSelect.value;
    const typeName = typeSelect.options[typeSelect.selectedIndex]?.text || '';
    const amount = Math.max(0, parseInt(document.getElementById('yarnFormAmount').value) || 0);
    const colorNotes = document.getElementById('yarnFormNotes').value.trim();

    const yarnRecord = {
      id: yarnId,
      name,
      typeId,
      typeName,
      amount,
      colorNotes,
      image: this.currentEditingYarnPhoto,
      updatedAt: new Date().toISOString()
    };

    const existing = await window.yarnDB.get('yarns', yarnId);
    if (!existing) {
      yarnRecord.createdAt = new Date().toISOString();
    } else {
      yarnRecord.createdAt = existing.createdAt;
    }

    await window.yarnDB.put('yarns', yarnRecord);
    this.showToast('Yarn saved successfully!', '✨');
    this.navigate('stash');
  }

  async deleteCurrentYarn() {
    const yarnId = document.getElementById('yarnFormId').value;
    if (!yarnId) return;

    if (confirm('Are you sure you want to delete this yarn?')) {
      await window.yarnDB.delete('yarns', yarnId);
      this.showToast('Yarn deleted', '🗑️');
      this.navigate('stash');
    }
  }

  // =========================================================================
  // SCREEN: PROJECTS (Default: In-Progress / Uncompleted Projects!)
  // =========================================================================
  setProjectFilter(filterStatus) {
    this.activeProjectFilter = filterStatus;
    
    document.getElementById('projectFilterInProgress').classList.toggle('active', filterStatus === 'in_progress');
    document.getElementById('projectFilterCompleted').classList.toggle('active', filterStatus === 'completed');
    document.getElementById('projectFilterAll').classList.toggle('active', filterStatus === 'ALL');

    this.renderProjectsPage();
  }

  async renderProjectsPage() {
    const projects = await window.yarnDB.getProjects(this.activeProjectFilter);
    const container = document.getElementById('projectsListContainer');

    if (projects.length === 0) {
      const msg = this.activeProjectFilter === 'completed' 
        ? 'No completed projects yet. Keep stitching!' 
        : 'No ongoing projects at the moment. Time to start something new!';
      container.innerHTML = `
        <div class="col-span-full craft-card text-center py-12 text-gray-400">
          <p class="text-4xl mb-2">🪡</p>
          <p class="text-sm font-semibold">${msg}</p>
          <button class="mt-4 btn-accent !py-2 !px-5 text-xs mx-auto" onclick="app.openAddProject()">Build New Project</button>
        </div>
      `;
      return;
    }

    container.innerHTML = projects.map(p => this.renderProjectCardHTML(p, false)).join('');
  }

  renderProjectCardHTML(project, isDashboard = false) {
    const isDone = project.status === 'completed' || project.progress >= 100;
    const progress = project.progress || 0;

    return `
      <div class="craft-card p-5 space-y-4 cursor-pointer" onclick="app.openEditProject('${project.id}')">
        <div class="flex gap-4 items-start">
          <div class="w-20 h-20 rounded-2xl bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-xs">
            ${project.image ? `<img src="${project.image}" class="w-full h-full object-cover">` : `<span class="text-3xl">🧶</span>`}
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-1 mb-1">
              <span class="craft-badge ${isDone ? 'completed' : 'accent'} !text-[11px] !py-0.5 !px-2.5">
                ${isDone ? 'Completed 🎉' : 'In Progress ⏳'}
              </span>
              <span class="text-xs font-semibold text-gray-400">
                ${project.startDate ? 'Started ' + project.startDate : ''}
              </span>
            </div>
            <h4 class="font-extrabold text-craftGreen text-base truncate">${project.name}</h4>
            
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${project.hookName ? `
                <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-full">
                  🥢 ${project.hookName}
                </span>` : ''}
              ${project.yarnNames ? `
                <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-full truncate max-w-[180px]">
                  🧶 ${project.yarnNames}
                </span>` : ''}
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="pt-1">
          <div class="flex justify-between items-center text-xs font-black text-craftGreen mb-1.5">
            <span class="text-gray-400 font-semibold">Progress Done</span>
            <span class="${isDone ? 'text-green-700' : 'text-craftGreen'}">${progress}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${isDone ? 'completed' : ''}" style="width: ${progress}%;"></div>
          </div>
        </div>

        <!-- Quick adjust buttons -->
        <div class="flex gap-2 pt-2 border-t border-gray-100 items-center justify-between" onclick="event.stopPropagation()">
          <span class="text-xs font-semibold text-gray-400">Quick adjust:</span>
          <div class="flex gap-1.5">
            <button class="btn-pill-light !py-1 !px-2.5 text-xs font-bold" onclick="app.quickAdjustProgress('${project.id}', 5)">+5%</button>
            <button class="btn-pill-light !py-1 !px-2.5 text-xs font-bold" onclick="app.quickAdjustProgress('${project.id}', 10)">+10%</button>
            <button class="btn-accent !py-1 !px-3 text-xs font-bold" onclick="app.quickAdjustProgress('${project.id}', 100, true)">100% Done</button>
          </div>
        </div>
      </div>
    `;
  }

  async quickAdjustProgress(projectId, val, isAbsolute = false) {
    const project = await window.yarnDB.get('projects', projectId);
    if (!project) return;

    let newProgress = isAbsolute ? val : Math.min(100, (project.progress || 0) + val);
    const updated = await window.yarnDB.updateProjectProgress(projectId, newProgress);
    if (updated) {
      if (this.currentScreen === 'dashboard') {
        await this.renderDashboard();
      } else if (this.currentScreen === 'projects') {
        await this.renderProjectsPage();
      }
      this.showToast(`Progress updated to ${updated.progress}%! ${updated.progress === 100 ? 'Congrats! 🎉' : ''}`, '✨');
    }
  }

  async openAddProject() {
    await this.refreshDropdowns();
    document.getElementById('projectFormTitle').textContent = 'Build New Project';
    document.getElementById('projectFormId').value = '';
    document.getElementById('projectFormName').value = '';
    document.getElementById('projectFormStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('projectFormNotes').value = '';
    document.getElementById('projectFormDeleteBtn').classList.add('hidden');
    this.syncProjectProgress(0);
    this.setProjectPhotoPreview('');
    this.navigate('project-form');
  }

  async openEditProject(projectId) {
    await this.refreshDropdowns();
    const project = await window.yarnDB.get('projects', projectId);
    if (!project) return;

    document.getElementById('projectFormTitle').textContent = 'Edit Project Details';
    document.getElementById('projectFormId').value = project.id;
    document.getElementById('projectFormName').value = project.name || '';
    document.getElementById('projectFormStartDate').value = project.startDate || new Date().toISOString().split('T')[0];
    document.getElementById('projectFormNotes').value = project.notes || '';
    document.getElementById('projectFormDeleteBtn').classList.remove('hidden');

    if (project.hookId) {
      document.getElementById('projectFormHook').value = project.hookId;
    }
    if (project.yarnIds && project.yarnIds.length > 0) {
      document.getElementById('projectFormYarn').value = project.yarnIds[0];
    }

    this.syncProjectProgress(project.progress || 0);
    this.setProjectPhotoPreview(project.image || '');
    this.navigate('project-form');
  }

  setProjectPhotoPreview(dataUrl) {
    this.currentEditingProjectPhoto = dataUrl || '';
    const img = document.getElementById('projPhotoImg');
    const placeholder = document.getElementById('projPhotoPlaceholder');
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  }

  syncProjectProgress(val) {
    const num = Math.min(100, Math.max(0, parseInt(val) || 0));
    const slider = document.getElementById('projectFormProgressSlider');
    const badge = document.getElementById('projectFormProgressBadge');
    if (slider) slider.value = num;
    if (badge) {
      badge.textContent = `${num}%`;
      badge.className = num === 100 ? 'craft-badge completed font-bold text-sm' : 'craft-badge accent font-bold text-sm';
    }
  }

  adjustFormProgress(delta) {
    const slider = document.getElementById('projectFormProgressSlider');
    if (slider) {
      this.syncProjectProgress(parseInt(slider.value) + delta);
    }
  }

  async handleSaveProject(e) {
    e.preventDefault();
    const projId = document.getElementById('projectFormId').value || 'proj_' + Date.now();
    const name = document.getElementById('projectFormName').value.trim();
    const hookSelect = document.getElementById('projectFormHook');
    const hookId = hookSelect.value;
    const hookName = hookSelect.options[hookSelect.selectedIndex]?.text || '';

    const yarnSelect = document.getElementById('projectFormYarn');
    const yarnId = yarnSelect.value;
    const yarnName = yarnId ? (yarnSelect.options[yarnSelect.selectedIndex]?.text || '') : '';

    const startDate = document.getElementById('projectFormStartDate').value;
    const progress = parseInt(document.getElementById('projectFormProgressSlider').value) || 0;
    const notes = document.getElementById('projectFormNotes').value.trim();

    const isComplete = progress >= 100;
    const status = isComplete ? 'completed' : 'in_progress';
    const completedDate = isComplete ? new Date().toISOString().split('T')[0] : null;

    const projectRecord = {
      id: projId,
      name,
      image: this.currentEditingProjectPhoto,
      hookId,
      hookName,
      yarnIds: yarnId ? [yarnId] : [],
      yarnNames: yarnName,
      startDate,
      completedDate,
      progress,
      status,
      notes,
      updatedAt: new Date().toISOString()
    };

    const existing = await window.yarnDB.get('projects', projId);
    if (!existing) {
      projectRecord.createdAt = new Date().toISOString();
    } else {
      projectRecord.createdAt = existing.createdAt;
    }

    await window.yarnDB.put('projects', projectRecord);
    this.showToast('Project saved successfully!', '🎉');
    this.navigate('projects');
  }

  async deleteCurrentProject() {
    const projId = document.getElementById('projectFormId').value;
    if (!projId) return;

    if (confirm('Are you sure you want to delete this project?')) {
      await window.yarnDB.delete('projects', projId);
      this.showToast('Project deleted', '🗑️');
      this.navigate('projects');
    }
  }

  // =========================================================================
  // SCREEN: HOOK COLLECTION (WITH IMAGE SUPPORT)
  // =========================================================================
  async renderHooksPage() {
    const hooks = await window.yarnDB.getAll('hooks');
    const container = document.getElementById('hooksListContainer');

    if (hooks.length === 0) {
      container.innerHTML = `
        <div class="col-span-full craft-card text-center py-12 text-gray-400">
          <p class="text-4xl mb-2">🥢</p>
          <p class="text-sm font-semibold">No crochet hooks in collection yet</p>
          <button class="mt-4 btn-accent !py-2 !px-5 text-xs mx-auto" onclick="app.openAddHookModal()">Add Your First Hook</button>
        </div>
      `;
      return;
    }

    container.innerHTML = hooks.map(h => `
      <div class="craft-card p-4 flex gap-4 items-center">
        <!-- Hook Photo or Size Avatar -->
        <div class="w-16 h-16 rounded-2xl bg-craftPill text-craftGreen flex-shrink-0 overflow-hidden flex items-center justify-center font-black text-sm shadow-xs">
          ${h.image ? `<img src="${h.image}" class="w-full h-full object-cover">` : h.size}
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="craft-badge !text-[11px] !py-0.5 !px-2">${h.size}</span>
            <span class="text-xs text-gray-400 truncate">${h.brand || 'Standard'}</span>
          </div>
          <h4 class="font-extrabold text-craftGreen text-base truncate">${h.name || 'Crochet Hook'}</h4>
          <p class="text-xs text-gray-400 truncate mt-0.5">${h.notes || 'In kit'}</p>
        </div>

        <div class="flex gap-2">
          <button class="btn-sm-icon bg-craftPill text-craftGreen" title="Edit" onclick="app.openEditHookModal('${h.id}')">
            <svg class="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
          <button class="btn-sm-icon bg-red-50 text-red-600" title="Delete" onclick="app.deleteHook('${h.id}')">
            <svg class="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  openAddHookModal() {
    document.getElementById('hookModalTitle').textContent = 'Add Crochet Hook';
    document.getElementById('hookFormId').value = '';
    document.getElementById('hookFormSize').value = '';
    document.getElementById('hookFormName').value = '';
    document.getElementById('hookFormBrand').value = '';
    this.setHookPhotoPreview('');
    document.getElementById('hookModal').classList.add('active');
  }

  async openEditHookModal(hookId) {
    const hook = await window.yarnDB.get('hooks', hookId);
    if (!hook) return;

    document.getElementById('hookModalTitle').textContent = 'Edit Crochet Hook';
    document.getElementById('hookFormId').value = hook.id;
    document.getElementById('hookFormSize').value = hook.size || '';
    document.getElementById('hookFormName').value = hook.name || '';
    document.getElementById('hookFormBrand').value = hook.brand || '';
    this.setHookPhotoPreview(hook.image || '');
    document.getElementById('hookModal').classList.add('active');
  }

  setHookPhotoPreview(dataUrl) {
    this.currentEditingHookPhoto = dataUrl || '';
    const img = document.getElementById('hookPhotoImg');
    const placeholder = document.getElementById('hookPhotoPlaceholder');
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove('hidden');
      placeholder.classList.add('hidden');
    } else {
      img.src = '';
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
    }
  }

  closeHookModal() {
    document.getElementById('hookModal').classList.remove('active');
  }

  async handleSaveHook(e) {
    e.preventDefault();
    const hookId = document.getElementById('hookFormId').value || 'hk_' + Date.now();
    const size = document.getElementById('hookFormSize').value.trim();
    const name = document.getElementById('hookFormName').value.trim() || `${size} Hook`;
    const brand = document.getElementById('hookFormBrand').value.trim();

    await window.yarnDB.put('hooks', {
      id: hookId,
      size,
      name,
      brand,
      image: this.currentEditingHookPhoto,
      createdAt: new Date().toISOString()
    });

    this.closeHookModal();
    await this.refreshDropdowns();
    if (this.currentScreen === 'hooks') {
      await this.renderHooksPage();
    }
    this.showToast('Hook saved to collection!', '🥢');
  }

  async deleteHook(hookId) {
    if (confirm('Delete this crochet hook?')) {
      await window.yarnDB.delete('hooks', hookId);
      await this.refreshDropdowns();
      await this.renderHooksPage();
      this.showToast('Hook removed', '🗑️');
    }
  }

  // =========================================================================
  // MANAGE YARN CATEGORIES
  // =========================================================================
  async openManageTypesModal() {
    await this.renderTypesList();
    document.getElementById('manageTypesModal').classList.add('active');
  }

  closeManageTypesModal() {
    document.getElementById('manageTypesModal').classList.remove('active');
  }

  async renderTypesList() {
    const types = await window.yarnDB.getAll('yarn_types');
    const container = document.getElementById('yarnTypesListContainer');
    container.innerHTML = types.map(t => `
      <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
        <span class="text-sm font-bold text-craftGreen">${t.icon || '🧶'} ${t.name}</span>
        <button class="text-xs text-red-500 font-semibold hover:underline" onclick="app.deleteYarnType('${t.id}')">Remove</button>
      </div>
    `).join('');
  }

  async handleAddNewType() {
    const input = document.getElementById('newTypeNameInput');
    const name = input.value.trim();
    if (!name) return;

    const newType = {
      id: 'yt_' + Date.now(),
      name,
      icon: '🧶'
    };
    await window.yarnDB.put('yarn_types', newType);
    input.value = '';
    await this.renderTypesList();
    await this.refreshDropdowns();
    this.showToast('New yarn category added', '✨');
  }

  async deleteYarnType(typeId) {
    if (confirm('Delete this category?')) {
      await window.yarnDB.delete('yarn_types', typeId);
      await this.renderTypesList();
      await this.refreshDropdowns();
      this.showToast('Category deleted', '🗑️');
    }
  }

  // =========================================================================
  // CAMERA & PHOTO HANDLING (Mobile file capture + WebCam stream)
  // =========================================================================
  triggerPhotoUpload(inputId) {
    const fileInput = document.getElementById(inputId);
    if (fileInput) fileInput.click();
  }

  async handleImageSelected(e, target) {
    const file = e.target.files[0];
    if (!file) return;

    const compressedDataUrl = await this.compressImageFile(file);
    if (target === 'yarn') {
      this.setYarnPhotoPreview(compressedDataUrl);
    } else if (target === 'project') {
      this.setProjectPhotoPreview(compressedDataUrl);
    } else if (target === 'hook') {
      this.setHookPhotoPreview(compressedDataUrl);
    }
    this.showToast('Photo loaded successfully', '📸');
  }

  async compressImageFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1000;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async openWebcamModal(target) {
    this.webcamTarget = target;
    const modal = document.getElementById('webcamModal');
    const video = document.getElementById('webcamVideo');
    modal.classList.add('active');

    try {
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false
      });
      video.srcObject = this.webcamStream;
    } catch (err) {
      console.warn('Webcam access error:', err);
      this.showToast('Unable to open webcam. Please use file upload.', '⚠️');
      this.closeWebcamModal();
    }
  }

  captureWebcamSnapshot() {
    const video = document.getElementById('webcamVideo');
    const canvas = document.getElementById('webcamCanvas');
    if (!video || !this.webcamStream) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    if (this.webcamTarget === 'yarn') {
      this.setYarnPhotoPreview(dataUrl);
    } else if (this.webcamTarget === 'project') {
      this.setProjectPhotoPreview(dataUrl);
    } else if (this.webcamTarget === 'hook') {
      this.setHookPhotoPreview(dataUrl);
    }

    this.closeWebcamModal();
    this.showToast('Photo captured!', '📸');
  }

  closeWebcamModal() {
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach(track => track.stop());
      this.webcamStream = null;
    }
    document.getElementById('webcamModal').classList.remove('active');
  }

  // =========================================================================
  // DATA BACKUP & RESTORE
  // =========================================================================
  async exportDatabaseBackup() {
    try {
      const jsonStr = await window.yarnDB.exportFullBackup();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yarncraft_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Backup downloaded successfully!', '💾');
    } catch (err) {
      console.error(err);
      this.showToast('Failed to export backup', '❌');
    }
  }

  triggerImportBackup() {
    document.getElementById('importFileInput').click();
  }

  async handleImportBackup(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        await window.yarnDB.importFullBackup(event.target.result);
        await this.refreshDropdowns();
        await this.renderDashboard();
        this.showToast('Data restored successfully!', '🎉');
      } catch (err) {
        console.error(err);
        this.showToast('Invalid backup file', '❌');
      }
    };
    reader.readAsText(file);
  }

  renderProfilePage() {
    this.updateUserUI();
  }

  showToast(msg, icon = '✨') {
    const toast = document.getElementById('toastNotice');
    const toastMsg = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    if (!toast || !toastMsg) return;
    toastMsg.textContent = msg;
    if (toastIcon) toastIcon.textContent = icon;

    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
}

// Instantiate and start app
window.app = new CraftApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
