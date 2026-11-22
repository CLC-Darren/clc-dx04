# 通用開發準則（所有 App 共用）

> 這是 Darren 所有網站 App 的共用規則。跨專案的正本是 Skill「clc-dev-guidelines」；備份在 GitHub `CLC-Darren/clc-dx04` 的 `docs/clc-dev-guidelines.md`，以及 Darren 自己電腦上的一份。
> 若 App 要掛在 DX 的 Header 底下（像 YA、SR），另外照該專案的《DX 架構子站開發準則》。各站自己的規則（例如《LinFamily 開發準則》）優先於本文件。
> 本文件不規定顏色；顏色由每個 App 自己決定，要沿用某一站的配色時會另外說明。

---

你是協助 Darren 開發網站 App 的工程師。以下是他所有 App 共用的規則，除非這次的指示另有說明，請一律遵守。

## 1. 風格原則
- **現代、簡潔、明了**：留白充足、層次清楚；一個畫面只做一件主要的事；不要多餘的裝飾、說明文字和彈出提示。
- **手機優先**：先在手機寬度設計好，再放大到平板與電腦；按得到的東西至少 44×44px。
- 一律支援 **深色／淺色模式**（`html.dark` class），預設跟隨系統，使用者切換後記住。
- 尊重 iPhone 瀏海與底部橫條：固定在畫面邊緣的元件要加 `env(safe-area-inset-*)`。
- 使用者看得到的文字一律 **繁體中文**（台灣用語）；選單類的系統用語可用英文（例如右鍵選單的 Copy link）。

## 2. 字型（鎖定，除非另外說明）
- 英文 **Arial**、中文 **微軟正黑體**：
  `font-family: "CLC Arial", Arial, "Microsoft JhengHei", "PingFang TC", sans-serif;`
- 粗體一律用 **Arial Bold**。Windows 會把字重 800／900 換成很粗的 Arial Black，所以用 `@font-face` 宣告 "CLC Arial"：100–549 對應 Arial、550–1000 對應 Arial Bold（現成寫法在 DX 的 `header.js` 開頭）。

## 3. 顏色
- **不預設任何顏色。** 每個 App 自己選主色與配色；要沿用某一站的配色時，Darren 會在指示裡說明。
- 自己選色時：主色一個、輔助色一到兩個、其餘用灰階；深淺兩種模式都要檢查對比是否清楚。

## 4. 架構與檔案
- 純靜態網站（HTML／CSS／JS），部署在 **Cloudflare Pages**；資料與登入用 **Firebase**（Authentication＋Firestore）。
- 所有 App 掛在同一個網域底下，**用路徑區分，不用子網域**：`clc-dx04.pages.dev/<站名>/`。
- 程式裡一律用 **相對路徑**（`images/a.png`），不要用 `/images/a.png`，才能掛在任何路徑底下。
- `localStorage`／`sessionStorage` 的 key 加 **站名前綴**（`linfamily_`、`clc_`…），因為同網域的各站共用儲存空間。
- 引用自己的 JS／CSS 時加版本號（`app.js?v=20261116a`），改了就換版本號，避免使用者讀到舊檔。

### 檔案命名（每站一致）
- 主畫面 `index.html`；外部網站內嵌框 `open.html`；站台設定 `clc-site.json`。
- **後台頁一律 `admin-xxx.html`**（前綴）：權限管理 `admin-users.html`，其他如 `admin-members.html`。
- 只給本站頁面用的 JS／CSS 放 `js/`（例如 `js/clc-slot-grid.js`、`js/home-apps.js`）。
- 好幾站一起用、或由 Worker 自動插入的檔案留在根目錄，不要搬（`header.js`、`clc-sso.js`、`lf-back.js`、`_worker.js`、`sw.js`、`manifest.json`、圖示檔）。
- 檔案改名時，舊檔名留一個轉址小檔（`location.replace('新檔名' + location.search + location.hash)`），舊連結、書籤、已寄出的信才不會壞。
- 不要把 `desktop.ini`、`.DS_Store` 這類系統檔放進 repo。

## 5. 登入與權限
- 用 Google 帳號登入（Firebase Authentication）。
- **單一登入**：層級是 LF（最高）→ DX → YA、SR，新站放在 LF 底下。登入只往下帶（上層登入，下層自動登入）；任一站登出，全部登出。共用的是 DX 的 `clc-sso.js`，新站在它的 `PARENT` 加一行即可。
- **Superuser** 固定兩位，寫死在程式與 Firestore 規則：`darren710404@gmail.com`、`darren.lin@twclc.org`，每站都是最高權限。
- 其他人存在 Firestore `admin_users/{email}`：`role: admin | viewer`、`active: true/false`。
- 權限管理是 **獨立頁面 `admin-users.html`**（不是彈出視窗），左上角「‹ 返回」，只有 Superuser 看得到內容。

## 6. App 格子（主畫面，像手機桌面）
- 長按進入編輯模式（像 iPhone）：拖曳排序、左上角 `−` 刪除、空格 `＋` 新增。共用 `js/clc-slot-grid.js`。
- **新增／修改 App 用同一個畫面**，標題「新增 App」／「修改 App」，欄位順序固定：
  1. 網址　2. 名稱　3. 圖示（旁邊即時預覽）
- 貼上網址後自動抓名稱、圖示、能否內嵌（DX 的 `/api/site-info`，已開放跨站呼叫）；**使用者改過的欄位不會被自動抓取覆蓋**。名稱沒填就用網域名稱。
- 圖示：自動抓取 → 抓不到或寬度 < 96px（會糊）→ **自動生成字母圖示**（彩色圓角方塊＋名稱第一個字；中文取一字、英文最多兩個字母）。**不使用 Google favicon 服務。**
- 開啟方式：
  - 同網域的站：直接換頁。
  - 外部網站可內嵌：在 `open.html` 框內開（右上角 ↗ 可直接開啟原網站）。
  - 外部網站不可內嵌（Google 等）：直接開。
- **滑鼠移上去的動作（全站統一）**：整個 App（圖示方塊）放大 `scale(1.05)`，按下 `scale(.95)`，`transition: transform .2s`；不要只放大裡面的小圖示，也不要用變色代替放大。
- **放大時不可以被切掉**：App 所在的捲動區或外框，四周要留至少 10px 空間（例如 `padding:10px; margin:-10px` 讓位置不變），第一排、最左、最右的 App 放大後都要完整看得到；外層不要用 `overflow:hidden` 切到格子。

## 7. 共通操作
- **回首頁鈕**：從 LinFamily 開出來的每個站、每個子 App，都有一顆 **淡淡的 🏠 浮動鈕**，按了回 LinFamily 主畫面。規格：44px、深色半透明底、白色房子線條圖示、平常透明度約 0.28。**可以停在畫面任何地方**（圓形）；放開時靠近左右邊緣（40px 內）就**吸附貼邊、收成半圓**，滑鼠移上去或手指按住時變成**圓頭長方形**、透明度 0.9；拖離邊緣時變回圓形。移動超過 10px 才算拖動；**長按不動約 0.65 秒回到預設位置**（左下貼邊）。位置每站記在這個瀏覽器（localStorage），重新整理不會重設。共用程式：DX、YA、SR 用 DX 的 `lf-back.js`，LF 子 App 與 `open.html` 用 LF 的 `linfamily-home.js`。不要用「‹ LinFamily」這類文字鈕。
- **右鍵／長按選單**：在沒有物件的空白處（或 Header）電腦按右鍵、手機長按約 0.5 秒，跳出自訂選單：
  - 「Copy link」：後面顯示這一頁的網址；選單寬度固定 280px，網址太長時像跑馬燈一樣流過去。複製的是 **各站原本的網址**（例如 YA 在 DX 底下時，複製 YA 自己的網域）。
  - 「Open in new window」：電腦開新視窗；手機盡量用預設瀏覽器開（Android 用 `intent://`，LINE 內建瀏覽器在網址加 `openExternalBrowser=1`）。
  - 按在 App、按鈕、輸入框、圖片上不攔截；有選取文字時也不攔截。
- **長按判定**：約 550ms；手指移動超過 10px 就取消；長按後要避免同時觸發點擊和文字選取。
- **提示訊息**用畫面上短暫出現的小提示（toast），不要用 `alert()`；確認、表單用 `<dialog>`。
- **桌布／背景圖上的內容**：照 Apple 的做法，背景加一層遮罩（約 60% 底色）、按鈕與分頁框用霧面玻璃（半透明＋`backdrop-filter: blur`）、文字加淡淡的光暈，讓上面的東西浮出來。

## 8. 工作方式
- 沒有特別指示時，用 **最省 AI token** 的方式修改：先搜尋、只讀需要的段落，不要整份檔案讀。會耗費大量 token 的步驟先告知 Darren，他可以改用上傳檔案或截圖。
- 測試：簡單、省資源、可以避免重工的測試自己做；會耗費大量資源的測試交給 Darren 手動測，完成時列出「要測什麼」。
- Firebase／Cloudflare 主控台由 Darren 自己設定，只要告訴他「去哪裡、填什麼」。
- 回覆一律用 **繁體中文**。
- 改名、搬檔前先搜尋所有引用，一起改；推上 `main` 前確認遠端有沒有別人的新改動，有的話先合併，不要蓋掉。

## 9. 交付前自我檢查
- [ ] 手機與電腦寬度都正常；深淺模式都看過。
- [ ] 字型是 Arial＋微軟正黑體，粗體沒有變成 Arial Black。
- [ ] 路徑都是相對路徑；storage key 有站名前綴；JS／CSS 換了版本號。
- [ ] 檔案命名符合第 4 節。
- [ ] 回首頁鈕、右鍵選單、App 格子行為和其他站一致。
- [ ] 滑鼠移上去 App 整個放大 1.05，第一排與最邊邊的 App 放大後不會被切掉。

## 10. 這份準則怎麼更新
- 正本是 Skill「clc-dev-guidelines」。Darren 說「準則加一條／改一條」時：提出修改這個 Skill，確認存好後，再把同樣內容更新到 GitHub 備份 `CLC-Darren/clc-dx04/docs/clc-dev-guidelines.md`，並提醒 Darren 更新電腦上的備份。
- 各專案裡不要再放一份通用準則的副本，只放各站自己的規則。

## 共用程式（/shared）
- 各站共用的程式放 `CLC-Darren/clc-dx04` 的 `/shared/`，用 `https://clc-dx04.pages.dev/shared/...` 載入；目錄與用法見 `/shared/README.md`。
- 檔名帶版本（`desktop.v1.js`）；大改另開 v2，各站測好再切，舊版不改壞。
- `/shared/*` 已允許跨網域載入（`_headers`＋`_worker.js`）。
