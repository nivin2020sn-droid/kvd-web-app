# دليل نشر الـ Backend على Render (5 دقائق)

## ⚙️ المتطلبات
1. حساب على [render.com](https://render.com) (مجاني)
2. حساب على [mongodb.com/atlas](https://www.mongodb.com/atlas) (مجاني — 512 MB)
3. حساب GitHub (لرفع الكود) — اختياري إن استخدمت Manual Deploy

---

## 1️⃣ إنشاء قاعدة بيانات MongoDB Atlas (مجانية)

1. ادخل https://cloud.mongodb.com → **Build a Cluster** → اختر **M0 Free**.
2. اختر منطقة قريبة (مثل Frankfurt) → **Create**.
3. **Database Access** → Add User → username/password (مثلاً `kvd` / `kvd123`).
4. **Network Access** → Add IP → **0.0.0.0/0** (Allow from anywhere).
5. **Connect → Drivers → Node.js** → انسخ الـ Connection String، يبدو هكذا:
   ```
   mongodb+srv://kvd:kvd123@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   احفظه — ستحتاجه في الخطوة 3.

---

## 2️⃣ رفع الكود إلى GitHub

```bash
cd /app/server-node
git init
git add .
git commit -m "Reinigung Backend v1"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/kvd-backend.git
git push -u origin main
```

> إذا لم يكن لديك GitHub، يمكنك رفع المجلد كـ ZIP عبر "Manual Deploy" على Render.

---

## 3️⃣ نشر على Render

1. اذهب إلى https://dashboard.render.com → **New + → Web Service**.
2. اربط حساب GitHub → اختر repo `kvd-backend`.
3. املأ الحقول:
   - **Name**: `kvd-backend` (أو أي اسم)
   - **Region**: Frankfurt
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free**
4. اضغط **Advanced** ثم أضف Environment Variables:
   | Key | Value |
   |---|---|
   | `MONGO_URL` | الرابط من Atlas (الخطوة 1) |
   | `DB_NAME` | `reinigung` |
   | `ADMIN_PASSWORD` | `admin123` |
   | `NODE_VERSION` | `20` |
5. اضغط **Create Web Service** → انتظر 2–3 دقائق حتى يكتمل البناء.
6. ستحصل على رابط مثل: `https://kvd-backend.onrender.com`

---

## 4️⃣ ربط التطبيق PWA بالسيرفر الجديد

افتح الـ PWA → **ADMIN** → سجل الدخول (`admin123`) → اضغط زر **Server** → أدخل:
- **Server URL**: `https://kvd-backend.onrender.com`
- اضغط **Verbindung testen** (اختبار الاتصال) → يجب أن يظهر "Verbunden ✓"
- اضغط **SPEICHERN** (حفظ).

✅ التطبيق الآن متصل بالسيرفر الحقيقي وسيتم مزامنة كل المهام Live بين Admin والـ Tablet.

---

## ⚠️ ملاحظات مهمة عن خطة Render المجانية
- السيرفر يدخل في **Sleep Mode** بعد 15 دقيقة بدون نشاط.
- أول طلب بعد النوم قد يأخذ 30–50 ثانية حتى يستيقظ — هذا طبيعي.
- إذا أردت سيرفر لا ينام، ارفع للخطة المدفوعة ($7/شهر) أو استخدم خدمة UptimeRobot (مجانية) لإرسال ping كل 14 دقيقة.

---

## 🔍 اختبار سريع بعد النشر

```bash
curl https://kvd-backend.onrender.com/api/health
# يجب أن يرجع: {"status":"ok","db":"connected",...}

curl -X POST https://kvd-backend.onrender.com/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"password":"admin123"}'
# يجب أن يرجع: {"token":"admin-session-token"}
```

تمت بحمد الله. 🎉
