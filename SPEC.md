# Trip Planner — Dev Spec v2

旅行行程規劃 web app。Editor 只有一位（你），Viewer 為受邀者（需 email 驗證）。
相關檔案：`supabase/schema.sql`（資料庫）、`DESIGN.md`（設計系統）。

## 1. 已確認的決策

| 項目 | 決定 |
|---|---|
| 技術 | Next.js (App Router, TS) + Supabase (Auth / Postgres / Storage) + Tailwind + shadcn/ui |
| Editor | Supabase Auth email magic link，單一 owner |
| Viewer | 開連結 → 輸入 email → 6 碼 OTP 驗證。**沒驗證 = 什麼都看不到** |
| 邀請 | 三種：mailto、複製文字、複製/下載 .ics 連結 |
| 語言 | 繁中 + 英文（UI、邀請文字、匯出圖片都雙語） |
| 時區/幣別 | 由目的地自動帶入，可改；所有金額可切換顯示美金 |
| 設計 | 見 `DESIGN.md` |

## 2. Viewer 權限模型（隱私優先）

| 身分 | 條件 | 可看 |
|---|---|---|
| 未驗證 | 只有連結 | 只看到 email 驗證頁（含 trip 名稱以外的資訊都不顯示） |
| **受邀者 (restricted)** | email 在 `people` 名單 | **僅自己被列為 people 的 plan**，含這些 plan 的完成狀態與照片；不含金額、不含 hotel、不含他人的 commute |
| **全覽者 (full)** | `people.can_view_all = true`（少數指定） | 全部 plan、hotel 時間軸、commute、Dashboard、照片；金額依 `trips.viewers_see_costs` |

- email 不在名單 → 一律顯示「若此 email 受邀，驗證碼已寄出」，**不洩漏名單是否存在**，實際不寄信。
- OTP：6 碼、10 分鐘過期、5 次失敗鎖定、同 email 每小時最多 5 次；成功後發 7 天 httpOnly 簽章 cookie。
- Viewer **不碰 Supabase**：`/api/v/[token]/*` 在 server 用 service role 讀取，依身分過濾後回傳（過濾在 server，不是前端藏）。
- 受邀者的 Dashboard 只顯示「自己的 hangout 時間」與自己的 plan 完成進度。
- Owner 在 people 管理頁切換每人的 `can_view_all`。
- Storage `trip-photos` private；server 為有權限的 viewer 產生 1 小時 signed URL（受邀者只拿得到自己可見 plan 的照片）。

### 2.1 Plan 可見度（取代單純「私人」）
每個 plan 有 `visibility` 三選一：

| 值 | 誰看得到 | 邀請 |
|---|---|---|
| `normal` | 依 §2 規則（受邀者看自己的、全覽者看全部） | 可 |
| `participants_only` 「只給參與者」 | 只有你 + 該 plan 的參與者（驗證 email 後）。**全覽者若不在參與者名單中也看不到** | 可（參與者收到邀請，.ics 連結正常） |
| `owner_only` 「只有我」 | 只有你；任何 viewer 都看不到 | 不可（UI 禁用並說明） |

- 非 `normal` 的 plan 一律由 server 過濾：viewer Dashboard、hangout 計分板、匯出圖、trip report 只計入該 viewer 有權看的 plan。
- 非 `normal` 的 plan 都仍算「忙碌」，用於空檔計算（§2.2），不顯示細節。
- 從 `participants_only` 改成 `owner_only` 時，提示「已寄出的邀請與已分享的內容不會被收回」。
- Owner 自己永遠看得到全部，並有明顯的鎖頭／眼睛圖示標示可見度。

### 2.2 「找我約」模式（Make a plan）
**運作**：預設開啟（`availability_enabled = true`，可關）。Viewer 頁多一個「找我約」分頁，顯示每天的空閒時段條（只有「有空／忙碌」，不顯示原因與地點）。點空閒時段 → 選類型、時長（≥30 分）、地點、訊息 → **此時才要求 email 驗證** → 送出請求。Owner 在請求收件匣接受／婉拒／回覆，接受後自動建立 plan，requester 成為 people。

**誰能看空檔**（`trips.availability_public`）
- 關（預設）：需驗證 email 才能看「找我約」分頁（受邀者與全覽者皆可）。
- 開：**不用驗證**，持「空檔連結」(`/a/[availability_token]`，與檢視連結分開) 的人就能看空檔；此連結**只能**看空檔，看不到任何 plan 內容。驗證只發生在送出請求時。
- 任何人（不限 people 名單）驗證 email 後都可送出請求；你接受時他才會被加入 people。

**空閒時間計算**（server 端，viewer 只拿到結果）
- 可約窗口：每天 `avail_day_start`–`avail_day_end`（trip 時區）。
- 扣除：所有 plan（含 participants_only／owner_only、含未完成）、commute、`availability_blocks`、hotel 入退房時段、已核准請求；每段前後加 `avail_buffer_min`；過去與 `avail_min_notice_hours` 內不開放。
- **Plan 最短 30 分**：只有 ≥30 分的空閒段才會顯示、請求時長 ≥30。Commute 無最短時長（0 分也可）。
- 接受時重新驗證衝突；衝突則提示並標記請求。

**公開空檔的影響／需要的東西**
1. **隱私風險升高**：公開的空檔等於公開你「何時有空／何時不在」，連結外流＝任何人都能看。因此：連結可重新產生、可隨時關閉、只回傳空閒時段（不回傳忙碌原因、地點、人名）、不顯示精確到分鐘以外的資訊、可設定最遠可見天數（預設為旅行期間）。
2. **反濫用**（因為未驗證即可瀏覽、任何 email 可請求）：空檔 API rate limit；送出請求前 email OTP；Cloudflare Turnstile（或同等）擋機器人；每 email 每日 5 筆、同時待處理 3 筆；7 天自動過期；owner 可封鎖 email。
3. **OTP 對象放寬**：請求流程可寄 OTP 給**任何** email（不同於檢視權限的「僅名單內」），因此 OTP 寄信量與退信、濫發風險要監控。
4. **寄信**：Resend 與寄件網域（DKIM/SPF）；通知 owner 新請求、通知 requester 結果、OTP；雙語模板。
5. **新資料表**：`plan_requests`、`availability_blocks`、trip 的 availability 設定（已在 schema）。
6. **新 UI**：Owner 設定（開關、公開、窗口、緩衝、封鎖時段、重新產生空檔連結）、請求收件匣（待處理徽章）；Viewer 的空檔條與請求表單。
7. **時區**：以 trip 時區計算；viewer 在其他時區時同時顯示本地時間。
8. **測試**：空檔演算法（跨日、緩衝重疊、夏令時間、午夜）；權限矩陣（未驗證／受邀者／全覽者 × 三種 visibility × 空檔連結）。
9. 依賴 M3、M4、M8、M9；排在 M12。

### 2.3 Commute 起點／終點與 Google Maps 預估
- Commute 新增**起點**與**終點**（名稱、地址、place_id）。預設由前後 plan 的地點（或 hotel）帶入，可手動改成任何地點。
- 按「預估時間」→ 後端呼叫 **Google Routes API (computeRoutes)** 取得時長與距離，填入 `duration_min`、`distance_m`，`duration_source = 'google'`、`estimated_at`。使用者仍可手動修改（改了就變回 `manual`）。
- 交通方式對應：`walk→WALK`、`bike→BICYCLE`、`car/taxi→DRIVE`、`train/subway/bus→TRANSIT`；`flight/other` 不預估，維持手動。
- TRANSIT 需要出發時間：用 commute 的 `start_at`；若 plan 時間改了，起點／終點／時間任一變動則標示「預估已過期」並提供重新預估。
- 預估只是參考，不會自動覆蓋手動值；費用不由 Google 提供（票價欄位仍手動，或之後再評估 transit fare）。
- 起點／終點輸入用 **Places Autocomplete (New)**（搭配 session token，減少計費）。
- 儲存規則（依 Google 條款）：`place_id` 可長期儲存；lat/lng 只能快取 30 天，所以存 `*_cached_at`，過期後用 place_id 重新取得，不長期保存座標。
- 成本控制：只在使用者按鈕時呼叫（不是每次輸入）、同一組（起點、終點、方式、時間）短時間快取、後端每使用者 rate limit、Google Cloud 設每日配額與預算警示。

## 3. 其他假設（請確認）

1. Hangout 計分板只算「已完成」plan 的 duration，預設納入所有類型，可依類型篩選。
2. 一個 trip 一個 timezone（由第一個目的地帶入，可手動改）。
3. Commute 掛在兩個 plan 之間，或 hotel ↔ plan。
4. 照片上限 10 MB，client 壓縮至長邊 1600px；每個 plan 最多 12 張。
5. 「英文版本」解讀為整個 app 雙語（繁中/EN），**不是**另開一份獨立英文計畫。若你想要的是「同一份行程輸出一份英文版文件」，告訴我。

## 4. 目的地 → 時區/幣別 自動帶入

- 目的地輸入用 **Google Places (New) Autocomplete + Place Details**（zh-TW，繁體）取得名稱與座標，再以 **Time Zone API** 取得 IANA 時區；`country_code` 取自 address components，國家顯示名稱由 CLDR 產生（台灣＝國家，不顯示「省」）。原先的 Open-Meteo 因 zh 結果為簡體而移除。
- `country_code → currency` 用內建靜態對照表（ISO 3166 → ISO 4217）。
- 第一個目的地決定 trip 預設 `timezone` / `currency`；之後新增目的地不覆蓋。使用者可手動覆寫，覆寫後不再自動變動。

## 5. 幣別與美金換算

- 每筆金額（plan / hotel / commute）存 **原幣別 + 數字**（`cost`, `cost_currency`，null = trip 幣別）。
- 匯率：每日由 **Frankfurter API**（免 key，ECB 匯率）抓取，以 USD 為樞紐存入 `fx_rates`（Netlify scheduled function 每日一次；缺幣別時退回 trip 手動匯率）。
- `trips.usd_rate_override`：手動鎖定「1 trip 幣別 = x USD」，用於 trip 結算（優先於自動匯率）。
- 顯示規則：任何金額旁有 `USD` 切換 chip；Dashboard 與匯出圖片頂部有全域「Trip 幣別 / USD」切換。換算值前加「≈」。
- 換算路徑：原幣別 → USD →（需要時）trip 幣別。加總一律先換成同一幣別再加。
- **已確認**：已完成的 plan 以「完成當天」匯率換算並寫死——勾選完成時，把當日 `usd_per_unit` 存入 `plans.usd_per_unit_at_completion`；之後顯示美金一律用此值。取消完成則清除。未完成的 plan、hotel、commute 用今日匯率。若有 `trips.usd_rate_override`，trip 結算以它為準。

## 6. 邀請（三種方式）

在 plan drawer 與卡片選單的「邀請」modal 中，三個 tab：
1. **Email**：組出 `mailto:{people emails}?subject&body`，開啟使用者的郵件軟體。
2. **複製文字**：一鍵複製純文字邀請（適合貼到 LINE / Messenger / IG），含標題、日期時間（trip tz）、地點、人員、連結、備註。
3. **行事曆**：複製或下載 `.ics`。

- 邀請語言可選（預設 `trips.invite_locale`，亦可依收件人的 `people.locale`）。
- `.ics` 公開網址：`/api/ics/{plans.ics_token}`，**每個 plan 獨立不可猜 token**，只含時間、地點、標題，不含金額與人員 email。
- 限制：`mailto:` 無法夾帶附件，.ics 以連結提供。
- 全部文字依 locale 產生，模板放 i18n 檔。

## 7. 匯出圖片

### 7.1 Dashboard 匯出
- 匯出前 modal 勾選：行程總覽 / 已完成 plan 與照片 / Hangout 計分板 / 花費圓環 / Todo 完成率 / 住宿時間軸。
- 設定：主題色（4 款粉彩）、尺寸（1080×1350 / 1080×1080）、語言（繁中/EN）、金額幣別（Trip / USD）、是否含金額。

### 7.2 單一 Plan 報告圖（新）
- 每張 plan 卡片的選單 →「匯出報告圖」。
- 可勾選欄位：類型與標題、日期時間、地點、參與者、照片（選哪幾張）、備註、cosplay 角色與 checklist 完成度、花費（含 USD 選項）、完成印章。
- 版面：一張 1080×1350 分享卡（上方照片拼貼、下方資訊），未完成的 plan 也能匯出但不含照片區。
- 受邀者（restricted viewer）也能匯出**自己可見**的 plan 圖，且永遠不含金額欄位。

### 7.3 Trip report
- 已完成的 plan + 照片依日期排序，同一套管線輸出多張圖；可一次下載 zip。

### 技術
- 隱藏固定尺寸 DOM + `html-to-image` 轉 PNG；字型預載（Noto Sans TC、Inter、Zen Maru Gothic）。內容超出自動分頁。視覺規格見 `DESIGN.md` §6。

## 8. 畫面（同 v1，補充）

1. **Welcome `/`**：「開啟上次旅行」+「建立新旅行」；trip 列表。
2. **Trip 設定**：名稱、起訖日、destinations（自動帶入時區/幣別）、分享連結、viewer 金額可見度、邀請語言、**people 管理（name, email, locale, 全覽者開關）**。
3. **Main view `/t/[id]`**：上方 hotel 橫向時間軸（缺口夜晚標紅）；下方每日一欄，plan 依時間堆疊；相鄰 plan 之間 commute chip；可拖曳換日。
4. **Plan drawer**：location / people / start / duration / cost+幣別 / link；cosplay 加 character、checklist、note；邀請、完成勾選、完成後出現照片上傳區、匯出報告圖。
5. **Dashboard**：todo（依 category 分組）、cost（依 hotel/commute/type）、hangout 計分板、匯出。
6. **Viewer `/v/[token]`**：email 驗證 → 依 §2 權限顯示（唯讀）。
7. 語言切換在頂部選單，偏好存 cookie（editor 存 profile）。

## 9. 資料與規則（補充）

- Todo 自動規則：hotel `not_booked` → 「訂房」todo；commute `payment=ticket` → 「購票」todo；狀態改變時移除未完成的 auto todo。
- Cosplay checklist = `todos` where `plan_id` & `category=cosplay`。
- Nights = `check_out::date - check_in::date`。
- i18n：`next-intl`，語系檔 `messages/zh-TW.json`、`messages/en.json`；所有字串（含 enum 顯示名、邀請模板、匯出圖文字）走 i18n。日期格式依 locale。

## 10. 技術清單

`next`, `typescript`, `tailwindcss`, `shadcn/ui`, `lucide-react`, `framer-motion`, `@supabase/ssr`, `@tanstack/react-query`, `zod`, `react-hook-form`, `date-fns` + `date-fns-tz`, `next-intl`, `@dnd-kit/core`, `recharts`, `html-to-image`, `ics`, `browser-image-compression`, `resend`（OTP 寄信）。

## 11. 里程碑

| # | 內容 |
|---|---|
| M0 ✅ | scaffold、Supabase、跑 schema、Auth magic link、next-intl、design tokens |
| M1 ✅ | Welcome、Trip CRUD、destinations 自動帶入時區/幣別、people |
| M2 ✅ | Hotel CRUD + 時間軸 + auto todo |
| M3 ✅ | Plan CRUD（含 cosplay）+ 日期欄 + 拖曳 |
| M4 ✅ | Commute（含起點/終點）+ Google 預估 + 付款/購票 auto todo |
| M5 ✅ | 完成勾選 + 照片上傳 |
| M6 ✅ | FX 匯率 cron + 金額 USD 切換 |
| M7 ✅ | Dashboard（todo / cost / 計分板） |
| M8 ✅| Viewer：OTP、restricted / full 權限、server 過濾、照片 signed URL |
| M9 ✅ | 邀請（複製文字 / .ics；mailto 依需求取消） |
| M10 ✅ | 匯出圖片（dashboard / 單一行程 / 旅行報告） |
| M11 ✅ | 響應式、空狀態、錯誤處理、英文文案檢查 |
| M12 ✅ | 找我約（空檔演算法、公開空檔頁、請求收件匣、通知、反濫用） |
| M14 ✅ | 小卡顯示攝影師／攝影棚、行程一覽頁、未排日期行程、主頁區塊對調與捲動連動 |
| M13 ✅ | 小時制時長、複製行程、費用品項加總、cosplay 攝影師／攝影棚費用、任務類型、待辦頁與自訂分類 |

## 12. 驗收重點

- 未驗證者除驗證頁外看不到任何資料；不在名單的 email 與在名單的 email 回應完全相同。
- `owner_only` plan 不會出現在任何 viewer API／匯出圖／viewer Dashboard（含全覽者）；`participants_only` 只出現在參與者的視圖。
- 公開空檔連結的 API 回應只含時段，不含任何 plan 欄位。
- Plan 時長 <30 分被拒絕；commute 可為 0 分。
- 受邀者 API 回應**不含**非自己 plan、hotel、金額、他人 commute；full viewer 的金額依 `viewers_see_costs`。
- 受邀者拿不到他人 plan 的照片 signed URL。
- not_booked hotel / ticket commute 一定有 todo。
- 新增第一個目的地「東京」→ timezone `Asia/Tokyo`、幣別 `JPY` 自動帶入；任何金額可切換 ≈USD；加總先統一幣別。
- 單一 plan 匯出圖：勾選欄位才出現；restricted viewer 匯出不含金額；中英文都不缺字。
- 在 New York 瀏覽器操作東京 trip，顯示與 .ics 仍是東京時間。

## 13. 待你決定（不擋開工）

- 匯出圖片的浮水印文字 / App 名稱。

## 14. 已確認

- 受邀者可看到同一個 plan 的其他參與者**名字**，但永遠看不到任何人的 email（server 端過濾，回傳的 people 只含 `id, name, color`）。
