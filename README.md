# 🎙️ PTT — เว็บ Push-to-Talk (แนว Zello)

วิทยุสื่อสารบนเว็บ: เลือกช่อง → กดปุ่มค้าง (หรือ Space) เพื่อพูด → ทุกคนในช่องได้ยินสดทันที และมีประวัติเสียงย้อนฟังได้

## โครงสร้างผู้ใช้และองค์กร
| ระดับ | ทำอะไรได้ |
|---|---|
| **Super admin** | เห็นและตั้งค่าได้ทุกอย่าง: อนุมัติ/ระงับ/ลบองค์กร, ผู้ใช้ทั้งหมด, ย้ายผู้ใช้เข้าองค์กร, ช่องทั้งหมด, คลังข้อความและ audit ทุกองค์กร |
| **แอดมินองค์กร** | หน้า "องค์กร": กดรับ/ปฏิเสธคำขอเข้า, เพิ่ม/นำออก/ระงับสมาชิก, ตั้งบทบาท (แอดมิน/ศูนย์สั่งการ/สมาชิก), ช่องขององค์กร + ตั้ง "ห้องรวม" และ "ฉุกเฉิน", QR องค์กร, เปิด/ปิดการใช้โลกภายนอก, audit เฉพาะองค์กร |
| **ศูนย์สั่งการ (dispatcher)** | ศูนย์สั่งการ + คลังข้อความ + แผนที่ ของสมาชิกในองค์กรตัวเองเท่านั้น |
| **สมาชิกองค์กร** | ช่องขององค์กร + (ถ้าองค์กรอนุญาต) กลุ่มสาธารณะ เพื่อน และคุย 1:1 กับคนนอก |
| **บุคคลทั่วไป** | กลุ่มสาธารณะ, เพิ่มเพื่อนด้วย QR, คุย 1:1 กับทุกคนที่มองเห็นได้ |

**ตอนสมัคร** เลือกได้ 3 แบบ: บุคคลทั่วไป / เข้าร่วมองค์กร (รหัสหรือ QR → รอแอดมินกดรับ) / ขอเปิดองค์กรใหม่ (เป็นแอดมิน → รอ Super admin อนุมัติ)

**QR / ลิงก์เชิญ** (`https://<host>/i/<รหัส>` — สแกนด้วยกล้องมือถือหรือปุ่มสแกนในแอปก็ได้)
- QR ของฉัน → เพิ่มเป็นเพื่อน (ทั้งสองฝ่าย) แล้วเปิดแชท 1:1
- QR กลุ่มสาธารณะ → เข้าได้ทันที
- QR กลุ่มขององค์กร → เฉพาะสมาชิกองค์กร; กลุ่มส่วนตัวต้องรอผู้ดูแลช่อง/แอดมินกดรับ
- QR องค์กร → ส่งคำขอเข้าองค์กร รอแอดมินกดรับ
- ทุก QR สร้างรหัสใหม่ได้ (ยกเลิกอันเดิม)

ข้อมูลแยกตามองค์กร: ช่อง, ตำแหน่ง/เส้นทาง, SOS (ไปช่องฉุกเฉินขององค์กร), คลังข้อความ, audit log

## คุณสมบัติ
| หมวด | รายละเอียด |
|---|---|
| กดพูด (PTT) | ช่องกลุ่ม และคุย 1:1 · พูดได้ทีละคนต่อช่อง · โหมดกดค้าง / แตะเปิด-ปิด · คีย์ลัด Space · ปุ่มบนหูฟังบลูทูธ (media key, ทดลอง) · ได้ยินเสียงสดจากทุกช่องที่เป็นสมาชิก · ปิดเสียงรายช่อง · สถานะ พร้อม/ไม่ว่าง |
| ส่งข้อมูลอื่น | ข้อความ · รูปภาพ (ย่ออัตโนมัติ) · แชร์ตำแหน่ง · ถอดเสียงเป็นข้อความไทย (Web Speech API บน Chrome/Edge) |
| ช่อง | สาธารณะ / ส่วนตัว · บทบาท เจ้าของ / ผู้ดูแลช่อง / สมาชิก / ฟังอย่างเดียว · ตัวนับข้อความที่ยังไม่อ่าน |
| แผนที่ GPS | ตำแหน่งทีมแบบ realtime · แบตเตอรี่ / ความเร็ว / เวลาอัปเดต · เส้นทางย้อนหลัง 1/6/24 ชม. |
| ฉุกเฉิน | ปุ่ม SOS (กดค้าง 1.5 วิ) → แจ้งเตือนไซเรนเต็มจอ + พิกัด + เสียงสด 15 วิ เข้าช่องฉุกเฉิน (แทรกคนที่พูดอยู่ได้) · รับเรื่อง / ปิดเหตุ |
| Message Vault | ค้นหาทุกข้อความ/คำถอดเสียง ตามช่อง คน ประเภท ช่วงวันที่ · ฟังย้อนหลัง · ส่งออก CSV · ตั้งระยะเวลาเก็บข้อมูล (`RETENTION_DAYS`) |
| ศูนย์สั่งการ | เฝ้าฟังทุกช่องพร้อมกัน · คิว SOS · เรียกกลับ (เปิดแชท 1:1) · แผนที่ย่อ · กิจกรรมล่าสุดทุกช่อง |
| Admin console | Super admin console + คอนโซลแอดมินองค์กร (ดูหัวข้อด้านบน) · ปิดการสมัครเอง (`ALLOW_REGISTER=false`) |
| ใช้ได้ทุกจอ | มือถือ: แถบเมนูล่าง + ปุ่มพูดใหญ่ · เดสก์ท็อป: เมนูซ้าย + รายการช่อง + ห้อง · โหมดมืดตามระบบ · ติดตั้งเป็นแอป (PWA) ได้ |
| ติดตั้งเอง | Docker image เดียว · SQLite + ไฟล์เสียง/รูปใน volume `/data` |

ยังไม่รองรับ: เชื่อมวิทยุสื่อสารจริง (LMR / radio gateway) และการสรุปบทสนทนาด้วย AI

## รันด้วย Docker

```bash
cp .env.example .env    # แล้วแก้ JWT_SECRET และ ADMIN_PASSWORD
docker compose up -d --build
```

เปิด `http://localhost:8090` แล้วล็อกอินด้วย `ADMIN_USERNAME` / `ADMIN_PASSWORD` จาก `.env`

> ⚠️ เบราว์เซอร์อนุญาตให้ใช้ไมโครโฟนเฉพาะ **HTTPS** หรือ `localhost` เท่านั้น
> ถ้าเปิดจากเครื่องอื่นต้องวางหลัง reverse proxy ที่มี TLS และส่งต่อ WebSocket ที่ path `/ws` ด้วย เช่น nginx:
>
> ```nginx
> location / {
>     proxy_pass http://127.0.0.1:8090;
>     proxy_http_version 1.1;
>     proxy_set_header Upgrade $http_upgrade;
>     proxy_set_header Connection "upgrade";
>     proxy_set_header Host $host;
>     proxy_read_timeout 3600s;
> }
> ```

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `PTT_PORT` | `8090` | port บน host |
| `JWT_SECRET` | (ต้องตั้ง) | กุญแจเซ็น token |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / (ต้องตั้ง) | สร้างบัญชี Super admin ครั้งแรก |
| `MAX_TALK_SECONDS` | `60` | เวลาพูดสูงสุดต่อครั้ง |
| `ALLOW_REGISTER` | `true` | `false` = ให้แอดมินสร้างบัญชีให้เท่านั้น |
| `RETENTION_DAYS` | `0` | ลบข้อความ/เสียง/เส้นทางที่เก่ากว่า N วัน (0 = เก็บตลอด) |
| `PTT_BIND` | `127.0.0.1` | `0.0.0.0` ถ้าต้องการเปิด port ตรงโดยไม่ผ่าน reverse proxy |

## พัฒนาแบบไม่ใช้ Docker (Node 22+)

```bash
cd backend && npm install && npm run dev     # API + WebSocket ที่ :8080
npm install && npm run dev                   # Vite ที่ :5173 (proxy /api และ /ws ไป :8080)
```

## โครงสร้าง
```
backend/server.js      ประกอบ routes + static + retention
backend/routes/        account (สมัคร/เพื่อน/QR), channels, orgs (คอนโซลองค์กร/คำขอ), safety (GPS/SOS), admin (vault/super admin)
backend/http.js        middleware และ helper ร่วม
backend/realtime.js    WebSocket: presence, จองช่องพูด, relay เสียง, ตำแหน่ง
backend/access.js      กฎสิทธิ์ superadmin / องค์กร / สาธารณะ + DTO
backend/db.js          SQLite schema + migration + audit log
src/lib/store.ts       สถานะ realtime ทั้งแอป + PTT engine + GPS + SOS
src/lib/audio.ts       อัดไมค์ (AudioWorklet), เล่นเสียงสด, บี๊บ, ไซเรน
src/components/        AppShell, ChannelView, PttButton, TeamMap, SOS ...
src/pages/             Home, Channel, Map, Dispatch, Vault, Admin, Settings
```

## โปรโตคอล WebSocket (`/ws?token=...`)
Client → Server: `watch {channelId}`, `monitor {on}`, `talk-start {channelId, sos?}`, `talk-stop`, `transcript {messageId,text}`, `status {status}`, `location {lat,lng,acc,speed,heading,battery,charging}`, และ binary frame = PCM16LE mono 16 kHz
Server → Client: `hello`, `channels`, `presence`, `message`, `message-update`, `message-delete`, `talk-granted`, `talk-denied`, `talk-start`, `talk-end`, `talk-saved`, `location`, `sos`, `alert-update`, `channel-removed`, และ binary frame = `[uint32 channelId][PCM]`
