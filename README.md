# YarnCraft Companion 🧶✨

A modern, responsive craft companion website designed for crocheters and knitters to manage their yarn stash, crochet hook collection, and in-progress projects with real-time visual progress bars.

---

## 🎨 Visual Design & Art Style
- **Color Palette**: Deep Forest Green (`#1A3311`), Fresh Lime Green (`#91E758`), Soft Cream canvas (`#F6F8F2`), and Crisp White 28px rounded cards (`rounded-card`).
- **Typography & Inputs**: Pill-shaped inputs and buttons with embedded vector icons, minimalist line-art illustrations, smooth animations.
- **Full Website Experience**: A clean, full-width responsive web layout with top navigation header, multi-column desktop grids, and mobile-friendly bottom navigation.

---

## ✨ Features Breakdown

### 1. Yarn Stash Management (线材管理)
- **Photo Capture & Upload**: Take photos using your phone's camera, laptop webcam snapshot, or file upload.
- **Smart Image Compression**: Automatically compresses high-resolution photos on canvas before storing in IndexedDB to keep the database fast and lightweight.
- **Instant Stepper Controls**: Rapidly increment or decrement quantities (`+` / `-`) directly on each yarn card.
- **Customizable Yarn Categories**:
  - Filter by category dropdown (5-Ply Milk Cotton, Chenille, Wool, Lace, Combed Cotton, etc.).
  - Default view without filters displays all yarns you own.
  - "Manage Yarn Types" modal lets you add, rename, or delete custom categories anytime.

### 2. Crochet Hook Collection (针具管理 - Now with Photo Support!)
- **Photo Capture for Hooks**: Take photos or upload images of your crochet hooks, ergonomic hook sets, or cases.
- **Hook Inventory**: Track sizes (e.g., 2.0mm, 2.5mm, 3.0mm, 4.0mm, etc.), brands (Clover Amour, Tulip Etimo, Bamboo), and notes.
- **Project Integration**: Select from your saved hooks when building or editing projects.

### 3. Projects Tracking (Ongoing & Completed WIPs)
- **Default View**: **Automatically displays uncompleted (in-progress) projects** first, keeping active work front and center.
- **Visual Progress Bar**: Animated Lime Green progress bar showing the exact percentage complete.
- **Quick Progress Steppers**: One-tap `+5%`, `+10%`, or `100% Completed` buttons.
- **Linked Hooks & Yarns**: Attach the specific hook and yarn used from your inventory.
- **Work Starting Day & Notes**: Date picker and pattern/row counter notes.
- **Filter Tabs**: Toggle between "In Progress ⏳" (default), "Completed Projects 🎉", and "All Projects".

### 4. Main Dashboard (Overview Showing Both)
- Top summary stats: Active WIPs, Total yarn skeins, Completed items, Hooks in kit.
- Prominently displays **both** ongoing projects (with progress bars) and your yarn stash inventory (with instant `+` and `-` quantity steppers).

### 5. Connecting Real Google Sign-In
The app is built with Google's official **Google Identity Services (GSI)** SDK.
To connect real Google accounts:
1. Go to the [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials) page (free).
2. Click **Create Credentials &rarr; OAuth client ID**.
3. Select **Web application**.
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8080`
   - `http://127.0.0.1:8080`
5. Copy your **Client ID** (e.g., `123456789-xxxx.apps.googleusercontent.com`).
6. In YarnCraft Companion, click **Profile / Settings &rarr; Connect to Real Google Account**, paste your Client ID, and click **Save Google Client ID**.
7. The official Google Sign-In button will appear on the login screen, allowing real Google authentication!
*(Note: If you don't have a Client ID yet, you can also use the instant Google Demo Login or Email Sign-in / Guest Mode).*

### 6. Persistent Local Database & JSON Backup
- Built-in browser **IndexedDB** database (`YarnCraftDB` v2) stores all your yarns, hooks, projects, photos, and accounts locally.
- **1-Click Export JSON**: Download a full backup file containing all your records and images.
- **1-Click Import JSON**: Restore your data on any computer or phone browser.

---

## 💻 Launching as a Standalone Application

YarnCraft runs as a **dedicated standalone desktop application window** (no browser address bar, no browser tabs, with clean window borders):

### Option 1: 1-Click Silent Desktop App Launcher (Best!)
- Double-click **`Launch_App.vbs`** in the folder.
- It launches the local server silently in the background and opens **YarnCraft as a pure standalone application window** with its own icon and window controls.

### Option 2: Batch Launcher
- Double-click **`Run_App.bat`**.
- It shows the local server status and opens the standalone application window.

### Option 3: Install to Phone / Desktop (PWA)
- When opened on your smartphone (or Chrome/Edge), tap **"Install App"** (or click the install prompt in Settings & Profile) to install YarnCraft directly onto your Windows Desktop or Phone Home Screen as an installed app!
