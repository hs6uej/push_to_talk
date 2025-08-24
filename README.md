🎙️ PTT Real-time App (Push-to-Talk)
โปรเจกต์นี้คือ Web Application สำหรับการสื่อสารด้วยเสียงแบบ Push-to-Talk (คล้าย Zello) ที่สร้างขึ้นด้วยเทคโนโลยีเว็บสมัยใหม่ ผู้ใช้สามารถสร้างห้องสนทนา, เข้าร่วม, และพูดคุยกับผู้ใช้คนอื่นได้แบบ Real-time พร้อมฟีเจอร์แปลงเสียงพูดเป็นข้อความภาษาไทย
✨ คุณสมบัติหลัก (Core Features)
ระบบสมาชิก: สมัครสมาชิก, เข้าสู่ระบบ, และจัดการโปรไฟล์ส่วนตัว
การจัดการห้อง:
สร้างห้องสนทนาใหม่
แสดงรายชื่อห้องทั้งหมด พร้อมจำนวนผู้เข้าร่วม
เข้าร่วมและออกจากห้อง
การสื่อสารแบบ Push-to-Talk:
ปุ่มกดเพื่อพูดสำหรับส่งสัญญาณเสียงแบบ Real-time (ยังไม่สมบูรณ์)
แสดงสถานะเมื่อมีคนกำลังพูด
แปลงเสียงเป็นข้อความ (Transcription):
แปลงเสียงพูดภาษาไทยเป็นข้อความโดยอัตโนมัติด้วย Web Speech API
แสดงประวัติการสนทนาที่ถูกแปลงเป็นข้อความแล้วในแต่ละห้อง
ระบบแอดมิน:
หน้า Dashboard สำหรับผู้ดูแลระบบ
สามารถจัดการ (แก้ไข/ลบ) ห้องทั้งหมดในระบบได้
🚀 เทคโนโลยีที่ใช้ (Technology Stack)
Frontend (ฝั่งผู้ใช้)
Framework: React 18 (with Vite)
Language: TypeScript
Styling: Tailwind CSS
Routing: React Router v6
State Management: React Context API
Icons: Lucide React
Backend (ฝั่งเซิร์ฟเวอร์)
Runtime: Node.js
Framework: Express.js
Real-time Communication: WebSocket (ws)
Real-time Audio (ส่วนที่ต้องพัฒนาต่อ)
Protocol: WebRTC
🛠️ การติดตั้งและใช้งาน (Installation & Setup)
โปรเจกต์นี้ถูกแบ่งออกเป็น 2 ส่วนคือ frontend และ server ซึ่งต้องรันพร้อมกัน
ข้อกำหนดเบื้องต้น
Node.js (แนะนำเวอร์ชัน LTS)
npm (มาพร้อมกับ Node.js)
ขั้นตอนการติดตั้ง
Clone a Repository (ถ้ามี):
git clone <your-repository-url>
cd <your-project-folder>


ติดตั้ง Dependencies ฝั่ง Frontend:
cd frontend
npm install


ติดตั้ง Dependencies ฝั่ง Backend:
cd ../server
npm install


🏃‍♂️ การรันโปรเจกต์ (Running the Project)
คุณจะต้องเปิดโปรแกรม Terminal 2 หน้าต่าง
หน้าต่างที่ 1: รัน Backend Server
# อยู่ในโฟลเดอร์ /server
npm run start
# หรือใช้ nodemon เพื่อ auto-reload
npm run dev


เซิร์ฟเวอร์จะทำงานที่ http://localhost:8080
หน้าต่างที่ 2: รัน Frontend (Vite Dev Server)
# อยู่ในโฟลเดอร์ /frontend
npm run dev


แอปพลิเคชันจะเปิดให้ใช้งานที่ http://localhost:5173 (หรือ Port อื่นที่ Vite กำหนด)
📝 Scripts ที่มีให้ใช้
ฝั่ง Frontend (/frontend)
npm run dev: เริ่มต้น Development Server ของ Vite
npm run build: Build โปรเจกต์สำหรับนำไปใช้งานจริง (ไฟล์จะอยู่ในโฟลเดอร์ dist)
npm run preview: พรีวิวเวอร์ชันที่ Build แล้ว
ฝั่ง Server (/server)
npm run start: เริ่มต้นเซิร์ฟเวอร์ด้วย Node.js
npm run dev: เริ่มต้นเซิร์ฟเวอร์ด้วย nodemon ซึ่งจะรีสตาร์ทอัตโนมัติเมื่อมีการแก้ไขโค้ด
