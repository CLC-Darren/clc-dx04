# ⚠️ 重要文件・請勿刪除 ⚠️

> **這份 README 是 CLC 所有網站的「總說明書」：架構、使用的平台、各平台用哪個帳號、重要設定與注意事項都記在這裡。**
> **請勿刪除本檔案或本 repository。** 修改網站架構、更換帳號或新增站台時，請同步更新本檔。
>
> 🔒 本 repository 目前是 **公開（public）**。這裡只記錄「用哪個平台、哪個帳號、設定項目的名稱」，
> **絕對不要把密碼、Token、API Key、金鑰的「值」寫進來。** 建議到 GitHub → Settings → 把本 repo 改為 Private。

最後更新：2026-11-12

---

## 1. 帳號分工（最重要）

| 平台 | 使用帳號 | 用途 |
|---|---|---|
| **GitHub**（帳號／組織 `CLC-Darren`） | `darren.lin@twclc.org`（教會 Workspace） | 所有網站的原始碼 |
| **Cloudflare**（Pages 網站託管） | `darren.lin@twclc.org`（教會 Workspace） | 所有網站的託管、`_worker.js` 後端、環境變數 |
| **Firebase**（登入＋Firestore 資料庫） | `darren710404@gmail.com`（個人 Gmail） | 各站資料庫、Google 登入 |
| **Google Apps Script**（CLC 寄信中心） | `darren710404@gmail.com`（個人 Gmail） | 所有站的寄信：YA 測試信、每日／每週摘要；SR 新朋友通知 |
| Resend（Christmas 寄信） | 依 Christmas 站設定 | CLC Christmas 通知信 |

**為什麼 Firebase／Apps Script 用個人帳號：** Darren 沒有 `twclc.org` 網域的管理員權限，教會 Workspace 可能限制建立 Google Cloud／Firebase 專案、授權外部 App 或 Apps Script 連外，自己無法解除。
**Apps Script 必須和 Firebase 同一個帳號**（它用帳號本身的權限讀寫 Firestore），所以也放在個人帳號。

**Superuser（固定最高權限）：** `darren710404@gmail.com`、`darren.lin@twclc.org`
（寫在各站 `header.js` 的 `ADMIN_WHITELIST` 與 `firestore.rules`；其他管理員存在各站 Firestore `admin_users/{email}`，角色為 admin／viewer）

---

## 2. 網站一覽

| 站台 | GitHub repo | 可見度 | Cloudflare Pages 網址 | Firebase 專案 | 說明 |
|---|---|---|---|---|---|
| **CLC DX04**（總控台） | `CLC-Darren/clc-dx04` | public | `https://clc-dx04.pages.dev` | `clc-dx04` | 所有分站的統一入口；`/ya/*`、`/sr/*` 轉送到分站 |
| **CLC YA**（主站） | `CLC-Darren/clc-ya-portal` | private | `https://clc-ya-portal.pages.dev`（DX04 下為 `/ya/`） | `clc-ya-portal` | 場地登記、權限管理、**歌詞系統（共用）**、首頁影片 |
| **CLC SR** | `CLC-Darren/clc-sr-portal` | public | `https://clc-sr-portal.pages.dev`（DX04 下為 `/sr/`） | `clc-sr-portal` | 組員通訊錄、名單後台、新朋友登記；歌詞頁以 iframe 嵌入 YA |
| **CLC Christmas** | `CLC-Darren/2026clc-christmas` | 依 GitHub 設定 | Cloudflare Pages（見該 repo README） | `clc-christmas` | 2026 聖誕季；寄信用 Resend |
| 素材站 | `CLC-Darren/clc-assets` | 依 GitHub 設定 | 獨立 Pages 專案 | — | YA 首頁背景影片 `videos/*.mp4` |

**各站獨立：** repo、Firebase 專案、業務資料彼此分開。SR 的歌詞功能直接使用 YA 的歌詞系統（YA 改了 SR 自動跟著變）。

**共通規則（所有現有及未來站台）：**
- Header 位置與樣式必須和 YA 首頁 Header 完全一致，切換站台時不能跳動。
- 站台切換選單只有 Superuser 看得到；手機、電腦、安裝版 App 都在同一視窗切換，不開新分頁。
- 三站使用同一份 `CLC_SITES` 清單（在各站 `header.js`），**新增站台時每一站都要加同一筆**，DX04 的 `_worker.js` 的 `SITES` 也要加。

---

## 3. 部署方式

- **Cloudflare Pages ↔ GitHub 自動部署：** push 到 `main` 分支 → Cloudflare 自動部署正式站（約 1～2 分鐘）。
  - ⚠️ 如果同一個 commit 先推到別的分支、再合併進 main，Cloudflare 可能**只建分支預覽、沒有重新部署正式站**。遇到「GitHub 顯示成功但網站還是舊的」，再推一個新的 commit（可以是空 commit）即可。
- 各站沒有 build 步驟（Build command 留空或 `exit 0`，Output directory 為 `/`）。後端 API 在各站的 `_worker.js`（Pages Advanced mode）。
- **Firestore 規則不會自動部署！** 每個 repo 的 `firestore.rules` 只是存檔，改完必須到 **Firebase Console → Firestore → 規則** 手動貼上並按「發布」。網站出現「權限不足／permission-denied」時，第一個要檢查的就是線上規則是否為最新版。
- Firebase 目前是免費 **Spark 方案**：**Cloud Functions 不會執行**（需付費 Blaze）。YA repo 的 `functions/` 是舊設計，目前沒有在跑。

---

## 4. 環境變數／Secret（只記名稱，值存在 Cloudflare，不可外流）

**CLC YA（Cloudflare Pages → clc-ya-portal → Settings → Variables and Secrets）**
- `GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_BRANCH`：後台上傳檔案用
- `GITHUB_ASSETS_TOKEN`：首頁影片上傳到 `clc-assets`（fine-grained，只授權 clc-assets）
- `HOME_VIDEO_ASSETS_ORIGIN`：素材站網址
- `GITHUB_VIDEO_TOKEN`：舊影片上傳用（新流程確認後要移除並撤銷）
- `HYMN_LIBRARY`（KV，選用）

**CLC SR：** `GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_BRANCH`、`GITHUB_VIDEO_TOKEN`
**CLC Christmas：** `FIREBASE_PROJECT_ID`、`FIREBASE_WEB_API_KEY`、`RESEND_API_KEY`、`RESEND_FROM`

> Firebase 的「Web Config」（apiKey、projectId…）寫在各站前端是正常的，不算機密；真正要保護的是上面的 Token／API Key。

---

## 5a. CLC DX04 資料（Firestore `clc-dx04`）

| Collection | 內容 |
|---|---|
| `admin_users/{email}` | 管理員名單（admin／viewer） |
| `dx04_settings/apps` | 首頁「分站入口」清單（`items`：名稱、網址、Logo）。管理員在首頁長按「＋」新增、長按 Logo 編輯／移除；YA、SR 以外的網站在 `app.html`（DX04 Header 底下）開啟 |

## 5. CLC YA 重要資料（Firestore `clc-ya-portal`）

| Collection | 內容 |
|---|---|
| `admin_users/{email}` | 管理員名單（admin／viewer、是否收每日摘要 `notifyReview`） |
| `system_config/*` | 系統設定、首頁外觀 `home_appearance` |
| `venue_bookings/*` | 小組場地登記 |
| `mail_jobs/*` | 寄信佇列（測試信），由 Apps Script 處理 |
| `system_mail_jobs/*` | 每日摘要寄送紀錄／鎖 |
| `hymn_songs/{id}` + `revisions` | **全部歌詞**（2026-11-11 起靜態 Word 歌詞庫已全部搬入並停用）＋修改紀錄 |
| `hymn_meta/index` | 前台搜尋用的歌名索引（不含歌詞）。不一致時：歌詞管理 → ⚙️ → 🛠️ 重建搜尋索引（不會改動歌曲） |
| `hymn_layouts/{歌曲ID}` | 管理員「存為預設排版」：A4／A3／A3 多拼的段落與字級 |
| `hymn_submissions/*` | 使用者自行新增、列印／下載時送審的歌詞（後台「📥 待審核」） |
| `hymn_sources/*` | 歌詞搜尋外部來源設定 |

**歌詞系統要點**
- 搜尋第 1 順位是教會歌詞庫（Firestore），之後是台灣聖經網、讚美之泉（Worker 內建解析器）。後台新增的來源只會「開連結」，不會自動抓歌詞。
- 舊的靜態歌詞檔（Word ZIP、catalog.json）已從網站移除，必要時可從 YA repo 的 Git 歷史還原。`lyrics-db/pinyin-map.json`（同音字搜尋）與 `lyrics-db/auto-labels.json`（段落自動標記建議）仍在使用，請勿刪除。
- PPT 背景圖庫：YA repo 的 `ppt-backgrounds/`（`index.json` 加一行即可新增背景）。

---

## 6. CLC 寄信中心（Google Apps Script，所有站共用一份）

- 程式碼存在本 repo：`docs/apps-script/Code.gs`、`appsscript.json`（YA、SR 原本各自的程式已合併到這裡）。
- 安裝在 **`darren710404@gmail.com`** 的 Apps Script（所有站的 Firebase 專案都在這個帳號）：貼上程式 → 執行 `setup()` 授權 → 自動建立排程。
- 排程：每 5 分鐘（YA 測試信、SR 新朋友通知）、每天 09:00（YA 審核摘要）、每週二 09:00（YA 使用者排版修改建議）。
- 網頁應用程式：部署 → 網頁應用程式（執行身分「我」、存取權「任何人」），給信裡「直接存為預設」使用；連結有簽章，點開後要再按一次確認。
- **各站的寄信規則都在各站網站後台設定**（存在各站 Firestore），例如 YA 權限管理的「接收每日審核摘要」、歌詞管理的「收集使用者的排版修改建議」、SR 名單後台的小組通知信箱。程式不用改。
- 新增站台的寄信功能：在 `SITES` 加一筆、寫 `站代號_功能` 函式，排進 `every5min`／`daily0900`／`weeklyTue0900`。
- 寄件人即該 Gmail；個人 Gmail 每日寄送上限約 100 位收件人（所有程式合計）。
- 只能保留**一份**在執行的寄信程式，否則會重複寄信（舊的 YA、SR 寄信專案要刪除觸發條件）。
- 寄信狀況檢查：Apps Script →「執行項目」看每次執行紀錄；Firestore `mail_jobs`（YA 測試信）`status` 為 pending＝還沒被處理、failed＝失敗（看 error）、sent＝已寄出。

---

## 7. 待處理／已知事項

- [ ] GitHub 曾對 `clc-sr-portal`、`2026clc-christmas` 發出「Possible valid secrets detected」警告：檢查是哪個檔案、撤銷外洩的金鑰並換新。
- [ ] 公開的 repo（`clc-dx04`、`clc-sr-portal`）考慮改為 Private。
- [ ] 安裝「CLC 寄信中心」（DX04 `docs/apps-script`），並刪除舊的 YA、SR 寄信 Apps Script 觸發條件，觀察一兩天後再刪舊專案。
- [ ] DX04 自己的 Firebase 專案 `clc-dx04` 是未來統一登入（SSO）的中心；SSO 排在 DX04 登入、轉送、路徑、切換選單、Header 統一之後。
- 開發原則：每次修改用最小改動；發現其他問題先討論再修。

---

## 8. 本 repo（DX04）檔案

- `index.html`：首頁與分站入口卡片
- `header.js`：共用 Header、站台切換選單（`CLC_SITES`）、登入與權限
- `_worker.js`：把 `/ya/*`、`/sr/*` 轉送到各分站（新增分站時在 `SITES` 加一筆）
- `admin-users.html`／`admin-users.js`：權限管理
- `firestore.rules`：DX04 的 Firestore 規則（需手動發布）
- `manifest.json`、`sw.js`、`favicon.svg`：PWA 安裝設定

部署：Cloudflare Pages 連接此 repo，Build command 留空，Output directory 為 `/`。
