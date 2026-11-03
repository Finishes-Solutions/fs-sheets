export function normalizeDate(value,withTime=false){
 const text=expandDateShortcut(String(value??'').trim());if(!text)return '';
 const m=text.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))(?:[T ](\d{1,2}):(\d{2}))?$/);
 if(!m)throw Error('Enter a date as MM/DD/YYYY or YYYY-MM-DD.');
 const y=Number(m[1]||m[6]),mo=Number(m[2]||m[4]),d=Number(m[3]||m[5]),h=Number(m[7]||0),min=Number(m[8]||0);
 const dt=new Date(0);dt.setUTCFullYear(y,mo-1,d);dt.setUTCHours(0,0,0,0);
 if(y<1||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d||h>23||min>59||(!withTime&&m[7]))throw Error('Enter a valid calendar date'+(withTime?' and time.':'.'));
 const date=`${String(y).padStart(4,'0')}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 return date+(withTime?`T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`:'');
}
export function monthDays(year,month){const first=new Date(0);first.setUTCFullYear(year,month,1);first.setUTCHours(0,0,0,0);return Array.from({length:42},(_,i)=>{const d=new Date(first);d.setUTCDate(i-first.getUTCDay()+1);return {value:d.toISOString().slice(0,10),day:d.getUTCDate(),current:d.getUTCMonth()===month};});}

export function expandDateShortcut(text,now=new Date()){
 const key=text.toLowerCase().trim(),d=new Date(now.getFullYear(),now.getMonth(),now.getDate());let offset=null;
 const offsets={t:0,tom:1,'^yes':-1,'last week':-7,'next week':7};
 if(Object.hasOwn(offsets,key))offset=offsets[key];else if(/^[+-]\d+$/.test(key))offset=Number(key);
 const weekdays={sun:0,mon:1,tue:2,wed:3,thu:4,thurs:4,fri:5,sat:6};if(Object.hasOwn(weekdays,key))offset=weekdays[key]-d.getDay();
 if(offset!==null){if(Math.abs(offset)>365000)return text;d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
 const m=key.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})$/);if(m)return `${d.getFullYear()}-${String(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[1])+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
 return text;
}
