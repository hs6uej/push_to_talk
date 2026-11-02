import React from 'react';
import { RadioIcon } from 'lucide-react';
import ChannelList from '../components/ChannelList';
import ContactList from '../components/ContactList';

// จอใหญ่: รายการอยู่ในแผงซ้ายแล้ว จึงแสดงข้อความแนะนำแทน
const Placeholder: React.FC<{ text: string }> = ({ text }) => (
  <div className="hidden lg:flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
    <span className="w-20 h-20 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
      <RadioIcon className="w-10 h-10" />
    </span>
    <p>{text}</p>
    <p className="text-xs">ในช่อง กด Space ค้างไว้เพื่อพูด</p>
  </div>
);

export const Home: React.FC = () => (
  <>
    <div className="lg:hidden flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900"><ChannelList /></div>
    <Placeholder text="เลือกช่องทางซ้ายเพื่อเริ่มคุย" />
  </>
);

export const Contacts: React.FC = () => (
  <>
    <div className="lg:hidden flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900"><ContactList /></div>
    <Placeholder text="เลือกรายชื่อทางซ้ายเพื่อคุยแบบ 1:1" />
  </>
);
