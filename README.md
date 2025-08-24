🎙️ PTT Real-time App (Push-to-Talk)โปรเจกต์นี้คือ Web Application สำหรับการสื่อสารด้วยเสียงแบบ Push-to-Talk (คล้าย Zello) ที่สร้างขึ้นด้วยเทคโนโลยีเว็บสมัยใหม่ ผู้ใช้สามารถสร้างห้องสนทนา, เข้าร่วม, และพูดคุยกับผู้ใช้คนอื่นได้แบบ Real-time พร้อมฟีเจอร์แปลงเสียงพูดเป็นข้อความภาษาไทย✨ คุณสมบัติหลัก (Core Features)ระบบสมาชิก: สมัครสมาชิก, เข้าสู่ระบบ, และจัดการโปรไฟล์ส่วนตัวการจัดการห้อง:สร้างห้องสนทนาใหม่แสดงรายชื่อห้องทั้งหมด พร้อมจำนวนผู้เข้าร่วมเข้าร่วมและออกจากห้องการสื่อสารแบบ Push-to-Talk:ปุ่มกดเพื่อพูดสำหรับส่งสัญญาณเสียงแบบ Real-time (ยังไม่สมบูรณ์)แสดงสถานะเมื่อมีคนกำลังพูดแปลงเสียงเป็นข้อความ (Transcription):แปลงเสียงพูดภาษาไทยเป็นข้อความโดยอัตโนมัติด้วย Web Speech APIแสดงประวัติการสนทนาที่ถูกแปลงเป็นข้อความแล้วในแต่ละห้องระบบแอดมิน:หน้า Dashboard สำหรับผู้ดูแลระบบสามารถจัดการ (แก้ไข/ลบ) ห้องทั้งหมดในระบบได้🚀 เทคโนโลยีที่ใช้ (Technology Stack)Frontend (ฝั่งผู้ใช้)Framework: React 18 (with Vite)Language: TypeScriptStyling: Tailwind CSSRouting: React Router v6State Management: React Context APIIcons: Lucide ReactBackend (ฝั่งเซิร์ฟเวอร์)Runtime: Node.jsFramework: Express.jsReal-time Communication: WebSocket (ws)Real-time Audio (ส่วนที่ต้องพัฒนาต่อ)Protocol: WebRTC🛠️ การติดตั้งและใช้งาน (Installation & Setup)โปรเจกต์นี้ถูกแบ่งออกเป็น 2 ส่วนคือ frontend และ server ซึ่งต้องรันพร้อมกันข้อกำหนดเบื้องต้นNode.js (แนะนำเวอร์ชัน LTS)npm (มาพร้อมกับ Node.js)ขั้นตอนการติดตั้งClone a Repository (ถ้ามี):git clone <your-repository-url>
cd <your-project-folder>
ติดตั้ง Dependencies ฝั่ง Frontend:cd frontend
npm install
ติดตั้ง Dependencies ฝั่ง Backend:cd ../server
npm install
🏃‍♂️ การรันโปรเจกต์ (Running the Project)คุณจะต้องเปิดโปรแกรม Terminal 2 หน้าต่างหน้าต่างที่ 1: รัน Backend Server# อยู่ในโฟลเดอร์ /server
npm run start
# หรือใช้ nodemon เพื่อ auto-reload
npm run dev
เซิร์ฟเวอร์จะทำงานที่ http://localhost:8080หน้าต่างที่ 2: รัน Frontend (Vite Dev Server)# อยู่ในโฟลเดอร์ /frontend
npm run dev
แอปพลิเคชันจะเปิดให้ใช้งานที่ http://localhost:5173 (หรือ Port อื่นที่ Vite กำหนด)📝 Scripts ที่มีให้ใช้ฝั่ง Frontend (/frontend)npm run dev: เริ่มต้น Development Server ของ Vitenpm run build: Build โปรเจกต์สำหรับนำไปใช้งานจริง (ไฟล์จะอยู่ในโฟลเดอร์ dist)npm run preview: พรีวิวเวอร์ชันที่ Build แล้วฝั่ง Server (/server)npm run start: เริ่มต้นเซิร์ฟเวอร์ด้วย Node.jsnpm run dev: เริ่มต้นเซิร์ฟเวอร์ด้วย nodemon ซึ่งจะรีสตาร์ทอัตโนมัติเมื่อมีการแก้ไขโค้ด
