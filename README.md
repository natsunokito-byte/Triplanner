# Trip Planner

Next.js 16 + Supabase. 規格見 `SPEC.md`，設計系統見 `DESIGN.md`。

## 開始

1. 建立 Supabase project，在 SQL Editor 執行 `supabase/schema.sql`（含照片用的私有 Storage bucket `trip-photos` 與權限）。
2. Supabase → Authentication → URL Configuration：Site URL 設為 `http://localhost:3000`，Redirect URLs 加入 `http://localhost:3000/auth/callback`。
3. `cp .env.example .env.local` 並填入 URL / anon key。
4. `npm install && npm run dev`，開 http://localhost:3000，用 email 登入（magic link）。

## 進度
- ✅ M0 骨架：Next.js、Supabase auth、next-intl（繁中/EN）、design tokens
- ✅ M1：Welcome（開啟上次旅行／建立新旅行）、Trip CRUD、目的地搜尋自動帶入時區與幣別、分享設定、People 管理
- ✅ M2：Hotel CRUD、橫向住宿時間軸（缺口夜晚標紅、重疊住宿自動分行）、未訂房自動產生「訂房」待辦
- ✅ M3：Plan CRUD（9 種類型、Cosplay 角色與檢查清單、三級可見度、30 分最短時長）、每日欄堆疊、拖曳換日、時間重疊提示
- ✅ M4：Commute（相鄰行程間的交通 chip、起點/終點、Google Routes 預估、付款方式、選購票自動產生待辦；無最短時長）
- ✅ M5：行程完成勾選（卡片上一鍵、編輯頁也可）＋ 完成後上傳照片（壓縮至長邊 1600px、每個行程最多 12 張、私有 Storage + signed URL）
- ✅ M6：匯率（fawazahmed0 主要、Frankfurter 備援，每日 cron）、行程完成時凍結「完成當天匯率」、主頁 TWD/USD 切換、當日小計、表單即時 ≈USD、trip 固定匯率
- ✅ M7：Dashboard（待辦依類別分組可勾選／花費依 住宿・交通・行程類型 的長條排行／聚會時間計分板可依行程類型篩選／TWD↔USD 切換／每張圖附表格檢視）
- ✅ M8：Viewer（`/v/[token]` email 6 位數驗證碼、7 天簽章 cookie、受邀者只看自己的行程／指定者看全部、私人行程與費用後端過濾、照片 signed URL、純函式權限測試 16 項）

- ✅ M9：邀請（複製邀請文字，中／英可切換、可指名收件人；下載或複製 `.ics` 連結 `/api/ics/{token}`，不含費用與人員；私人行程不可邀請）。依需求不做 mailto。
- ✅ M10：匯出圖片（儀表板圖：可勾選區塊＋4 種主題；單一行程報告圖：可選參與者／備註／費用／照片；旅行報告頁 `/t/[id]/report`：已完成行程依日期排列＋照片，可選是否含私人行程）。浮水印＝旅行名稱＋日期，標題字體 Zen Maru Gothic，2x 解析度 PNG。
- ✅ M11：手機版（看板改為滑動切換日期、卡片下方「移到」選單取代拖曳、頁首按鈕換行）、全域錯誤頁與 404、儲存失敗提示、無住宿空狀態、中英文案 key／placeholder 一致性測試（25 項測試）。
- ✅ M12：「找我約」——空檔演算法（trip 時區、緩衝、最少提前、≥30 分；跨日／夏令時間／緩衝合併測試）、公開空檔頁 `/a/[token]`（只顯示空檔）、已驗證檢視者的「找我約」分頁、請求者 email OTP（任何 email）＋Turnstile、每 email 每日 5 筆／待處理 3 筆／7 天自動過期、收件匣 `/t/[id]/requests`（接受時重新檢查衝突、自動建立行程與 people、寄信通知）、設定（開關／公開／時段／緩衝／手動不可約時段／重產連結／封鎖 email）。
## 上線前
請照 `LAUNCH_CHECKLIST.md` 逐項檢查。

## 注意
- ✅ M13：行程時長改以「小時」輸入（0.5 小時一格）；複製行程；建立／編輯行程時可直接加待辦；費用改為「品項＋金額」自動加總（品項可標「每小時計費」＝單價×行程小時數）；Cosplay 攝影新增攝影師／攝影師費用／攝影棚費用（總費用＝兩項費用＋其他品項）；新行程類型「任務」（不計入聚會計分板）；新頁面 `/t/[id]/todos`（未完成／已完成分頁、自訂分類）。
- ✅ M14：行程小卡顯示攝影師／攝影棚名稱；新頁面「行程一覽」`/t/[id]/plans`（可複選類型篩選）；可建立「未排日期」行程（主頁最下方折疊區與行程一覽皆可建立，可用選單排到某天）；主頁改為「行程在上、住宿在下」，兩者橫向捲動依「天」連動。未排日期的行程不佔「找我約」時段、不給檢視者看、不能邀請／匯出行事曆。
- **M14 需要資料庫 migration：** 在 M13 之後執行 `supabase/migrations/003_m14.sql`（`plans.start_at` 改成可為空、新增 `studio_name`）。
- **M13 需要資料庫 migration：** 若你已跑過舊版 schema，請到 Supabase SQL Editor 執行 `supabase/migrations/002_m13.sql`（只跑一次；全新資料庫直接跑 `schema.sql` 即可）。
- M12 新增兩個欄位（`trips.availability_blocked_emails`、`viewer_otps.purpose`），已寫進 `supabase/schema.sql`；若你已經跑過舊版 schema，請手動 `alter table`。
- 「找我約」另需 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`／`TURNSTILE_SECRET`（正式環境沒設 secret 會拒絕所有請求者驗證）。空檔頁沒有 IP rate limit，建議在主機平台（Netlify Rate limiting）對 `/a/*` 設限。
- Next.js 16：middleware 改名為 `src/proxy.ts`；寫程式前請看 `node_modules/next/dist/docs/`。
- 目的地搜尋走伺服器端 `/api/destination`：Google Places (New) 自動完成＋Place Details＋Time Zone API（需要 `GOOGLE_MAPS_SERVER_KEY`，並啟用這三項）。語言用 zh-TW（繁體），國家名稱由 ISO 代碼經 Unicode CLDR 產生，台灣一律顯示為國家「台灣」。沒設金鑰時可直接輸入名稱按 Enter 新增。國家→幣別對照表在 `src/lib/geo.ts`，未收錄的國家預設 USD，可手動改。
- 專案原則：不使用註冊在中國的服務，也不使用輸出簡體中文的服務。
- Viewer 需設定 `SUPABASE_SERVICE_ROLE_KEY`、`VIEWER_COOKIE_SECRET`（≥32 字元）、`RESEND_API_KEY`、`RESEND_FROM`；開發環境未設 Resend 時，驗證碼會印在 server console。

## 匯率（M6）
- `SUPABASE_SERVICE_ROLE_KEY`：只在伺服器使用，用來寫入 `fx_rates`（沒設也能運作，只是不會把匯率存進資料庫）。
- `CRON_SECRET`：`netlify/functions/fx-cron.mts` 每日 03:15 UTC 呼叫 `/api/cron/fx` 並帶 `Authorization: Bearer $CRON_SECRET`；在 Netlify 設同名環境變數。
- 匯率來源為免 key 的公開服務：主要 fawazahmed0/currency-api（含 TWD，歷史自 2024-03-02），備援 Frankfurter（ECB，不含 TWD）。

## Google Maps（M4 才需要）
需要兩把 key：
- `GOOGLE_MAPS_SERVER_KEY`：後端呼叫 Routes API，只啟用 Routes API，並設 API restriction。
- `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`：瀏覽器端 Places Autocomplete (New)，只啟用 Places API (New)，並設 HTTP referrer 限制。
