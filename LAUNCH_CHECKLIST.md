# 上線前檢查清單

> M0–M12 的程式只通過 build／lint／型別檢查／單元測試（50 項），**從未接過真的 Supabase、Resend、Google、Turnstile 跑過**。這份清單的重點就是把這些補上。

## 1. Supabase
- [ ] 建立專案，在 SQL Editor 執行 `supabase/schema.sql`（若已跑過舊版：補 `trips.availability_blocked_emails text[] not null default '{}'`、`viewer_otps.purpose text not null default 'view'`）
- [ ] Auth → URL Configuration：Site URL 與 Redirect URLs 加上正式網址的 `/auth/callback`（本機 `http://localhost:3000/auth/callback` 也要）
- [ ] Auth → Email：確認 magic link 會寄出；正式環境改用自己的 SMTP（內建寄信額度很低）
- [ ] 關閉公開註冊或限制只有你的 email 能登入（目前任何人都能用 magic link 建帳號並建立自己的旅程）
- [ ] Storage：確認私有 bucket `trip-photos` 已建立、policy 已套用
- [ ] Storage 的跨來源設定（CORS）允許你的網域——匯出照片圖片時需要，否則匯出會失敗
- [ ] 複製 `service_role` key 到環境變數（**只放伺服器端，絕不可加 `NEXT_PUBLIC_`**）

## 2. 環境變數（Netlify → Site configuration → Environment variables）
| 變數 | 備註 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開用 |
| `SUPABASE_SERVICE_ROLE_KEY` | 伺服器專用 |
| `NEXT_PUBLIC_SITE_URL` | 正式網址（邀請連結、`.ics`、通知信都用它） |
| `VIEWER_COOKIE_SECRET` | ≥32 字元：`openssl rand -hex 32`；更換會讓所有檢視者登出 |
| `RESEND_API_KEY` / `RESEND_FROM` | 見第 3 節 |
| `GOOGLE_MAPS_SERVER_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | 見第 4 節 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` | 見第 5 節；正式環境沒設 secret 會拒絕所有請求者驗證 |
| `CRON_SECRET` | 每日匯率 cron 用 |

## 3. Resend（寄信）
- [ ] 驗證寄件網域（DKIM、SPF，建議加 DMARC）
- [ ] `RESEND_FROM` 用該網域的地址
- [ ] 實測：自己的 email 收得到驗證碼、不進垃圾信
- [ ] 注意：寄件失敗時驗證碼流程仍會回「已寄出」（避免洩漏名單），所以要看 Resend 後台確認有沒有退信

## 4. Google Maps Platform
- [ ] 啟用 Routes API、Places API (New)、**Time Zone API**（目的地搜尋會用到；伺服器 key 的 API 限制也要包含這三項）
- [ ] 伺服器 key：限制 API 為 Routes；瀏覽器 key：限制 HTTP referrer 為你的網域、API 為 Places
- [ ] 設定每日配額與預算警示（預估時間只在按按鈕時呼叫，但仍要設上限）
- [ ] 實測：新增交通 → 按「預估時間」會填入分鐘數；`flight`／`other` 不會預估

## 5. Cloudflare Turnstile
- [ ] 建立 widget，網域填正式網域
- [ ] 實測：公開空檔頁寄驗證碼時有出現挑戰、沒通過就寄不出去

## 6. 部署平台
### Netlify（改用 Netlify 時）
- [ ] 連接 Git repo，Build command `npm run build`（`netlify.toml` 已設定），Netlify 會自動套用 Next.js 16 runtime
- [ ] Site configuration → Environment variables：貼上第 2 節全部變數（`NEXT_PUBLIC_SITE_URL` 填 Netlify 網址或自訂網域）
- [ ] 每日匯率改由 `netlify/functions/fx-cron.mts` 排程（03:15 UTC），；部署後到 Functions 頁手動執行一次，確認 `fx_rates` 有資料
- [ ] 對 `/a/*`、`/v/*` 設 Netlify 的 rate limiting 規則（Security → Rate limiting）
- [ ] Supabase Redirect URLs 加上 Netlify 網址與 deploy preview 網址

### 其他注意
- [ ] 預覽部署（deploy preview）別用正式資料庫；preview 網址要加進 Supabase Redirect URLs 才能登入
- [ ] 若日後改用 Vercel：需自行加回 `vercel.json` 的 cron（`/api/cron/fx`，每日一次）

## 7. 手動冒煙測試（照順序，用兩個瀏覽器／無痕視窗）
**建立與編輯**
- [ ] 登入 → 建旅程（目的地搜尋會帶入時區與幣別）
- [ ] 新增住宿：未訂房會自動出現「訂房」待辦；缺口夜晚標紅
- [ ] 新增行程（每種類型各一）、拖曳換日、手機版用「移到」選單
- [ ] 新增交通：選「票」會產生購票待辦；Google 預估有填入
- [ ] 勾選完成 → 上傳照片 → 確認完成當天匯率被凍結

**檢視者權限（最重要，逐項驗）**
- [ ] 沒驗證的人只看到驗證頁（只有旅程名稱）
- [ ] 不在名單的 email：畫面回應與在名單上的一模一樣，但**沒有收到信**
- [ ] 受邀者：只看到自己在名單上的行程；沒有住宿、交通、費用；看得到同行者名字但看不到 email
- [ ] 指定的完整檢視者：看得到全部；費用只在你勾選時才看得到
- [ ] 「只對參與者」行程：完整檢視者不在名單上就看不到；「只對我顯示」：任何檢視者都看不到
- [ ] 在檢視頁網址加 `?view=all`（受邀者）不會多看到東西
- [ ] 把某人的「可看全部」關掉，重新整理檢視頁立刻失去權限
- [ ] 檢視者看得到已完成行程的照片
- [ ] 重新產生檢視連結後，舊連結失效

**邀請與匯出**
- [ ] 複製邀請文字（中／英）；下載 `.ics` 匯入行事曆，時間正確（注意時區）
- [ ] 「只對我顯示」的行程沒有邀請面板，其 `.ics` 連結回 404
- [ ] 匯出儀表板圖、單一行程圖（含照片）、旅行報告；浮水印是旅行名稱＋日期

**找我約**
- [ ] 設定可約時段與緩衝，空檔條與你的行程對得上（含住宿入退房、交通）
- [ ] 沒公開時 `/a/...` 是 404；公開後不用驗證就看得到空檔，且看不到任何行程內容
- [ ] 用任意 email 驗證並送出請求；你收到通知信
- [ ] 同一時段在你新增行程後送出 → 被擋（時段已被占走）
- [ ] 同 email 第 4 筆待處理、第 6 筆當日請求會被擋
- [ ] 收件匣接受：自動建立行程與 people，對方收到含 `.ics` 連結的信；先手動塞一個衝突行程再接受 → 被擋
- [ ] 封鎖 email 後該 email 無法再送，且畫面不會透露被封鎖

## 8. 資安快速檢查
- [ ] `service_role` key 沒出現在任何 `NEXT_PUBLIC_` 變數或瀏覽器 bundle
- [ ] 在 Supabase 後台確認所有資料表都有開 RLS
- [ ] 用匿名身分直接打 Supabase REST（用 anon key）讀 `plans`、`people`：應該什麼都拿不到
- [ ] 檢視頁、空檔頁的回應內容（開發者工具 Network）搜尋 `@`、費用數字：不該出現不該看的內容
- [ ] 確認 cookie 為 `HttpOnly`、正式環境有 `Secure`

## 9. 已知限制（上線前先知道）
- 交通預估時間不會在行程改時間後自動標示「已過期」
- 沒有「住宿 ↔ 行程」的交通入口（交通只能掛在兩個相鄰行程之間）
- 表單裡的 ≈USD 提示用市場匯率，不套用旅程的固定匯率
- 拖曳只在桌機；手機用「移到」選單
- 匯出的圖片若照片載入失敗會整張失敗（見第 1 節 CORS）
- 空檔頁／檢視頁沒有應用層 IP 限流（靠主機平台的 rate limiting）
- 請求、OTP 寄信、接受／婉拒流程沒有用模擬資料庫寫自動化測試，只靠上面的手動測試


## M13 之後多一步

- [ ] 已建立過資料庫的人：Supabase → SQL Editor → 貼上 `supabase/migrations/002_m13.sql` → Run（只跑一次）。沒跑的話，新增行程、待辦頁會出錯。
- [ ] 再執行 `supabase/migrations/003_m14.sql`（M14，接在 002 之後；只跑一次）。
- [ ] 再執行 `supabase/migrations/004_m15.sql`（M15，接在 003 之後；只跑一次）。
- [ ] 再執行 `supabase/migrations/005_m16.sql`（M16，接在 004 之後；只跑一次）。
- [ ] M17：先執行 `006a_m17_types.sql`，成功後在新的查詢執行 `006b_m17_data.sql`。
