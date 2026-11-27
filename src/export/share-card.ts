import type { FriendsPageData, NewFriendEntry } from '../data/friends-data';
import type { WorldsPageData, WorldEntry } from '../data/worlds-data';
import type { RecordPageData } from '../data/record-pages';
import type { TimelineLoadResult } from '../data/timeline-query';
export type ShareCardKind = 'worlds' | 'friends' | 'stats' | 'highlights';
export const defaultShareColors=(kind: ShareCardKind)=>({gradientColor:kind==='friends' ? '#c54888' : '#1c605a',shadowColor:kind==='friends' ? '#1c605a' : '#c54888'});
export interface ShareCardData {
  worlds?: readonly WorldsPageData[];
  friends?: readonly FriendsPageData[];
  records?: readonly RecordPageData[];
  timeline?: TimelineLoadResult;
}
export interface ShareFriendRegion { userId: string; name: string; x: number; y: number; width: number; height: number; circle: boolean }
export interface ShareCardOptions { onFriendRegion?: (region: ShareFriendRegion) => void; name: string; picture?: HTMLImageElement; friendNames: boolean; gradientColor?: string; shadowColor?: string; worldImages?: ReadonlyMap<string, HTMLImageElement>; friendImages?: ReadonlyMap<string, HTMLImageElement> }
const number = (value: number | undefined, digits = 0) => value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('de-DE', { maximumFractionDigits: digits });
const sum = (values: readonly { value: number | null }[] | undefined) => values?.some(v => v.value !== null) ? values.reduce((n,v) => n + (v.value ?? 0), 0) : undefined;

/** The canvas is both preview and export, so the downloaded PNG has the same layout. */
export function drawShareCard(canvas: HTMLCanvasElement, kind: ShareCardKind, data: ShareCardData, options: ShareCardOptions) {
  const outerMargin=20;
  const cardHeight=kind==='highlights' ? 2440 : 1350;
  canvas.width = 1080+outerMargin*2; canvas.height = cardHeight+outerMargin*2;
  delete canvas.dataset.worldsWinnerLayout;
  delete canvas.dataset.friendsWinnerLayout;
  const c = canvas.getContext('2d')!;
  c.save();c.translate(outerMargin,outerMargin);
  const spoken: string[] = [];
  function friendRegion(entry: {userId: string; name: string} | undefined, x: number, y: number, width: number, height: number, circle: boolean) {
    if (!entry || !options.onFriendRegion) return;
    const transform = c.getTransform();
    options.onFriendRegion({userId: entry.userId, name: entry.name, x: x + transform.e, y: y + transform.f, width, height, circle});
  }
  const validColor = (value: string | undefined, fallback: string) => value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const defaults=defaultShareColors(kind);
  const gradientColor = validColor(options.gradientColor, defaults.gradientColor);
  const shadowColor = validColor(options.shadowColor, defaults.shadowColor);
  const accent = shadowColor;
  function text(value: string, x: number, y: number, size = 28, color = '#f7f5f9', weight = '400', max = 940, family = 'Arial, sans-serif') {
    c.save();
    c.font = `${weight} ${size}px ${family}`; c.fillStyle = color;
    if(family.startsWith('Questrial')) {
      c.letterSpacing='.6px';
      c.shadowColor=accent+'80';c.shadowBlur=6;c.shadowOffsetX=0;c.shadowOffsetY=0;
    }
    let fitted = value;
    while (c.measureText(fitted).width > max && fitted.length > 1) fitted = fitted.slice(0,-1);
    if (fitted !== value) fitted = fitted.slice(0,-1) + '…';
    c.fillText(fitted, x, y); spoken.push(value);
    c.restore();
  }
  let frostedBackground: HTMLCanvasElement | undefined;
  function frostedPanel(x: number,y: number,width: number,height: number) {
    if(!frostedBackground) {
      frostedBackground=document.createElement('canvas');
      frostedBackground.width=canvas.width;frostedBackground.height=canvas.height;
      frostedBackground.getContext('2d')!.drawImage(canvas,0,0);
    }
    c.save();c.beginPath();c.roundRect(x,y,width,height,22);c.clip();
    c.save();c.resetTransform();c.filter='blur(3px)';c.drawImage(frostedBackground,0,0);c.restore();
    c.fillStyle='#ffffff04';c.fillRect(x,y,width,height);c.restore();
    c.save();c.strokeStyle='#ffffff26';c.lineWidth=1;
    c.beginPath();c.roundRect(x,y,width,height,22);c.stroke();c.restore();
  }
  function metric(value: number | undefined, label: string, x: number, y: number, width = 300, suffix = '', digits = 0) {
    frostedPanel(x,y,width,146);
    c.save();c.textAlign='center';
    c.save();c.shadowColor=shadowColor;c.shadowOffsetX=3;c.shadowOffsetY=4;
    text(number(value,digits) + (value === undefined ? '' : suffix),x+width/2,y+60,57,'#fff','italic 900',width-44);c.restore();
    c.font='400 27px Questrial, Arial, sans-serif';
    const words=label.split(' ');let row='',rowIndex=0;
    for(const word of words) {
      const candidate=row ? row+' '+word : word;
      if(row && c.measureText(candidate).width+Math.max(0,candidate.length-1)*.6>width-44) {
        text(row,x+width/2,y+104+rowIndex*31,27,'#c4c6cc','400',width-44,'Questrial, Arial, sans-serif');row=word;rowIndex++;
      } else row=candidate;
    }
    if(row)text(row,x+width/2,y+104+rowIndex*31,27,'#c4c6cc','400',width-44,'Questrial, Arial, sans-serif');
    c.restore();
  }
  function summaryRow(summaries: [number | undefined,string][]) {
  c.save();c.font='400 26px Questrial, Arial, sans-serif';c.letterSpacing='.6px';
    const labelWidths=summaries.map(([,label])=>c.measureText(label).width);
    c.restore();
    const labelGap=(984-labelWidths.reduce((total,width)=>total+width,0))/(summaries.length-1);
    let labelLeft=48;
    summaries.forEach(([value,label],index)=>{
      const labelWidth=labelWidths[index]!, x=labelLeft+labelWidth/2;
      labelLeft+=labelWidth+labelGap;
      c.save();c.textAlign='center';
      c.save(); c.shadowColor=shadowColor;c.shadowOffsetX=3;c.shadowOffsetY=4;
      text(number(value),x,370,57,'#fff','italic 900',232);c.restore();
      text(label,x,418,26,'#c4c6cc','400',labelWidth+1,'Questrial, Arial, sans-serif');
      c.restore();
    });
  }
  function worldGlyph(x: number,y: number,width: number,height: number) {
    const cx=x+width/2,cy=y+height/2,radius=Math.min(width,height)*.24;
    c.save();c.strokeStyle='#ffffff30';c.lineWidth=Math.max(1.2,Math.min(2.5,radius/20));
    c.beginPath();c.arc(cx,cy,radius,0,Math.PI*2);c.stroke();
    c.beginPath();c.ellipse(cx,cy,radius*.48,radius,0,0,Math.PI*2);c.stroke();
    c.beginPath();c.moveTo(cx-radius,cy);c.lineTo(cx+radius,cy);c.stroke();c.restore();
  }
  c.fillStyle = '#24252b'; c.fillRect(-outerMargin,-outerMargin,canvas.width,canvas.height);
  const glow = c.createRadialGradient(1020,cardHeight-90,0,1020,cardHeight-90,1000);
  glow.addColorStop(0,gradientColor); glow.addColorStop(1,'#24252b00'); c.fillStyle=glow; c.fillRect(-outerMargin,-outerMargin,canvas.width,canvas.height);
  const topGlow=c.createRadialGradient(60,90,0,60,90,850);
  topGlow.addColorStop(0,shadowColor+'80');topGlow.addColorStop(.45,shadowColor+'30');topGlow.addColorStop(1,shadowColor+'00');
  c.fillStyle=topGlow;c.fillRect(-outerMargin,-outerMargin,canvas.width,canvas.height);
  // Static halftone: larger dark dots as the selected gradient fades out.
  // Paint once into the card itself so preview and PNG have identical dots.
  c.save();c.beginPath();c.rect(25,25,1030,cardHeight-50);c.clip();
  for(let row=0,y=12;y<cardHeight;y+=24,row++) {
    for(let x=12+(row%2)*12;x<1080;x+=24) {
      const distance=Math.min(Math.hypot(x-1020,y-(cardHeight-90))/1000,Math.hypot(x-60,y-90)/850);
      if(distance>=1)continue;
      const radius=.45+4.6*Math.pow(distance,.85);
      const opacity=.38*Math.min(1,(1-distance)/.18);
      c.fillStyle=`rgba(15,17,22,${opacity})`;
      c.beginPath();c.arc(x,y,radius,0,Math.PI*2);c.fill();
    }
  }
  c.restore();
  c.strokeStyle = '#ffffff25'; c.lineWidth=1; c.strokeRect(24.5,24.5,1031,cardHeight-49);
  const cardTitle=kind==='worlds' ? 'YOUR WORLDS' : kind==='friends' ? 'YOUR FRIENDS' : kind==='highlights' ? 'YOUR REWIND' : 'YOUR YEAR';
  c.save();c.shadowColor='#000000b3';c.shadowBlur=8;c.shadowOffsetX=2;c.shadowOffsetY=3;
  text(cardTitle,64,90,44,accent,'700',560);c.restore();
  c.font='italic 900 32px Arial, sans-serif';
  const yearX=974-c.measureText('2026').width/2;
  c.font='700 32px Arial, sans-serif';
  const brandWidth=c.measureText('VRCX REWIND').width;
  text('VRCX REWIND',yearX-8-brandWidth,78,32,'#fff','700',brandWidth+1);
  text('2026',yearX,78,32,accent,'italic 900',150);
  const profileName=options.name.trim() || 'My 2026 in VRChat';
  let profileNameBottom=184, profileCenterX=214;
  c.save();c.shadowColor=gradientColor;c.shadowOffsetX=3;c.shadowOffsetY=4;
  if(kind==='stats') {
    c.font='900 42px Arial, sans-serif';
    profileNameBottom+=Math.max(0,c.measureText(profileName).actualBoundingBoxDescent || 0);
    profileCenterX=64+Math.max(300,Math.min(952,c.measureText(profileName).width))/2;
    c.textAlign='center';
    text(profileName,profileCenterX,184,42,'#fff','900',952);
  } else text(profileName,64,184,42,'#fff','900',750);
  c.restore();
  if (options.picture) {
    // Center the portrait below the name, between its text and the first metric row at y=480.
    const stats=kind==='stats', size=stats ? 240 : 108, x=stats ? profileCenterX-size/2 : 900, y=stats ? (profileNameBottom+480-size)/2 : 116;
    c.save(); c.beginPath();
    c.roundRect(x,y,size,size,20);
    c.clip();
    const im = options.picture, side = Math.min(im.naturalWidth,im.naturalHeight);
    c.drawImage(im,(im.naturalWidth-side)/2,(im.naturalHeight-side)/2,side,side,x,y,size,size); c.restore();
  }
  const w = (id: WorldsPageData['id']) => data.worlds?.find(v=>v.id===id && v.status==='ready');
  const f = (id: FriendsPageData['id']) => data.friends?.find(v=>v.id===id && v.status==='ready');
  const r = (id: RecordPageData['id']) => data.records?.find(v=>v.id===id && v.status==='ready');
  const hours = data.timeline?.ok ? sum(data.timeline.data?.months) : undefined;
  if (kind === 'highlights') {
    const days=sum(data.timeline?.daysData?.timeline.months) ?? sum(r('days')?.timeline?.months);
    c.save();c.textAlign='center';c.save();c.shadowColor=shadowColor;c.shadowOffsetX=5;c.shadowOffsetY=6;
    text(number(hours),540,354,146,'#fff','italic 900',952);c.restore();
    text('hours played',540,414,34,'#dedce2','400',940,'Questrial, Arial, sans-serif');c.restore();
    metric(days,'days played',64,454);
    metric(data.timeline?.sessionCount,'recorded sessions',390,454);
    metric(r('streak')?.value,'longest streak · days',716,454);

    frostedPanel(64,626,952,220);
    text('YOUR YEAR IN HOURS',88,667,24,accent,'700',500);
    c.save();c.textAlign='right';text('* partial month',992,667,18,'#b9bec7','400',300);c.restore();
    const months=data.timeline?.ok ? data.timeline.data?.months : undefined;
    const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const peak=Math.max(1,...(months ?? []).map(month=>month.value ?? 0));
    monthNames.forEach((label,index)=>{
      const month=months?.[index],x=92+index*76,value=month?.value;
      c.save();c.textAlign='center';
      if(value!==null && value!==undefined) {
        const height=Math.max(2,value/peak*88);
        c.fillStyle=accent+'b0';c.beginPath();c.roundRect(x,795-height,46,height,Math.min(7,height/2));c.fill();
        text(number(value)+(month?.partial ? '*' : ''),x+23,785-height,17,'#e9e7ee','700',70);
      } else text('—',x+23,788,22,'#858a96','400',70);
      text(label,x+23,826,20,'#c4c6cc','400',70);c.restore();
    });

    text('PERSONAL RECORDS',64,896,30,accent,'700',952);
    const records: [RecordPageData['id'],string,string][]=[['time','BUSIEST MONTH','h played'],['worlds','MOST WORLDS IN A MONTH','worlds'],['friends','MOST NEW FRIENDS IN A MONTH','friends']];
    records.forEach(([id,label,unit],index)=>{
      const record=r(id),x=64+index*326;
      frostedPanel(x,920,300,150);
      text(label,x+20,955,18,accent,'700',260);
      text(record ? `${number(record.value)} ${unit}` : '—',x+20,1003,39,'#fff','italic 900',260);
      const winners=record?.months?.length ? record.months : record?.month!==null && record?.month!==undefined ? [record.month] : [];
      text(winners.length ? winners.map(month=>monthNames[month]).join(' · ') : record ? 'No monthly record' : 'Not available',x+20,1044,23,'#c4c6cc','400',260);
    });

    function portrait(entry: {name:string;userId?:string;worldId?:string} | undefined,x:number,y:number,size:number) {
      if(entry?.userId)friendRegion({userId:entry.userId,name:entry.name},x,y,size,size,true);
      const image=entry?.worldId ? options.worldImages?.get(entry.worldId) : entry?.userId && options.friendNames ? options.friendImages?.get(entry.userId) : undefined;
      c.save();c.beginPath();c.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);c.clip();
      c.fillStyle='#ffffff0b';c.fillRect(x,y,size,size);
      if(image) {
        const side=Math.min(image.naturalWidth,image.naturalHeight);
        c.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,x,y,size,size);
      } else if(entry?.userId) {
        c.fillStyle='#ffffff25';c.beginPath();c.arc(x+size/2,y+size*.35,size*.16,0,Math.PI*2);c.fill();
        c.beginPath();c.ellipse(x+size/2,y+size*.9,size*.32,size*.29,0,Math.PI,Math.PI*2);c.fill();
      } else worldGlyph(x,y,size,size);
      c.restore();
    }
    function ranking(title:string,x:number,y:number,rows:readonly {name:string;userId?:string;worldId?:string;detail:string}[],ready:boolean) {
      frostedPanel(x,y,464,312);
      text(title,x+20,y+37,22,accent,'700',424);
      if(!rows.length)text(ready ? 'None recorded' : 'Not available',x+20,y+105,25,'#b4b5bf','400',424);
      rows.slice(0,3).forEach((entry,index)=>{
        const rowY=y+62+index*78;
        portrait(entry,x+20,rowY,60);
        text(String(index+1).padStart(2,'0'),x+96,rowY+20,17,'#aeb3bc','700',28);
        text(entry.userId && !options.friendNames ? `Friend #${index+1}` : entry.name,x+136,rowY+23,25,'#fff','700',308);
        text(entry.userId && !options.friendNames ? 'Name and details hidden' : entry.detail,x+136,rowY+53,23,'#b9bec7','400',308);
      });
    }
    function sectionTotals(values:[number|undefined,string][],y:number) {
      text(values.map(([value,label])=>`${number(value)} ${label}`).join('   ·   '),64,y,24,'#c4c6cc','400',952,'Questrial, Arial, sans-serif');
    }
    text('THE WORLDS YOU EXPLORED',64,1128,30,accent,'700',952);
    sectionTotals([[w('visits')?.total,'instances visited'],[w('discoveries')?.total,'worlds discovered'],[w('owned')?.total,'instances created']],1172);
    ranking('MOST TIME SPENT',64,1200,w('time')?.entries.slice(0,3).map(entry=>({...entry,detail:`${number(entry.value)} h`})) ?? [],!!w('time'));
    ranking('MOST VISITED',552,1200,w('visits')?.entries.slice(0,3).map(entry=>({...entry,detail:`${number(entry.value)} visits`})) ?? [],!!w('visits'));
    frostedPanel(64,1530,952,105);
    const discovery=w('discoveries')?.entries[0];
    portrait(discovery,84,1550,64);
    text('DISCOVERED THIS YEAR · MOST TIME SPENT',170,1566,19,accent,'700',820);
    text(discovery ? `${discovery.name} · ${number(discovery.value)} h` : w('discoveries') ? 'No newly discovered worlds recorded' : 'Discovery history unavailable',170,1606,27,'#fff','700',820);

    text('THE PEOPLE IN YOUR YEAR',64,1690,30,accent,'700',952);
    sectionTotals([[f('added')?.total,'new friends'],[f('time')?.total,'friends spent time with']],1733);
    for(const [id,title,x] of [['time','MOST TIME TOGETHER',64],['added','NEW FRIENDS BY TIME',552]] as const) {
      const page=f(id);
      ranking(title,x,1760,page?.entries.slice(0,3).map(entry=>({...entry,detail:`${number(entry.seconds/3600)} h together`})) ?? [],page?.rankingStatus==='ready');
    }
    const social: [FriendsPageData['id'],string][]=[['boops','boops received'],['invites','invites received'],['requests','invite requests'],['strangers','strangers crossed paths']];
    social.forEach(([id,label],index)=>metric(f(id)?.total,label,64+index*244,2094,220));
    for(const [id,title,x] of [['overlap','ONLINE AT THE SAME TIME',64],['mutuals','MOST FRIENDS IN COMMON',552]] as const) {
      const page=f(id),entry=page?.entries[0];
      frostedPanel(x,2258,464,112);
      text(title,x+16,2287,19,accent,'700',432);
      if(entry) {
        portrait(entry,x+18,2301,48);
        text(options.friendNames ? entry.name : 'Your top friend',x+84,2317,23,'#fff','700',360);
        const detail=id==='mutuals' ? `${number(entry.value)} mutual friends` : `${number(entry.seconds/3600)} h online together`;
        text(options.friendNames ? detail : 'Name and details hidden',x+84,2347,21,'#b9bec7','400',360);
      } else text(page?.rankingStatus==='ready' ? 'None recorded' : 'Not available',x+18,2332,23,'#b4b5bf','400',428);
    }
    c.save();c.textAlign='center';text('VRCX REWIND 2026 · YOUR YEAR, TOGETHER',540,2406,18,'#b9bec7','700',952);c.restore();
  } else if (kind === 'worlds') {
    c.save();c.translate(0,-70);
    const time=w('time'), visits=w('visits');
    const timeWinner=time?.entries[0], visitWinner=visits?.entries[0];
    const merged=!!timeWinner && timeWinner.worldId===visitWinner?.worldId;
    canvas.dataset.worldsWinnerLayout=merged ? 'merged' : timeWinner || visitWinner ? 'split' : 'empty';
    const summaries: [number | undefined,string][]=[
      [w('discoveries')?.total,'discovered worlds'],[visits?.total,'instances visited'],[w('owned')?.total,'created instances'],[time?.total,'hours across worlds'],
    ];
    summaryRow(summaries);
    c.save();c.translate(0,40);
    function artwork(entry: WorldEntry | undefined,x: number,y: number,width: number,height: number,circle=false) {
      const image=entry && options.worldImages?.get(entry.worldId);
      c.save();c.beginPath();
      if(circle)c.arc(x+width/2,y+height/2,width/2,0,Math.PI*2);else c.roundRect(x,y,width,height,20);
      c.clip();
      if(image) {
        const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight);
        const sw=width/scale,sh=height/scale;
        c.drawImage(image,(image.naturalWidth-sw)/2,(image.naturalHeight-sh)/2,sw,sh,x,y,width,height);
      } else {
        const shade=c.createLinearGradient(x,y,x+width,y+height);shade.addColorStop(0,'#373944');shade.addColorStop(1,gradientColor);
        c.fillStyle=shade;c.fillRect(x,y,width,height);
        worldGlyph(x,y,width,height);
      }
      c.restore();
    }
    function winner(entry: WorldEntry | undefined,x: number,width: number,category: string,values: string) {
      artwork(entry,x,430,width,330);
      const title=entry?.name ?? 'No recorded world';
      const titleSize=merged ? 42 : 31, valueSize=merged ? 38 : 33;
      const maxText=width-48;
      function fittedWidth(value: string,size: number) {
        c.font=`700 ${size}px Arial, sans-serif`;
        let fitted=value;
        while(c.measureText(fitted).width>maxText && fitted.length>1)fitted=fitted.slice(0,-1);
        if(fitted!==value)fitted=fitted.slice(0,-1)+'…';
        return c.measureText(fitted).width;
      }
      c.save();c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetX=0;c.shadowOffsetY=0;
      function textBackdrop(value: string,size: number,baseline: number) {
        const plateWidth=Math.min(width-20,fittedWidth(value,size)+28);
        c.fillStyle='#000000e6';
        c.fillRect(x+10,baseline-size*.8-8,plateWidth,size*.8+18);
      }
      textBackdrop(category,26,471);
      textBackdrop(title,titleSize,674);
      textBackdrop(values,valueSize,724);
      text(category,x+24,471,26,'#fff','700',maxText);
      text(title,x+24,674,titleSize,'#fff','700',maxText);
      text(values,x+24,724,valueSize,accent,'700',maxText);
      c.restore();
    }
    if(merged) winner(timeWinner,64,952,'MOST TIME SPENT · MOST VISITED',`${number(timeWinner!.value)} h  ·  ${number(visitWinner!.value)} visits`);
    else {
      winner(timeWinner,64,464,'MOST TIME SPENT',timeWinner ? `${number(timeWinner.value)} h` : 'Not available');
      winner(visitWinner,552,464,'MOST VISITED',visitWinner ? `${number(visitWinner.value)} visits` : 'Not available');
    }
    function worldRanking(title: string,rows: readonly WorldEntry[],x: number,unit: string,ready: boolean) {
      frostedPanel(x-16,784,482,370);
      const contentX=x+12;
      text(title,x,824,24,accent,'700',450);
      if(rows.length<2)text(ready ? 'No other worlds recorded' : 'Not available',contentX,878,24,'#b4b5bf','400',414);
      rows.slice(1,5).forEach((entry,index)=>{
        const y=858+index*73;
        artwork(entry,contentX,y,54,54,true);
        text(String(index+2).padStart(2,'0'),contentX+70,y+19,19,'#aeb3bc','700',30);
        text(entry.name,contentX+108,y+20,24,'#fff','400',306);
        text(`${number(entry.value)} ${unit==='visits' && entry.value===1 ? 'visit' : unit}`,contentX+108,y+49,26,'#b9bec7','400',306);
      });
    }
    worldRanking('MOST TIME SPENT',time?.entries ?? [],64,'h',!!time);
    worldRanking('MOST VISITED',visits?.entries ?? [],566,'visits',!!visits);
    const discovery=w('discoveries'), discoveryWinner=discovery?.entries[0];
    frostedPanel(48,1188,984,148);
    text('DISCOVERED THIS YEAR',208,1227,24,accent,'700',796);
    if(discoveryWinner) {
      artwork(discoveryWinner,72,1206,112,112);
      text(discoveryWinner.name,208,1268,32,'#fff','700',796);
      text(`Most time spent · ${number(discoveryWinner.value)} h`,208,1305,26,'#c4c6cc','400',796,'Questrial, Arial, sans-serif');
    } else {
      text(discovery ? 'No newly discovered worlds recorded' : 'Discovery history unavailable',208,1275,27,'#c4c6cc','400',796);
    }
    c.restore();c.restore();
  } else if (kind === 'friends') {
    c.save();c.translate(0,-70);
    const together=f('time'), added=f('added');
    const togetherWinner=together?.entries[0], newWinner=added?.entries[0];
    const merged=!!togetherWinner && togetherWinner.userId===newWinner?.userId;
    canvas.dataset.friendsWinnerLayout=merged ? 'merged' : togetherWinner || newWinner ? 'split' : 'empty';
    summaryRow([[added?.total,'new friends made'],[together?.total,'friends spent time with'],[f('boops')?.total,'boops received'],[f('invites')?.total,'invites received']]);
    c.save();c.translate(0,40);
    function friendArtwork(entry: NewFriendEntry | undefined,x: number,y: number,width: number,height: number,circle=false) {
      friendRegion(entry,x,y,width,height,circle);
      const image=options.friendNames && entry ? options.friendImages?.get(entry.userId) : undefined;
      c.save();c.beginPath();
      if(circle)c.arc(x+width/2,y+height/2,width/2,0,Math.PI*2);else c.roundRect(x,y,width,height,20);
      c.clip();
      const shade=c.createLinearGradient(x,y,x+width,y+height);shade.addColorStop(0,'#373944');shade.addColorStop(1,gradientColor);
      c.fillStyle=shade;c.fillRect(x,y,width,height);
      if(image) {
        const scale=Math.max(width/image.naturalWidth,height/image.naturalHeight),sw=width/scale,sh=height/scale;
        c.drawImage(image,(image.naturalWidth-sw)/2,circle ? (image.naturalHeight-sh)/2 : 0,sw,sh,x,y,width,height);
      } else {
        c.fillStyle='#ffffff18';c.beginPath();c.arc(x+width/2,y+height*.38,Math.min(width,height)*.16,0,Math.PI*2);c.fill();
        c.beginPath();c.ellipse(x+width/2,y+height*.92,width*.32,height*.29,0,Math.PI,Math.PI*2);c.fill();
      }
      c.restore();
    }
    function friendWinner(entry: NewFriendEntry | undefined,x: number,width: number,category: string,anonymousName: string) {
      friendArtwork(entry,x,430,width,330);
      const name=entry ? options.friendNames ? entry.name : anonymousName : 'No recorded friend';
      const value=entry ? options.friendNames
        ? merged && newWinner && newWinner.seconds!==entry.seconds
          ? `${number(entry.seconds/3600)} h together · ${number(newWinner.seconds/3600)} h since added`
          : `${number(entry.seconds/3600)} h together`
        : 'Name and hours hidden' : 'Not available';
      function caption(value: string,baseline: number,size: number,color: string) {
        c.save();c.font=`700 ${size}px Arial, sans-serif`;
        c.fillStyle='#000000e6';c.fillRect(x+10,baseline-size*.8-8,Math.min(width-20,c.measureText(value).width+28),size*.8+18);c.restore();
        text(value,x+24,baseline,size,color,'700',width-48);
      }
      caption(category,471,merged ? 26 : 22,'#fff');
      caption(name,674,merged ? 42 : 31,'#fff');
      caption(value,724,merged ? 38 : 28,accent);
    }
    if(merged)friendWinner(togetherWinner,64,952,'MOST TIME TOGETHER · TOP NEW FRIEND','Your top friend · New this year');
    else {
      friendWinner(togetherWinner,64,464,'MOST TIME TOGETHER','Your top friend');
      friendWinner(newWinner,552,464,'TOP NEW FRIEND BY TIME','Your top new friend');
    }
    function friendRanking(title: string,rows: readonly NewFriendEntry[],x: number,ready: boolean) {
      frostedPanel(x-16,784,482,300);
      text(title,x,824,22,accent,'700',450);
      if(rows.length<2)text(ready ? 'No other friends recorded' : 'Not available',x+12,878,24,'#b4b5bf','400',414);
      rows.slice(1,5).forEach((entry,index)=>{
        const y=844+index*58;
        friendArtwork(entry,x+16,y,46,46,true);
        text(String(index+2).padStart(2,'0'),x+82,y+17,18,'#aeb3bc','700',30);
        text(options.friendNames ? entry.name : `Friend #${index+2}`,x+120,y+18,23,'#fff','400',306);
        text(options.friendNames ? `${number(entry.seconds/3600)} h` : 'Name and hours hidden',x+120,y+43,options.friendNames ? 23 : 19,'#b9bec7','400',306);
      });
    }
    friendRanking('MOST TIME TOGETHER',together?.entries ?? [],64,together?.rankingStatus==='ready');
    friendRanking('NEW FRIENDS BY TIME TOGETHER',added?.entries ?? [],566,added?.rankingStatus==='ready');
    frostedPanel(48,1110,984,94);
    const extra: [number | undefined,string][]=[[f('strangers')?.total,'strangers crossed paths'],[f('requests')?.total,'invite requests']];
    extra.forEach(([value,label],index)=>{
      const x=294+index*492;
      c.save();c.textAlign='center';c.save();c.shadowColor=shadowColor;c.shadowOffsetX=3;c.shadowOffsetY=4;
      text(number(value),x,1155,40,'#fff','italic 900',440);c.restore();
      text(label,x,1188,23,'#c4c6cc','400',440,'Questrial, Arial, sans-serif');c.restore();
    });
    function personHighlight(page: FriendsPageData | undefined,title: string,x: number,mutuals=false) {
      frostedPanel(x,1220,482,116);
      text(title,x+16,1248,20,accent,'700',450);
      const entry=page?.entries[0];
      if(entry) {
        friendArtwork(entry,x+28,1264,54,54,true);
        text(options.friendNames ? entry.name : 'Your top friend',x+102,1285,24,'#fff','700',352);
        const value=mutuals ? `${number(entry.value)} mutual friends` : `${number(entry.seconds/3600)} h online at the same time`;
        text(options.friendNames ? value : 'Name and details hidden',x+102,1315,21,'#c4c6cc','400',352,'Questrial, Arial, sans-serif');
      } else text(page?.rankingStatus==='ready' ? 'None recorded' : 'Not available',x+28,1295,25,'#b4b5bf','400',426);
    }
    personHighlight(f('overlap'),'ONLINE AT THE SAME TIME',48);
    personHighlight(f('mutuals'),'MOST FRIENDS IN COMMON',550,true);
    c.restore();c.restore();
  } else {
    c.save();c.translate(0,-70);
    c.save();c.textAlign='center';c.save();c.shadowColor=shadowColor;c.shadowOffsetX=5;c.shadowOffsetY=6;
    c.textAlign='right';
    text(number(hours),1016,430,160,'#fff','italic 900',660);c.restore();
    c.textAlign='right';
    text('hours played',1016,490,34,'#dedce2','400',660,'Questrial, Arial, sans-serif');c.restore();
    const days = sum(data.timeline?.daysData?.timeline.months) ?? sum(r('days')?.timeline?.months);
    metric(r('streak')?.value,'longest streak · days',64,550);
    metric(days,'days played',390,550);
    metric(hours === undefined ? undefined : Math.floor(hours/24),'full days of playtime',716,550);
    metric(data.timeline?.sessionCount,'recorded sessions',64,720);
    metric(f('added')?.total,'friends made',390,720);
    metric(f('strangers')?.total,'strangers crossed paths',716,720);
    metric(w('visits')?.total,'instances visited',64,886);
    metric(w('owned')?.total,'instances created',390,886);
    metric(w('discoveries')?.total,'worlds discovered',716,886);
    frostedPanel(64,1058,586,278);
    function statsRanking(x: number,title: string,rows: readonly {userId?: string;name: string;hours: number;image?: HTMLImageElement}[],ready: boolean,people=false) {
      const width=people ? 300 : 340,nameWidth=width-108;
      if(!people)frostedPanel(x,1058,width,278);
      text(title,x+16,1096,21,accent,'700',width-32);
      if(!rows.length)text(ready ? 'None recorded' : 'Not available',x+16,1150,23,'#b4b5bf','400',width-32);
      rows.slice(0,3).forEach((entry,index)=>{
        const y=1120+index*68;
        if(people && entry.userId)friendRegion({userId:entry.userId,name:entry.name},x+16,y+4,40,40,true);
        c.save();c.beginPath();c.arc(x+36,y+24,20,0,Math.PI*2);c.clip();
        c.fillStyle='#ffffff0b';c.fillRect(x+16,y+4,40,40);
        const image=entry.image;
        if(image) {
          const side=Math.min(image.naturalWidth,image.naturalHeight);
          c.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,x+16,y+4,40,40);
        } else if(people) {
          c.fillStyle='#ffffff18';c.beginPath();c.arc(x+36,y+18,7,0,Math.PI*2);c.fill();
          c.beginPath();c.ellipse(x+36,y+43,16,14,0,Math.PI,Math.PI*2);c.fill();
        } else {
          worldGlyph(x+16,y+4,40,40);
        }
        c.restore();
        text(String(index+1).padStart(2,'0'),x+64,y+18,16,'#aeb3bc','700',24);
        c.save();c.font='400 20px Arial, sans-serif';
        const words=entry.name.split(' ');let firstLine='';
        while(words.length && c.measureText(firstLine ? firstLine+' '+words[0] : words[0]!).width<=nameWidth)firstLine+=(firstLine ? ' ' : '')+words.shift();
        c.restore();
        if(!firstLine) {text(entry.name,x+92,y+19,20,'#fff','400',nameWidth);}
        else {text(firstLine,x+92,y+19,20,'#fff','400',nameWidth);if(words.length)text(words.join(' '),x+92,y+40,20,'#fff','400',nameWidth);}
        text(`${number(entry.hours)} h`,x+92,y+(firstLine && words.length ? 63 : 47),22,'#b9bec7','400',nameWidth);
      });
    }
    statsRanking(64,'TIME TOGETHER',f('time')?.entries.slice(0,3).map(entry=>({userId:entry.userId,name:entry.name,hours:entry.seconds/3600,image:options.friendImages?.get(entry.userId)})) ?? [],f('time')?.rankingStatus==='ready',true);
    statsRanking(350,'NEW FRIENDS BY TIME',f('added')?.entries.slice(0,3).map(entry=>({userId:entry.userId,name:entry.name,hours:entry.seconds/3600,image:options.friendImages?.get(entry.userId)})) ?? [],f('added')?.rankingStatus==='ready',true);
    statsRanking(676,'TIME IN WORLDS',w('time')?.entries.slice(0,3).map(entry=>({name:entry.name,hours:entry.value,image:options.worldImages?.get(entry.worldId)})) ?? [],!!w('time'));
    c.restore();
  }
  c.restore();
  canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',spoken.join('. '));
}
