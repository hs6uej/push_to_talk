// หน้า "ข้อมูล" — วิธีใช้งาน, สถาปัตยกรรม, network/flow/sequence diagram และ API (ดูได้ทุกคน)
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import Mermaid from '../components/Mermaid';
import { AppLogo, card } from '../components/ui';
import { useStore } from '../lib/store';

// ---------- ชิ้นส่วนจัดหน้า ----------
const H2: React.FC<{ children: React.ReactNode; id?: string }> = ({ children, id }) => (
  <h2 id={id} className="text-lg font-bold mt-8 mb-2 scroll-mt-20 first:mt-0">{children}</h2>
);
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 my-2">{children}</p>;
const UL: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300 my-2">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
);
const OL: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300 my-2">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>
);
const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[0.85em] font-mono">{children}</code>
);
const Table: React.FC<{ head: string[]; rows: React.ReactNode[][] }> = ({ head, rows }) => (
  <div className="overflow-x-auto my-3 rounded-xl border border-slate-200 dark:border-slate-800">
    <table className="w-full text-sm">
      <thead className="bg-slate-50 dark:bg-slate-800/60 text-left text-xs text-slate-500">
        <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">{c}</td>)}</tr>)}
      </tbody>
    </table>
  </div>
);
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="my-3 rounded-xl border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">{children}</div>
);

// ---------- วิธีใช้งาน ----------
const Guide: React.FC = () => (
  <>
    <H2>เริ่มต้นใช้งาน</H2>
    <OL items={[
      <>เปิดเว็บด้วย Chrome / Edge / Safari บนมือถือหรือคอม (ต้องเป็น <b>HTTPS</b> เบราว์เซอร์จึงอนุญาตไมโครโฟน)</>,
      <>กด <b>สมัครสมาชิก</b> แล้วเลือกว่าสมัครในนาม <b>บุคคลทั่วไป</b>, <b>เข้าร่วมองค์กร</b> (ใส่รหัสหรือสแกน QR ขององค์กร แล้วรอแอดมินกดรับ) หรือ <b>เปิดองค์กรใหม่</b> (รอ Super admin อนุมัติ)</>,
      <>ครั้งแรกที่กดพูด เบราว์เซอร์จะขออนุญาตใช้ไมโครโฟน ให้กด <b>อนุญาต</b></>,
      <>ติดตั้งเป็นแอปได้: บน Android กดเมนู ⋮ → "เพิ่มไปยังหน้าจอหลัก" · บน iPhone กดปุ่มแชร์ → "เพิ่มไปยังหน้าจอโฮม"</>,
    ]} />

    <H2>กดพูด (Push-to-Talk)</H2>
    <UL items={[
      <>เปิดช่องจากแท็บ <b>ช่อง</b> แล้ว <b>กดปุ่มไมค์ค้างไว้</b> เพื่อพูด ปล่อยเพื่อหยุด — บนคอมกด <Code>Space</Code> ค้างได้</>,
      <>พูดได้ <b>ทีละคนต่อช่อง</b>: ถ้ามีคนพูดอยู่ ปุ่มจะเป็นสีเทาและได้ยินเสียงสัญญาณไม่ว่าง</>,
      <>เสียงทุกครั้งถูกบันทึกเป็นข้อความเสียงในช่อง กด ▶ เพื่อฟังย้อนหลังได้</>,
      <>ตั้งค่า → การพูด: เลือก <b>กดค้าง</b> หรือ <b>แตะเปิด/ปิด</b>, ใช้ <b>ปุ่มบนหูฟังบลูทูธ</b> เป็นปุ่มพูด, เปิด <b>ถอดเสียงเป็นข้อความไทย</b>, เปิดหน้าจอค้าง</>,
      <>สถานะ <b>พร้อม / ไม่ว่าง</b>: "ไม่ว่าง" จะไม่เล่นเสียงสดจากช่องอื่นที่ไม่ได้เปิดอยู่ · ปุ่มลำโพงบนหัวช่องใช้ปิดเสียงเฉพาะช่องนั้น</>,
    ]} />

    <H2>ข้อความ รูป และตำแหน่ง</H2>
    <UL items={[
      <>พิมพ์ข้อความในช่องด้านล่าง · 📷 ถ่ายรูป · 🖼️ เลือกรูปได้ครั้งละ 10 รูป (ใส่คำบรรยายได้) · 📍 ส่งตำแหน่งปัจจุบัน</>,
      <>บนคอมลากไฟล์รูปมาวาง หรือกด <Code>Ctrl+V</Code> เพื่อวางรูป</>,
      <>รูปหลายรูปที่ส่งติดกันจะแสดงเป็นกริด แตะเพื่อดูเต็มจอ ปัดซ้าย/ขวาเพื่อดูรูปถัดไป</>,
      <>ห้องสาธารณะและห้องฉุกเฉิน: สมาชิกใหม่เห็น <b>เฉพาะข้อความหลังจากเข้าร่วม</b></>,
    ]} />

    <H2>เพื่อน QR และแชท 1:1</H2>
    <UL items={[
      <><b>QR ของฉัน</b> อยู่ที่แท็บรายชื่อและหน้าตั้งค่า — ให้อีกฝ่ายสแกนเพื่อเป็นเพื่อนกันทันที</>,
      <>ปุ่ม <b>สแกน</b> (ไอคอนกรอบ) ใช้สแกน QR เพื่อน / กลุ่ม / องค์กร หรือใช้กล้องมือถือสแกนก็ได้ (เปิดลิงก์ <Code>/i/รหัส</Code>)</>,
      <>กดที่ <b>รูปโปรไฟล์</b> ใครก็ได้เพื่อดูชื่อ องค์กร สถานะ แสดง QR คุย 1:1 หรือเพิ่มเพื่อน</>,
      <>แท็บรายชื่อมี เพื่อน / คนในองค์กร / ค้นหา (คุยกับทุกคนที่นโยบายองค์กรอนุญาต)</>,
    ]} />

    <H2>กลุ่ม (ช่อง)</H2>
    <Table head={['ประเภท', 'ใครเข้าได้', 'เข้าด้วย QR']} rows={[
      ['กลุ่มสาธารณะ (เปิด)', 'ทุกคนที่ใช้โลกสาธารณะได้', 'เข้าได้ทันที'],
      ['กลุ่มสาธารณะ (ส่วนตัว)', 'คนที่มี QR/ลิงก์เชิญ หรือผู้ดูแลเพิ่มให้', 'เข้าได้ทันที'],
      ['ช่ององค์กร (เปิด)', 'สมาชิกองค์กรทุกคน', 'เข้าได้ทันที (เฉพาะสมาชิกองค์กร)'],
      ['ช่ององค์กร (ส่วนตัว)', 'สมาชิกองค์กรที่ได้รับอนุมัติ', 'ส่งคำขอ → ผู้ดูแลช่อง/แอดมินกดรับ'],
    ]} />
    <P>บทบาทในช่อง: <b>เจ้าของ</b>, <b>ผู้ดูแลช่อง</b>, <b>สมาชิก</b>, <b>ฟังอย่างเดียว</b> — ตั้งได้ที่ปุ่ม ⓘ บนหัวช่อง (รวมถึงรูปช่อง, QR เชิญ, อนุมัติคำขอ)</P>

    <H2>แผนที่และ SOS</H2>
    <UL items={[
      <>แท็บ <b>แผนที่</b>: เปิด "แชร์ตำแหน่งของฉัน" เพื่อส่งพิกัด แบตเตอรี่ และความเร็วแบบ realtime · กดชื่อคนเพื่อดูเส้นทางย้อนหลัง 1/6/24 ชม.</>,
      <>ตำแหน่งของคุณเห็นได้เฉพาะ เพื่อน, คนในช่ององค์กร/กลุ่มส่วนตัว/แชท 1:1 เดียวกัน และเจ้าหน้าที่ขององค์กร</>,
      <><b>SOS</b>: กดปุ่ม SOS สีแดง <b>ค้าง 1.5 วินาที</b> → ส่งแจ้งเหตุพร้อมพิกัดเข้าช่องฉุกเฉิน (ขององค์กร หรือฉุกเฉินสาธารณะ) และเปิดไมค์ส่งเสียงสดอัตโนมัติ</>,
      <>คนในช่องฉุกเฉินจะได้ยินไซเรนและเห็นแถบแจ้งเตือนเต็มจอ กด <b>รับทราบ</b> / <b>ไปช่องฉุกเฉิน</b> / <b>แผนที่</b></>,
    ]} />

    <H2>สำหรับผู้ดูแล</H2>
    <Table head={['บทบาท', 'เมนู', 'ทำอะไรได้']} rows={[
      ['แอดมินองค์กร', 'องค์กร', 'กดรับ/ปฏิเสธคำขอ, เพิ่ม/นำออก/ระงับสมาชิก, ตั้งบทบาท, สร้างช่อง, ตั้ง ⭐ ห้องรวม / 🚨 ฉุกเฉิน, โลโก้, QR องค์กร, เปิด-ปิดโลกภายนอก, บันทึกการใช้งาน'],
      ['ศูนย์สั่งการ', 'ศูนย์สั่งการ, คลังข้อความ', 'เฝ้าฟังทุกช่องขององค์กรพร้อมกัน, คิว SOS, เรียกกลับ, แผนที่ย่อ, ค้นหา/ฟัง/ส่งออก CSV'],
      ['Super admin', 'Super admin', 'อนุมัติ/ระงับ/ลบองค์กร, ผู้ใช้ทั้งหมด, ช่องทั้งหมด, ลบข้อความทั้งช่อง/ตามตัวกรอง, ตั้งค่าแอป (ชื่อ โลโก้ สี ธีม การสมัคร เวลาพูด SOS การเก็บข้อมูล), ห้องเข้าร่วมอัตโนมัติ'],
    ]} />
  </>
);

// ---------- สถาปัตยกรรม ----------
const Architecture: React.FC = () => (
  <>
    <H2>ภาพรวม</H2>
    <P>เว็บแอปหน้าเดียว (SPA) คุยกับเซิร์ฟเวอร์ Node.js ตัวเดียวผ่าน <b>REST (HTTPS)</b> สำหรับข้อมูลทั่วไป และ <b>WebSocket (WSS)</b> สำหรับเสียงสด สถานะออนไลน์ ตำแหน่ง และเหตุการณ์ทั้งหมด ข้อมูลเก็บใน <b>SQLite</b> และไฟล์เสียง/รูปบนดิสก์ ทั้งหมดอยู่ใน Docker image เดียว</P>
    <Mermaid caption="องค์ประกอบของระบบ" chart={`
flowchart LR
  subgraph FE["Frontend — React + Vite + Tailwind"]
    UI["หน้าจอ<br/>ช่อง · รายชื่อ · แผนที่ · ศูนย์สั่งการ · คลัง · องค์กร · Super admin · ข้อมูล"]
    ST["store.ts<br/>สถานะ realtime + PTT engine"]
    AU["audio.ts<br/>AudioWorklet อัดไมค์ · เล่นเสียงสด · บี๊บ · ไซเรน"]
    QR["QR / กล้อง / แผนที่ Leaflet"]
    UI --> ST
    ST --> AU
    UI --> QR
  end
  subgraph BE["Backend — Node.js 22 + Express + ws"]
    R["routes/<br/>account · channels · orgs · safety · admin"]
    RT["realtime.js<br/>WebSocket hub"]
    AC["access.js<br/>กฎสิทธิ์"]
    SE["settings.js<br/>ค่าตั้งของแอป"]
    R --> AC
    RT --> AC
    R --> RT
  end
  DB[("SQLite<br/>ptt.db")]
  FS[("ไฟล์<br/>audio · files · avatars")]
  ST -- "REST /api" --> R
  ST <-- "WebSocket /ws" --> RT
  R --> DB
  RT --> DB
  R --> FS
  RT --> FS
  SE --> DB
`} />

    <H2>เทคโนโลยีที่ใช้</H2>
    <Table head={['ส่วน', 'เทคโนโลยี', 'หน้าที่']} rows={[
      ['UI', 'React 18, TypeScript, React Router 6', 'หน้าจอทั้งหมด, เส้นทาง, ตอบสนองมือถือ/คอม'],
      ['สไตล์', 'Tailwind CSS 3 + CSS variables', 'สีหลักเปลี่ยนได้ทั้งแอป, โหมดมืด (class)'],
      ['Build', 'Vite 5', 'บันเดิลและแยกโค้ด (ไดอะแกรมโหลดเฉพาะหน้านี้)'],
      ['เสียง', 'Web Audio API, AudioWorklet, MediaDevices', 'อัดไมค์ → PCM16 16 kHz, เล่นเสียงสดพร้อม jitter buffer'],
      ['ถอดเสียง', 'Web Speech API (th-TH)', 'ถอดเสียงพูดเป็นข้อความบนเบราว์เซอร์ (Chrome/Edge)'],
      ['แผนที่', 'Leaflet + OpenStreetMap', 'ตำแหน่งทีม, เส้นทาง, SOS, แผนที่ย่อในข้อความ'],
      ['QR', 'qrcode, jsQR', 'สร้าง QR และสแกนจากกล้อง/รูป'],
      ['ไดอะแกรม', 'Mermaid', 'ไดอะแกรมในหน้าข้อมูลนี้'],
      ['เซิร์ฟเวอร์', 'Node.js 22, Express 4, ws 8', 'REST API, WebSocket, ไฟล์ static'],
      ['ฐานข้อมูล', 'SQLite (better-sqlite3, WAL)', 'ผู้ใช้ องค์กร ช่อง ข้อความ ตำแหน่ง SOS audit ค่าตั้ง'],
      ['ความปลอดภัย', 'bcrypt, JWT (30 วัน)', 'รหัสผ่านเข้ารหัส, ยืนยันตัวตน REST/WebSocket'],
      ['Deploy', 'Docker, docker-compose, nginx, Let\'s Encrypt', 'image เดียว, volume /data, HTTPS + WSS'],
    ]} />

    <H2>โมดูลฝั่งเซิร์ฟเวอร์</H2>
    <Table head={['ไฟล์', 'หน้าที่']} rows={[
      [<Code>server.js</Code>, 'ประกอบ routes, เสิร์ฟหน้าเว็บ (ใส่ชื่อแอป/สีลงใน index.html และ manifest), ลบข้อมูลเก่าตาม retention'],
      [<Code>db.js</Code>, 'schema, migration อัตโนมัติ, สร้าง superadmin และช่องเริ่มต้น, audit log'],
      [<Code>access.js</Code>, 'กฎสิทธิ์: superadmin / องค์กร / สาธารณะ, การมองเห็นช่อง ข้อความ ผู้ใช้ ตำแหน่ง'],
      [<Code>realtime.js</Code>, 'WebSocket: presence, จองช่องพูด, relay เสียง, บันทึก WAV, ตำแหน่ง, กระจายเหตุการณ์'],
      [<Code>routes/account.js</Code>, 'สมัคร (3 แบบ), เข้าสู่ระบบ, โปรไฟล์, รูป, สมุดรายชื่อ, เพื่อน, ลิงก์เชิญ/QR'],
      [<Code>routes/channels.js</Code>, 'ช่อง สมาชิก บทบาท แชท 1:1 ข้อความ รูป ลบ/ล้างข้อความ'],
      [<Code>routes/orgs.js</Code>, 'คอนโซลองค์กร, คำขอเข้าองค์กร/ช่อง, สถิติ, audit องค์กร'],
      [<Code>routes/safety.js</Code>, 'ตำแหน่ง เส้นทาง SOS การรับเรื่อง/ปิดเหตุ'],
      [<Code>routes/admin.js</Code>, 'คลังข้อความ (ค้นหา/CSV/ลบ), Super admin: องค์กร ผู้ใช้ audit สถิติ ค่าตั้งแอป'],
    ]} />

    <H2>เสียงพูด</H2>
    <Table head={['หัวข้อ', 'ค่า']} rows={[
      ['รูปแบบ', 'PCM 16-bit little-endian, mono, 16 kHz (32 KB/วินาที)'],
      ['แพ็กเก็ต', 'ทุก 100 ms (1,600 samples = 3,200 bytes) ส่งเป็น binary WebSocket frame'],
      ['เซิร์ฟเวอร์ → ผู้ฟัง', 'เติม header 4 bytes = channelId (uint32 LE) เพื่อแยกเสียงหลายช่องพร้อมกัน'],
      ['ฝั่งผู้ฟัง', 'jitter buffer 150 ms แล้วเล่นต่อเนื่องด้วย AudioBufferSource'],
      ['การบันทึก', 'รวมแพ็กเก็ตเป็นไฟล์ WAV เมื่อหยุดพูด (ทิ้งถ้าสั้นกว่า 300 ms)'],
      ['จำกัดเวลา', 'ตามค่าตั้งของแอป (ค่าเริ่มต้น 60 วินาที) ครบแล้วตัดอัตโนมัติ'],
      ['สิทธิ์พูด', 'หนึ่งคนต่อช่อง; SOS แทรกคนที่พูดอยู่ได้'],
    ]} />

    <H2>โครงสร้างข้อมูล</H2>
    <Mermaid caption="ตารางหลักในฐานข้อมูล" chart={`
erDiagram
  orgs ||--o{ users : "สังกัด"
  orgs ||--o{ channels : "เป็นเจ้าของ"
  orgs ||--o{ join_requests : "รับคำขอ"
  users ||--o{ channel_members : "เป็นสมาชิก"
  channels ||--o{ channel_members : "มี"
  channels ||--o{ messages : "มี"
  users ||--o{ messages : "ส่ง"
  users ||--o{ locations : "เส้นทาง"
  users ||--o{ alerts : "แจ้ง SOS"
  channels ||--o{ alerts : "รับ SOS"
  users ||--o{ friendships : "เป็นเพื่อน"
  users ||--o{ join_requests : "ขอเข้า"
  channels ||--o{ join_requests : "ขอเข้าช่อง"
  users {
    int id
    text username
    text role "superadmin | user"
    int org_id
    text org_role "admin | dispatcher | member"
    text org_status "pending | active"
    text friend_code "รหัส QR"
  }
  orgs {
    int id
    text name
    text code "รหัส QR องค์กร"
    text status "pending | active | suspended"
    int allow_external
  }
  channels {
    int id
    text type "channel | direct"
    text visibility "public | private | org"
    int org_id
    int emergency
    int is_default "เข้าร่วมอัตโนมัติ"
    text invite_code
  }
  channel_members {
    int channel_id
    int user_id
    text role "owner | moderator | member | listener"
    int joined_at
    int last_read_id
  }
  messages {
    int id
    text kind "audio | text | image | location | sos"
    text transcript
    text file
  }
`} />

    <H2>สิทธิ์และการแยกข้อมูล</H2>
    <Table head={['ข้อมูล', 'ใครเห็น']} rows={[
      ['ช่ององค์กร', 'สมาชิกองค์กรที่ได้รับอนุมัติ (ช่องส่วนตัว: เฉพาะสมาชิกช่อง + แอดมิน/ศูนย์สั่งการ) · Super admin'],
      ['ช่องสาธารณะ', 'ทุกคนที่ใช้โลกสาธารณะได้ (บุคคลทั่วไป + องค์กรที่อนุญาต)'],
      ['ข้อความย้อนหลัง', 'ช่องสาธารณะ/ฉุกเฉิน: สมาชิกเห็นตั้งแต่เข้าร่วม · ช่ององค์กรอื่น: เห็นทั้งหมด · Super admin/เจ้าหน้าที่: เห็นทั้งหมด'],
      ['ตำแหน่ง', 'ตัวเอง, เพื่อน, คนในช่ององค์กร/กลุ่มส่วนตัว/แชท 1:1 เดียวกัน, เจ้าหน้าที่องค์กร, Super admin'],
      ['SOS', 'สมาชิกช่องฉุกเฉิน (ที่เข้าร่วมก่อนเกิดเหตุ), เจ้าหน้าที่องค์กร, Super admin'],
      ['คลังข้อความ / audit', 'เจ้าหน้าที่ของแต่ละองค์กร (เฉพาะองค์กรตัวเอง), Super admin ทั้งหมด'],
    ]} />

    <H2>ความปลอดภัย</H2>
    <UL items={[
      'รหัสผ่านเก็บแบบ bcrypt · token JWT อายุ 30 วัน · จำกัดการลองรหัสผ่าน 10 ครั้ง/5 นาที/IP',
      'ทุก API ตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์ (access.js) — ไม่พึ่งการซ่อนปุ่มในหน้าจอ',
      'ไฟล์เสียง/รูปต้องแนบ token และผ่านการตรวจสิทธิ์ทุกครั้ง · รูปโปรไฟล์ใช้ชื่อไฟล์สุ่มเดาไม่ได้',
      'จำกัดขนาด: WebSocket 64 KB/แพ็กเก็ต, รูปแชท 8 MB, รูปโปรไฟล์ 2 MB · ย่อรูปฝั่งเบราว์เซอร์ก่อนอัปโหลด',
      'ทุกการกระทำสำคัญ (เข้าสู่ระบบ อนุมัติ ลบ SOS ส่งออก เปลี่ยนค่าตั้ง) ถูกบันทึกใน audit log',
      'ใช้งานผ่าน HTTPS/WSS เท่านั้น (nginx + Let\'s Encrypt) · พอร์ตแอปเปิดเฉพาะภายในเครื่อง',
    ]} />
  </>
);

// ---------- เครือข่าย ----------
const Network: React.FC = () => (
  <>
    <H2>Network diagram</H2>
    <Mermaid caption="เส้นทางข้อมูลจากอุปกรณ์ผู้ใช้ถึงเซิร์ฟเวอร์" chart={`
flowchart LR
  subgraph U["อุปกรณ์ผู้ใช้ (มือถือ / คอม)"]
    B["เบราว์เซอร์ / PWA<br/>React SPA"]
    MIC["ไมโครโฟน · ลำโพง"]
    GPS["GPS · แบตเตอรี่"]
    CAM["กล้อง (รูป / สแกน QR)"]
    MIC --- B
    GPS --- B
    CAM --- B
  end
  DNS["DNS<br/>ptt.napaphon.cloud"]
  subgraph S["เซิร์ฟเวอร์ Linux"]
    NG["nginx<br/>:80 → redirect HTTPS<br/>:443 TLS (Let's Encrypt)<br/>proxy + WebSocket upgrade"]
    subgraph D["Docker: ptt-web"]
      APP["Node.js 22<br/>Express + ws<br/>:8080"]
    end
    VOL[("Docker volume /data<br/>ptt.db · audio/ · files/ · avatars/")]
    NG -- "127.0.0.1 (ภายในเครื่อง)" --> APP
    APP --> VOL
  end
  B -. "ขั้น 1: หา IP" .-> DNS
  B == "ขั้น 2: HTTPS /api, หน้าเว็บ" ==> NG
  B == "ขั้น 3: WSS /ws (เสียง + เหตุการณ์)" ==> NG
  OSM["OpenStreetMap tiles"]
  GF["Google Fonts"]
  SR["บริการรู้จำเสียงของเบราว์เซอร์"]
  B -. "แผนที่" .-> OSM
  B -. "ฟอนต์" .-> GF
  B -. "ถอดเสียง (ถ้าเปิด)" .-> SR
`} />
    <Table head={['การเชื่อมต่อ', 'โปรโตคอล / พอร์ต', 'ใช้ทำอะไร']} rows={[
      ['เบราว์เซอร์ → nginx', 'HTTPS 443', 'หน้าเว็บ, REST API /api/*, ไฟล์เสียง/รูป'],
      ['เบราว์เซอร์ → nginx', 'WSS 443 (/ws)', 'เสียงสด, presence, ข้อความใหม่, ตำแหน่ง, SOS, ค่าตั้งแอป'],
      ['เบราว์เซอร์ → nginx', 'HTTP 80', 'redirect ไป HTTPS และต่ออายุใบรับรอง'],
      ['nginx → แอป', 'HTTP ภายในเครื่อง (localhost)', 'reverse proxy, รองรับ WebSocket upgrade, timeout 1 ชั่วโมง'],
      ['แอป → ดิสก์', 'Docker volume', 'ฐานข้อมูล SQLite และไฟล์'],
      ['เบราว์เซอร์ → OSM / Google Fonts', 'HTTPS', 'ภาพแผนที่และฟอนต์ (ไม่ผ่านเซิร์ฟเวอร์เรา)'],
    ]} />
    <Note>เสียงพูดวิ่ง <b>ผ่านเซิร์ฟเวอร์</b> เสมอ (ไม่ใช่ peer-to-peer) จึงบันทึกประวัติ ตรวจสิทธิ์ และใช้งานหลัง NAT/4G ได้โดยไม่ต้องตั้งค่าเพิ่ม</Note>
  </>
);

// ---------- Flow diagrams ----------
const Flows: React.FC = () => (
  <>
    <H2>สมัครสมาชิก</H2>
    <Mermaid chart={`
flowchart TD
  A(["สมัครสมาชิก"]) --> B{"สมัครในนาม"}
  B -- "บุคคลทั่วไป" --> C["สร้างบัญชี + รหัส QR ส่วนตัว"]
  B -- "เข้าร่วมองค์กร" --> D["ใส่รหัส / สแกน QR องค์กร"]
  B -- "เปิดองค์กรใหม่" --> E["ตั้งชื่อองค์กร"]
  D --> D1{"องค์กรเปิดใช้งาน?"}
  D1 -- "ไม่" --> X["แจ้งรหัสไม่ถูกต้อง"]
  D1 -- "ใช่" --> D2["สถานะ: รอแอดมินกดรับ"]
  E --> E1["สร้างองค์กร (รออนุมัติ)<br/>+ ห้องรวม + ฉุกเฉิน<br/>ผู้สมัคร = แอดมินองค์กร"]
  C --> J["เข้าห้องที่ตั้งเป็น 'เข้าร่วมอัตโนมัติ'"]
  D2 --> J
  E1 --> J
  J --> K(["เข้าใช้งาน"])
  D2 -. "แอดมินกดรับ" .-> L["เข้าห้องเริ่มต้นขององค์กร"]
  E1 -. "Super admin อนุมัติ" .-> M["องค์กรใช้งานได้"]
`} />

    <H2>สแกน QR / เปิดลิงก์เชิญ</H2>
    <Mermaid chart={`
flowchart TD
  A(["สแกน QR / เปิด /i/รหัส"]) --> L{"เข้าสู่ระบบแล้ว?"}
  L -- "ยัง" --> R["หน้าสมัคร/เข้าสู่ระบบ<br/>(QR องค์กร: เลือกเข้าร่วมองค์กรให้อัตโนมัติ)"]
  R --> L
  L -- "แล้ว" --> T{"รหัสเป็นของ"}
  T -- "ผู้ใช้" --> U1{"นโยบายองค์กรอนุญาต?"}
  U1 -- "ใช่" --> U2["เป็นเพื่อนกันทั้งสองฝ่าย → เปิดแชท 1:1"]
  U1 -- "ไม่" --> NO["แจ้งเพิ่มไม่ได้"]
  T -- "กลุ่ม" --> G{"ประเภทกลุ่ม"}
  G -- "สาธารณะ" --> G1["เข้ากลุ่มทันที"]
  G -- "องค์กร (เปิด)" --> G2{"เป็นสมาชิกองค์กร?"}
  G2 -- "ใช่" --> G1
  G2 -- "ไม่" --> NO
  G -- "องค์กร (ส่วนตัว)" --> G3["ส่งคำขอ → ผู้ดูแลช่อง/แอดมินกดรับ"]
  T -- "องค์กร" --> O1["ส่งคำขอเข้าองค์กร → แอดมินกดรับ"]
`} />

    <H2>กดพูดและจองช่อง</H2>
    <Mermaid chart={`
flowchart TD
  A(["กดปุ่มพูด / Space / ปุ่มหูฟัง"]) --> B["ปลดล็อกเสียง + เปิดไมค์ (ครั้งแรก)"]
  B --> C["ส่ง talk-start"]
  C --> D{"มีสิทธิ์พูดในช่อง?"}
  D -- "ไม่ (ฟังอย่างเดียว/ไม่ใช่สมาชิก)" --> X["talk-denied"]
  D -- "ใช่" --> E{"มีคนพูดอยู่?"}
  E -- "ใช่ และไม่ใช่ SOS" --> Y["talk-denied + เสียงไม่ว่าง"]
  E -- "ใช่ แต่เป็น SOS" --> F["ตัดคนเดิม"]
  E -- "ไม่" --> G["talk-granted + บี๊บ"]
  F --> G
  G --> H["ส่งเสียงทุก 100 ms → เซิร์ฟเวอร์ relay ให้ผู้ฟัง"]
  H --> I{"ปล่อยปุ่ม / ครบเวลา / หลุด"}
  I --> J["talk-end → บันทึก WAV → ข้อความเสียงในช่อง"]
  J --> K["(ถ้าเปิด) ส่งคำถอดเสียงตามไป"]
`} />

    <H2>SOS</H2>
    <Mermaid chart={`
flowchart TD
  A(["กด SOS ค้าง 1.5 วินาที"]) --> B["อ่านพิกัด GPS (≤ 5 วินาที)"]
  B --> C{"เป็นสมาชิกองค์กรที่ใช้งานอยู่?"}
  C -- "ใช่" --> D["ช่องฉุกเฉินขององค์กร"]
  C -- "ไม่" --> E["ช่องฉุกเฉินสาธารณะ"]
  D --> F["บันทึกเหตุ + ข้อความ SOS พร้อมพิกัด"]
  E --> F
  F --> G["แจ้งสมาชิกช่องฉุกเฉิน + เจ้าหน้าที่องค์กร + Super admin"]
  G --> H["ไซเรน + แถบเตือนเต็มจอ + แจ้งเตือนเครื่อง"]
  F --> I["เปิดไมค์ส่งเสียงสดอัตโนมัติ (ตามค่าตั้ง)"]
  H --> J{"ผู้รับ"}
  J -- "รับเรื่อง" --> K["หยุดไซเรน · คิว: รับเรื่องแล้ว"]
  J -- "ปิดเหตุ" --> L["ออกจากคิว SOS"]
`} />

    <H2>สิทธิ์เห็นช่องและข้อความย้อนหลัง</H2>
    <Mermaid chart={`
flowchart TD
  A(["เปิดช่อง"]) --> S{"Super admin?"}
  S -- "ใช่" --> ALL["เห็นทุกอย่าง"]
  S -- "ไม่" --> O{"ช่องขององค์กร?"}
  O -- "ใช่" --> O1{"สมาชิกองค์กรที่อนุมัติแล้ว<br/>และองค์กรเปิดใช้งาน?"}
  O1 -- "ไม่" --> NO["ไม่พบช่อง"]
  O1 -- "ใช่" --> O2{"ช่องเปิด หรือเป็นสมาชิกช่อง<br/>หรือเป็นเจ้าหน้าที่?"}
  O2 -- "ไม่" --> NO
  O2 -- "ใช่" --> H
  O -- "ไม่ (สาธารณะ)" --> P1{"ใช้โลกสาธารณะได้?"}
  P1 -- "ไม่" --> NO
  P1 -- "ใช่" --> H{"ช่องสาธารณะ หรือ ฉุกเฉิน?"}
  H -- "ไม่" --> FULL["เห็นข้อความทั้งหมด"]
  H -- "ใช่ และเป็นเจ้าหน้าที่องค์กร" --> FULL
  H -- "ใช่" --> J["เห็นตั้งแต่เวลาที่เข้าร่วม"]
`} />
  </>
);

// ---------- Sequence diagrams ----------
const Sequences: React.FC = () => (
  <>
    <H2>เข้าสู่ระบบและเชื่อมต่อ realtime</H2>
    <Mermaid chart={`
sequenceDiagram
  actor U as ผู้ใช้
  participant B as เบราว์เซอร์
  participant N as nginx
  participant S as แอป (Express + ws)
  participant D as SQLite
  B->>N: GET /api/config
  N->>S: proxy
  S-->>B: ชื่อแอป สี ธีม ค่าตั้ง
  U->>B: กรอกชื่อผู้ใช้ / รหัสผ่าน
  B->>S: POST /api/auth/login
  S->>D: ตรวจ bcrypt + บันทึก audit
  S-->>B: JWT + ข้อมูลตัวเอง
  B->>S: WSS /ws?token=JWT (upgrade ผ่าน nginx)
  S->>D: รายการช่องที่มีสิทธิ์
  S-->>B: hello (ช่อง, ผู้ออนไลน์)
  S-->>B: presence (แจ้งทุกคนว่าออนไลน์)
  loop ทุก 30 วินาที
    S->>B: ping
    B-->>S: pong
  end
`} />

    <H2>กดพูด (A พูด, B ฟัง)</H2>
    <Mermaid chart={`
sequenceDiagram
  actor A as ผู้พูด A
  participant S as เซิร์ฟเวอร์
  actor B as ผู้ฟัง B
  A->>S: talk-start {channelId}
  S->>S: ตรวจสิทธิ์ + จองช่อง
  S-->>A: talk-granted {maxMs}
  S-->>B: talk-start {user}
  Note over B: บี๊บ + แถบ "A กำลังพูด"
  loop ทุก 100 ms
    A->>S: binary PCM 3,200 bytes
    S->>B: binary [channelId][PCM]
    Note over B: jitter buffer 150 ms → ลำโพง
  end
  A->>S: talk-stop
  S->>S: รวมเป็น WAV + บันทึกข้อความเสียง
  S-->>A: talk-saved {messageId}
  S-->>B: message (ข้อความเสียง) + talk-end
  A->>S: transcript {messageId, text}
  S-->>B: message-update (คำถอดเสียง)
`} />

    <H2>SOS</H2>
    <Mermaid chart={`
sequenceDiagram
  actor U as ผู้แจ้ง
  participant B as เบราว์เซอร์ผู้แจ้ง
  participant S as เซิร์ฟเวอร์
  actor R as ผู้รับ (ช่องฉุกเฉิน / ศูนย์สั่งการ)
  U->>B: กด SOS ค้าง 1.5 วินาที
  B->>B: อ่านพิกัด GPS
  B->>S: POST /api/sos {lat, lng}
  S->>S: บันทึกเหตุ + ข้อความ SOS + audit
  S-->>R: sos {alert}
  Note over R: ไซเรน + แถบเตือน + แจ้งเตือน
  S-->>B: {channelId}
  B->>S: talk-start {sos: true}
  S-->>B: talk-granted (แทรกคนที่พูดอยู่ได้)
  B->>S: เสียงสด (ตามเวลาที่ตั้ง)
  S->>R: เสียงสด
  R->>S: POST /api/alerts/:id/ack
  S-->>B: alert-update (มีคนรับเรื่องแล้ว)
  S-->>R: alert-update (หยุดไซเรน)
  R->>S: POST /api/alerts/:id/resolve
`} />

    <H2>ขอเข้าองค์กรและอนุมัติ</H2>
    <Mermaid chart={`
sequenceDiagram
  actor M as ผู้ขอเข้า
  participant S as เซิร์ฟเวอร์
  actor A as แอดมินองค์กร
  M->>S: สมัคร (เข้าร่วมองค์กร, รหัส) หรือสแกน QR องค์กร
  S->>S: org_status = pending + สร้างคำขอ
  S-->>A: requests (มีคำขอใหม่)
  Note over A: ป้ายตัวเลขที่เมนู "องค์กร"
  A->>S: GET /api/requests
  A->>S: POST /api/requests/:id/approve
  S->>S: org_status = active + เข้าห้องเริ่มต้นขององค์กร
  S-->>M: request-decided + me + channels
  Note over M: เห็นช่องขององค์กรทันที
`} />

    <H2>เพิ่มเพื่อนด้วย QR</H2>
    <Mermaid chart={`
sequenceDiagram
  actor A as เจ้าของ QR
  actor B as ผู้สแกน
  participant S as เซิร์ฟเวอร์
  A->>B: แสดง QR ของฉัน (/i/รหัส)
  B->>S: GET /api/invite/รหัส
  S-->>B: ข้อมูลผู้ใช้ + อนุญาตหรือไม่
  B->>S: POST /api/invite/รหัส/accept
  S->>S: friendships ทั้งสองทิศ
  S-->>A: friends (รายชื่อเพื่อนอัปเดต)
  B->>S: POST /api/direct/:userId
  S-->>B: channelId ของแชท 1:1
`} />

    <H2>ส่งรูปหลายรูป</H2>
    <Mermaid chart={`
sequenceDiagram
  actor U as ผู้ส่ง
  participant B as เบราว์เซอร์
  participant S as เซิร์ฟเวอร์
  actor O as คนในช่อง
  U->>B: เลือก/ถ่าย/วางรูป (สูงสุด 10)
  B->>B: ย่อรูป ≤ 1600px (JPEG)
  loop ทีละรูป
    B->>S: POST /api/channels/:id/images (คำบรรยายแนบรูปสุดท้าย)
    S->>S: บันทึกไฟล์ + ข้อความ
    S-->>O: message (image)
  end
  O->>S: GET /api/messages/:id/file (แนบ token)
  S-->>O: รูป (ตรวจสิทธิ์ก่อน)
`} />

    <H2>แชร์ตำแหน่ง</H2>
    <Mermaid chart={`
sequenceDiagram
  participant B as เบราว์เซอร์
  participant S as เซิร์ฟเวอร์
  participant D as SQLite
  actor T as เพื่อน / ทีม / เจ้าหน้าที่
  B->>B: watchPosition + ระดับแบตเตอรี่
  loop ทุก ≥ 5 วินาที เมื่อมีตำแหน่งใหม่
    B->>S: location {lat, lng, speed, battery}
    S->>D: ตำแหน่งล่าสุด (+ จุดเส้นทางทุก 15 วินาที)
    S-->>T: location (เฉพาะคนที่มีสิทธิ์เห็น)
  end
  T->>S: GET /api/users/:id/track?since=
  S-->>T: จุดเส้นทาง
`} />

    <H2>Super admin เปลี่ยนค่าตั้งแอป</H2>
    <Mermaid chart={`
sequenceDiagram
  actor SA as Super admin
  participant S as เซิร์ฟเวอร์
  actor All as ทุกคนที่ออนไลน์
  SA->>SA: เลือกสี/ธีม (พรีวิวในเครื่อง)
  SA->>S: PATCH /api/admin/settings
  S->>S: ตรวจค่า + บันทึก + audit
  S-->>All: config (ชื่อ สี ธีม โลโก้)
  Note over All: หน้าจอเปลี่ยนทันทีโดยไม่ต้องรีเฟรช
`} />
  </>
);

// ---------- API ----------
const Api: React.FC = () => (
  <>
    <H2>REST API (ต้องแนบ <Code>Authorization: Bearer &lt;JWT&gt;</Code>)</H2>
    <Table head={['กลุ่ม', 'Endpoint หลัก']} rows={[
      ['บัญชี', <><Code>POST /api/auth/register</Code> <Code>POST /api/auth/login</Code> <Code>GET/PATCH /api/me</Code> <Code>POST/DELETE /api/me/avatar</Code> <Code>POST /api/me/org/join|create|leave</Code></>],
      ['ผู้ใช้ / เพื่อน', <><Code>GET /api/users?q=</Code> <Code>GET /api/users/:id/profile</Code> <Code>POST/DELETE /api/friends/:id</Code></>],
      ['ลิงก์เชิญ / QR', <><Code>GET /api/invite/:code</Code> <Code>POST /api/invite/:code/accept</Code></>],
      ['ช่อง', <><Code>GET/POST /api/channels</Code> <Code>GET/PATCH/DELETE /api/channels/:id</Code> <Code>POST /api/channels/:id/join|leave|read|purge</Code> <Code>/members</Code> <Code>/avatar</Code> <Code>/invite/reset</Code> <Code>POST /api/direct/:userId</Code></>],
      ['ข้อความ', <><Code>GET/POST /api/channels/:id/messages</Code> <Code>POST /api/channels/:id/images</Code> <Code>GET /api/messages/:id/file</Code> <Code>DELETE /api/messages/:id</Code> <Code>POST /api/messages/delete</Code></>],
      ['องค์กร', <><Code>GET/PATCH /api/org</Code> <Code>/api/org/members</Code> <Code>/api/org/code/reset</Code> <Code>/api/org/stats</Code> <Code>/api/org/audit</Code> <Code>GET /api/requests</Code> <Code>POST /api/requests/:id/approve|reject</Code></>],
      ['ตำแหน่ง / SOS', <><Code>GET /api/locations</Code> <Code>GET /api/users/:id/track</Code> <Code>POST /api/sos</Code> <Code>GET /api/alerts</Code> <Code>POST /api/alerts/:id/ack|resolve</Code></>],
      ['คลังข้อความ', <><Code>GET /api/vault</Code> <Code>GET /api/vault/export.csv</Code> <Code>POST /api/vault/purge</Code></>],
      ['Super admin', <><Code>/api/admin/orgs</Code> <Code>/api/admin/users</Code> <Code>/api/admin/audit</Code> <Code>/api/admin/stats</Code> <Code>/api/admin/settings</Code></>],
      ['สาธารณะ', <><Code>GET /api/config</Code> <Code>GET /api/avatars/:file</Code> <Code>GET /manifest.webmanifest</Code> <Code>GET /healthz</Code></>],
    ]} />

    <H2>WebSocket <Code>/ws?token=JWT</Code></H2>
    <Table head={['ทิศทาง', 'ข้อความ', 'ความหมาย']} rows={[
      ['→ เซิร์ฟเวอร์', <Code>watch · monitor</Code>, 'เปิดดูช่อง / ศูนย์สั่งการเฝ้าทุกช่อง'],
      ['→ เซิร์ฟเวอร์', <Code>talk-start · talk-stop · binary PCM</Code>, 'ขอพูด หยุดพูด และเสียง'],
      ['→ เซิร์ฟเวอร์', <Code>transcript · status · location</Code>, 'คำถอดเสียง สถานะพร้อม/ไม่ว่าง ตำแหน่ง'],
      ['← ผู้ใช้', <Code>hello · channels · presence · me · user · config</Code>, 'ข้อมูลเริ่มต้น รายการช่อง ผู้ออนไลน์ โปรไฟล์ ค่าตั้งแอป'],
      ['← ผู้ใช้', <Code>talk-granted · talk-denied · talk-start · talk-end · talk-saved · binary</Code>, 'สิทธิ์พูดและเสียงสด [channelId][PCM]'],
      ['← ผู้ใช้', <Code>message · message-update · message-delete · messages-delete</Code>, 'ข้อความใหม่/แก้ไข/ลบ'],
      ['← ผู้ใช้', <Code>location · sos · alert-update</Code>, 'ตำแหน่งทีมและเหตุฉุกเฉิน'],
      ['← ผู้ใช้', <Code>requests · request-decided · friends · org-request · channel-removed</Code>, 'คำขอ การอนุมัติ เพื่อน ช่องถูกลบ'],
    ]} />

    <H2>การติดตั้งเอง</H2>
    <UL items={[
      <>คัดลอก <Code>.env.example</Code> เป็น <Code>.env</Code> แล้วตั้ง <Code>JWT_SECRET</Code> และ <Code>ADMIN_PASSWORD</Code></>,
      <>รัน <Code>docker compose up -d --build</Code> (แอปฟังที่ <Code>127.0.0.1:8090</Code>)</>,
      <>ตั้ง reverse proxy ที่มี TLS และส่งต่อ WebSocket ที่ path <Code>/ws</Code> (ตัวอย่าง nginx อยู่ใน README)</>,
      <>ข้อมูลทั้งหมดอยู่ใน volume <Code>/data</Code> — สำรองด้วยการ tar โฟลเดอร์นี้</>,
    ]} />
  </>
);

const TABS = [
  { key: 'guide', label: 'วิธีใช้งาน', el: <Guide /> },
  { key: 'arch', label: 'สถาปัตยกรรม', el: <Architecture /> },
  { key: 'network', label: 'Network', el: <Network /> },
  { key: 'flow', label: 'Flow', el: <Flows /> },
  { key: 'sequence', label: 'Sequence', el: <Sequences /> },
  { key: 'api', label: 'API', el: <Api /> },
] as const;

const Info: React.FC<{ standalone?: boolean }> = ({ standalone }) => {
  const [params, setParams] = useSearchParams();
  const config = useStore((s) => s.config);
  const tab = TABS.find((t) => t.key === params.get('tab')) || TABS[0];
  useEffect(() => { document.getElementById('info-scroll')?.scrollTo({ top: 0 }); }, [tab.key]);
  const [, force] = useState(0);
  useEffect(() => force((n) => n + 1), [config.primaryColor]);

  return (
    <div id="info-scroll" className={`flex-1 min-h-0 overflow-y-auto ${standalone ? 'h-[100dvh] bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100' : ''}`}>
      <header className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          {standalone && <Link to="/login" className="p-1.5 -ml-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="กลับ"><ArrowLeftIcon className="w-5 h-5" /></Link>}
          <AppLogo className="w-8 h-8" />
          <h1 className="text-lg font-bold flex-1 truncate">ข้อมูล {config.appName}</h1>
        </div>
        <nav className="max-w-4xl mx-auto px-2 flex gap-1 overflow-x-auto text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={`px-3 py-2 border-b-2 whitespace-nowrap font-medium ${tab.key === t.key ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <article className={`max-w-4xl mx-auto p-4 sm:p-6 pb-16`}>
        <div className={`${card} p-4 sm:p-6`}>{tab.el}</div>
      </article>
    </div>
  );
};

export default Info;
