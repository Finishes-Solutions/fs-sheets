// Monochrome SVG charts (no colored chrome). Values are labelled so the chart reads without color.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function budgetActualChart(items,{format=v=>String(v),width=640}={}){
 const rows=items.filter(x=>x.budget!=null||x.actual!=null);if(!rows.length)return '';
 const label=170,valueW=110,plot=width-label-valueW-16,barH=11,gap=8,rowH=barH*2+gap+10,height=rows.length*rowH+28;
 const max=Math.max(1,...rows.flatMap(x=>[x.budget||0,x.actual||0]));const w=v=>Math.max(v>0?2:0,Math.round((Math.max(0,v||0)/max)*plot));
 const body=rows.map((x,i)=>{const y=i*rowH+24,over=x.budget!=null&&x.actual!=null&&x.actual>x.budget;return `<g><title>${esc(x.name)}: budget ${esc(format(x.budget))}, actual ${esc(format(x.actual))}</title><text x="0" y="${y+barH+2}" class="chart-label">${esc(x.name.length>26?x.name.slice(0,25)+'…':x.name)}</text><rect x="${label}" y="${y}" width="${w(x.budget)}" height="${barH}" rx="2" class="bar-budget"/><rect x="${label}" y="${y+barH+3}" width="${w(x.actual)}" height="${barH}" rx="2" class="bar-actual ${over?'over':''}"/><text x="${width-valueW}" y="${y+barH-1}" class="chart-value">${esc(format(x.budget))}</text><text x="${width-valueW}" y="${y+barH*2+2}" class="chart-value ${over?'over':''}">${esc(format(x.actual))}${over?' ▲':''}</text></g>`;}).join('');
 return `<svg class="budget-chart" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Budget versus actual by project"><g class="chart-legend"><rect x="${label}" y="2" width="10" height="10" rx="2" class="bar-budget"/><text x="${label+16}" y="11">Budget</text><rect x="${label+80}" y="2" width="10" height="10" rx="2" class="bar-actual"/><text x="${label+96}" y="11">Actual (▲ over budget)</text></g>${body}</svg>`;
}

// ---- Dashboard widget charts (monochrome; every value is labelled) ----
const SHADES=['#1d1d1f','#4a4a4f','#727277','#9a9a9f','#bdbdc2','#d9d9dd','#ececef','#f5f5f7'];
export function barChart(points,{format=String,width=520,title=''}={}){
 if(!points?.length)return '<p class="chart-empty">No data yet.</p>';
 const label=150,valueW=90,plot=width-label-valueW-12,barH=16,gap=10,height=points.length*(barH+gap)+8,max=Math.max(1,...points.map(p=>Math.abs(p.value)));
 return `<svg class="widget-chart" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(title)}">${points.map((p,i)=>{const y=i*(barH+gap)+4,w=Math.max(p.value?2:0,Math.round(Math.abs(p.value)/max*plot));return `<g><title>${esc(p.label)}: ${esc(format(p.value))}</title><text x="0" y="${y+barH-3}" class="chart-label">${esc(p.label.length>22?p.label.slice(0,21)+'…':p.label)}</text><rect x="${label}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${i===0?'#1d1d1f':'#727277'}"/><text x="${label+w+6}" y="${y+barH-3}" class="chart-value">${esc(format(p.value))}</text></g>`;}).join('')}</svg>`;
}
export function lineChart(points,{format=String,width=520,height=200,title=''}={}){
 if(!points?.length)return '<p class="chart-empty">No data yet.</p>';
 const padL=56,padB=24,padT=14,padR=12,w=width-padL-padR,h=height-padB-padT,max=Math.max(1,...points.map(p=>p.value)),min=Math.min(0,...points.map(p=>p.value));
 const x=i=>padL+(points.length===1?w/2:i*w/(points.length-1)),y=v=>padT+h-(v-min)/(max-min||1)*h;
 const path=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
 const ticks=[min,(min+max)/2,max];
 return `<svg class="widget-chart" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(title)}">${ticks.map(t=>`<line x1="${padL}" x2="${width-padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL-6}" y="${y(t)+4}" text-anchor="end" class="chart-axis">${esc(format(t))}</text>`).join('')}<path d="${path}" fill="none" stroke="#1d1d1f" stroke-width="2"/>${points.map((p,i)=>`<g><title>${esc(p.label)}: ${esc(format(p.value))}</title><circle cx="${x(i)}" cy="${y(p.value)}" r="3.5" fill="#fff" stroke="#1d1d1f" stroke-width="2"/>${points.length<=12||i%Math.ceil(points.length/12)===0?`<text x="${x(i)}" y="${height-6}" text-anchor="middle" class="chart-axis">${esc(p.label)}</text>`:''}</g>`).join('')}</svg>`;
}
export function donutChart(points,{format=String,title=''}={}){
 const pts=(points||[]).filter(p=>p.value>0);if(!pts.length)return '<p class="chart-empty">No data yet.</p>';
 const total=pts.reduce((a,p)=>a+p.value,0),r=60,c=2*Math.PI*r;let off=0;
 const arcs=pts.map((p,i)=>{const len=p.value/total*c,el=`<circle r="${r}" cx="80" cy="80" fill="none" stroke="${SHADES[i%SHADES.length]}" stroke-width="26" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"><title>${esc(p.label)}: ${esc(format(p.value))} (${Math.round(p.value/total*100)}%)</title></circle>`;off+=len;return el;}).join('');
 return `<div class="donut-wrap"><svg class="widget-donut" viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="${esc(title)}">${arcs}<text x="80" y="78" text-anchor="middle" class="donut-total">${esc(format(total))}</text><text x="80" y="96" text-anchor="middle" class="chart-axis">total</text></svg><ul class="donut-legend">${pts.map((p,i)=>`<li><i style="background:${SHADES[i%SHADES.length]}"></i><span>${esc(p.label)}</span><b>${esc(format(p.value))}</b><small>${Math.round(p.value/total*100)}%</small></li>`).join('')}</ul></div>`;
}
