/**
 * YarnCraft Companion - English & Full Web Architecture
 * IndexedDB Database Layer + Real-Time Google Firestore Cloud Synchronization
 * Database Name: YarnCraftDB (v2)
 */

class YarnDatabase {
  constructor() {
    this.dbName = 'YarnCraftDB';
    this.version = 2;
    this.db = null;
    this.currentUserId = null;
    this.onSyncStatusChange = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Users Store
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id' });
          userStore.createIndex('email', 'email', { unique: true });
        }

        // 2. Active Session Store
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'key' });
        }

        // 3. App Settings Store (e.g. Google OAuth Client ID)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 4. Yarn Types (Categories) Store
        if (!db.objectStoreNames.contains('yarn_types')) {
          const typeStore = db.createObjectStore('yarn_types', { keyPath: 'id' });
          typeStore.createIndex('name', 'name', { unique: false });
        }

        // 5. Yarns (Stash) Store
        if (!db.objectStoreNames.contains('yarns')) {
          const yarnStore = db.createObjectStore('yarns', { keyPath: 'id' });
          yarnStore.createIndex('typeId', 'typeId', { unique: false });
          yarnStore.createIndex('name', 'name', { unique: false });
        }

        // 6. Hooks Store (with image support)
        if (!db.objectStoreNames.contains('hooks')) {
          const hookStore = db.createObjectStore('hooks', { keyPath: 'id' });
          hookStore.createIndex('size', 'size', { unique: false });
        }

        // 7. Projects (WIPs & Finished) Store
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('status', 'status', { unique: false });
          projectStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this.seedDefaultsIfNeeded();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Set active user ID for cloud synchronization
  setUserId(uid) {
    this.currentUserId = uid;
  }

  getFirestore() {
    return window.firestoreDb || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
  }

  getCurrentUid() {
    if (this.currentUserId) return this.currentUserId;
    if (window.firebaseAuth && window.firebaseAuth.currentUser) {
      return window.firebaseAuth.currentUser.uid;
    }
    return null;
  }

  // --- Cloud Sync Handlers ---
  async syncItemToCloud(storeName, item) {
    const fs = this.getFirestore();
    const uid = this.getCurrentUid();
    if (!fs || !uid || !item || !item.id) return;

    if (!['yarns', 'hooks', 'projects', 'yarn_types'].includes(storeName)) {
      return;
    }

    try {
      if (this.onSyncStatusChange) this.onSyncStatusChange('syncing');
      const cleanData = JSON.parse(JSON.stringify(item));
      cleanData._cloudUpdatedAt = new Date().toISOString();
      await fs.collection('users').doc(uid).collection(storeName).doc(item.id).set(cleanData, { merge: true });
      if (this.onSyncStatusChange) this.onSyncStatusChange('synced');
    } catch (err) {
      console.warn(`Firestore syncItem warning (${storeName}):`, err);
      if (this.onSyncStatusChange) this.onSyncStatusChange('offline');
    }
  }

  async deleteItemFromCloud(storeName, itemId) {
    const fs = this.getFirestore();
    const uid = this.getCurrentUid();
    if (!fs || !uid || !itemId) return;

    if (!['yarns', 'hooks', 'projects', 'yarn_types'].includes(storeName)) {
      return;
    }

    try {
      if (this.onSyncStatusChange) this.onSyncStatusChange('syncing');
      await fs.collection('users').doc(uid).collection(storeName).doc(itemId).delete();
      if (this.onSyncStatusChange) this.onSyncStatusChange('synced');
    } catch (err) {
      console.warn(`Firestore deleteItem warning (${storeName}):`, err);
    }
  }

  // Pull all user cloud data down into local IndexedDB
  async pullAllFromCloud(userId) {
    const uid = userId || this.getCurrentUid();
    const fs = this.getFirestore();
    if (!fs || !uid) return false;

    console.log(`☁️ Pulling user cloud data for:`, uid);
    if (this.onSyncStatusChange) this.onSyncStatusChange('syncing');

    const collections = ['yarn_types', 'yarns', 'hooks', 'projects'];
    let pulledCount = 0;

    for (const col of collections) {
      try {
        const snap = await fs.collection('users').doc(uid).collection(col).get();
        if (!snap.empty) {
          for (const doc of snap.docs) {
            const data = doc.data();
            data.id = doc.id;
            await this.putLocalOnly(col, data);
            pulledCount++;
          }
        }
      } catch (err) {
        console.warn(`Error pulling collection ${col}:`, err);
      }
    }

    console.log(`☁️ Cloud pull complete! ${pulledCount} items synced down.`);
    if (this.onSyncStatusChange) this.onSyncStatusChange('synced');
    return true;
  }

  // Push all local items to cloud (e.g. after first-time Google sign-in)
  async pushAllToCloud(userId) {
    const uid = userId || this.getCurrentUid();
    const fs = this.getFirestore();
    if (!fs || !uid) return false;

    if (this.onSyncStatusChange) this.onSyncStatusChange('syncing');
    const collections = ['yarn_types', 'yarns', 'hooks', 'projects'];
    for (const col of collections) {
      const items = await this.getAll(col);
      for (const item of items) {
        await this.syncItemToCloud(col, item);
      }
    }
    if (this.onSyncStatusChange) this.onSyncStatusChange('synced');
    return true;
  }

  // Pre-seed default English categories, crochet hooks with images, and demo projects
  async seedDefaultsIfNeeded() {
    const types = await this.getAll('yarn_types');
    if (types.length === 0) {
      const defaultTypes = [
        { id: 'yt_1', name: '5-Ply Milk Cotton', icon: '🧶' },
        { id: 'yt_2', name: 'Chenille / Velvet Chunky', icon: '🧸' },
        { id: 'yt_3', name: 'Pure Wool & Blends', icon: '🐑' },
        { id: 'yt_4', name: 'Lace Cotton Thread', icon: '🪡' },
        { id: 'yt_5', name: 'Combed Cotton', icon: '🌱' },
        { id: 'yt_6', name: 'T-Shirt & Ribbon Yarn', icon: '👜' },
        { id: 'yt_7', name: 'Fluffy Mohair', icon: '✨' },
        { id: 'yt_8', name: 'Soft Acrylic', icon: '🧵' }
      ];
      for (const t of defaultTypes) {
        await this.putLocalOnly('yarn_types', t);
      }
    }

    const hooks = await this.getAll('hooks');
    if (hooks.length === 0) {
      const defaultHooks = [
        { id: 'hk_1', size: '2.0mm', name: 'Ergonomic Soft Grip', brand: 'Standard', image: '', notes: 'Perfect for lace & amigurumi micro details' },
        { id: 'hk_2', size: '2.5mm', name: 'Tulip Etimo Rose', brand: 'Tulip Japan', image: '', notes: 'Silky smooth glide for 4-ply yarn' },
        { id: 'hk_3', size: '3.0mm', name: 'Clover Amour Soft Touch', brand: 'Clover', image: '', notes: 'My go-to hook for 5-ply milk cotton' },
        { id: 'hk_4', size: '3.5mm', name: 'Warm Bamboo Handle', brand: 'Bamboo Craft', image: '', notes: 'Lightweight and warm in hands' },
        { id: 'hk_5', size: '4.0mm', name: 'Clover Amour Mint', brand: 'Clover', image: '', notes: 'Great for chunky sweaters and scarves' },
        { id: 'hk_6', size: '5.0mm', name: 'Chenille Velvet Large Hook', brand: 'Ergonomic', image: '', notes: 'Ideal for plushies and velvet blankets' }
      ];
      for (const h of defaultHooks) {
        await this.putLocalOnly('hooks', h);
      }
    }

    const yarns = await this.getAll('yarns');
    if (yarns.length === 0) {
      const starterYarns = [
        {
          id: 'yarn_demo_1',
          name: 'Pastel Mint 5-Ply Milk Cotton (#23)',
          typeId: 'yt_1',
          typeName: '5-Ply Milk Cotton',
          amount: 4,
          colorNotes: 'Dye Lot: 2026-A, 50g / skein, super soft',
          image: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'yarn_demo_2',
          name: 'Warm Cream Natural Wool Blend',
          typeId: 'yt_3',
          typeName: 'Pure Wool & Blends',
          amount: 3,
          colorNotes: 'Cozy off-white cream, zero scratchiness',
          image: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: 'yarn_demo_3',
          name: 'Marshmallow Pink Chenille Velvet',
          typeId: 'yt_2',
          typeName: 'Chenille / Velvet Chunky',
          amount: 2,
          colorNotes: 'Ultra plush velvet yarn for amigurumi',
          image: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
      for (const y of starterYarns) {
        await this.putLocalOnly('yarns', y);
      }
    }

    const projects = await this.getAll('projects');
    if (projects.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      const starterProject = {
        id: 'proj_demo_1',
        name: 'Mint Dinosaur Plushie 🦕',
        image: '',
        hookId: 'hk_3',
        hookName: '3.0mm - Clover Amour',
        yarnIds: ['yarn_demo_1'],
        yarnNames: 'Pastel Mint 5-Ply Milk Cotton',
        progress: 65,
        startDate: today,
        completedDate: null,
        status: 'in_progress',
        notes: 'Head and body finished! R24 increase complete. Next: crochet little spines and feet.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this.putLocalOnly('projects', starterProject);
    }
  }

  // Generic DB helpers
  async get(storeName, key) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAll(storeName) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // Put item locally into IndexedDB AND sync to Firestore in background
  async put(storeName, value) {
    const db = await this.init();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Cloud sync in background
    if (['yarns', 'hooks', 'projects', 'yarn_types'].includes(storeName)) {
      this.syncItemToCloud(storeName, value).catch(e => console.warn('Background sync failed:', e));
    }

    return result;
  }

  // Put locally without triggering cloud sync
  async putLocalOnly(storeName, value) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName, key) {
    const db = await this.init();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });

    // Delete from cloud in background
    if (['yarns', 'hooks', 'projects', 'yarn_types'].includes(storeName)) {
      this.deleteItemFromCloud(storeName, key).catch(e => console.warn('Background delete failed:', e));
    }

    return result;
  }

  // --- Auth Session Methods ---
  async getCurrentSession() {
    const session = await this.get('sessions', 'active_user');
    return session ? session.user : null;
  }

  async setCurrentSession(user) {
    if (user && (user.uid || user.id)) {
      this.setUserId(user.uid || user.id);
    }
    return this.putLocalOnly('sessions', { key: 'active_user', user });
  }

  async clearSession() {
    this.currentUserId = null;
    return this.delete('sessions', 'active_user');
  }

  async getUserByEmail(email) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('users', 'readonly');
      const store = tx.objectStore('users');
      const index = store.index('email');
      const req = index.get(email.toLowerCase().trim());
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Settings ---
  async getSetting(key) {
    const item = await this.get('settings', key);
    return item ? item.value : null;
  }

  async setSetting(key, value) {
    return this.putLocalOnly('settings', { key, value });
  }

  // --- Yarn Methods ---
  async getYarns(filterTypeId = null) {
    const yarns = await this.getAll('yarns');
    if (!filterTypeId || filterTypeId === 'ALL') {
      return yarns;
    }
    return yarns.filter(y => y.typeId === filterTypeId);
  }

  async adjustYarnAmount(yarnId, delta) {
    const yarn = await this.get('yarns', yarnId);
    if (!yarn) return null;
    yarn.amount = Math.max(0, (yarn.amount || 0) + delta);
    yarn.updatedAt = new Date().toISOString();
    await this.put('yarns', yarn);
    return yarn;
  }

  // --- Projects Methods ---
  async getProjects(statusFilter = 'in_progress') {
    const projects = await this.getAll('projects');
    projects.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

    if (statusFilter === 'ALL') {
      return projects;
    }
    return projects.filter(p => p.status === statusFilter);
  }

  async updateProjectProgress(projectId, newProgress) {
    const project = await this.get('projects', projectId);
    if (!project) return null;
    
    project.progress = Math.min(100, Math.max(0, Math.round(newProgress)));
    if (project.progress === 100 && project.status !== 'completed') {
      project.status = 'completed';
      project.completedDate = new Date().toISOString().split('T')[0];
    } else if (project.progress < 100 && project.status === 'completed') {
      project.status = 'in_progress';
      project.completedDate = null;
    }
    project.updatedAt = new Date().toISOString();
    await this.put('projects', project);
    return project;
  }

  // --- Full Backup & Export/Import ---
  async exportFullBackup() {
    const backup = {
      app: 'YarnCraftCompanion',
      version: 2,
      exportedAt: new Date().toISOString(),
      yarn_types: await this.getAll('yarn_types'),
      yarns: await this.getAll('yarns'),
      hooks: await this.getAll('hooks'),
      projects: await this.getAll('projects'),
      settings: await this.getAll('settings')
    };
    return JSON.stringify(backup, null, 2);
  }

  async importFullBackup(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.app && !data.yarns && !data.projects) {
      throw new Error('Invalid backup file format');
    }

    if (data.yarn_types && Array.isArray(data.yarn_types)) {
      for (const item of data.yarn_types) await this.put('yarn_types', item);
    }
    if (data.yarns && Array.isArray(data.yarns)) {
      for (const item of data.yarns) await this.put('yarns', item);
    }
    if (data.hooks && Array.isArray(data.hooks)) {
      for (const item of data.hooks) await this.put('hooks', item);
    }
    if (data.projects && Array.isArray(data.projects)) {
      for (const item of data.projects) await this.put('projects', item);
    }
    if (data.settings && Array.isArray(data.settings)) {
      for (const item of data.settings) await this.put('settings', item);
    }
    return true;
  }
}

// Global DB instance
window.yarnDB = new YarnDatabase();
