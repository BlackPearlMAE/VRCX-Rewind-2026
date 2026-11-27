/** Local HSV controls; the text input remains the shared hex value. */
export function attachHSVColorPicker(input: HTMLInputElement, title: string) {
  let h=0,s=0,v=0,current='';
  const root=document.createElement('fieldset');root.className='share-hsv-picker';
  const legend=document.createElement('legend');legend.textContent=title;
  const square=document.createElement('div');square.className='share-hsv-square';square.setAttribute('aria-hidden','true');
  const cursor=document.createElement('span');square.append(cursor);
  const controls=document.createElement('div');controls.className='share-hsv-sliders';
  const ranges: HTMLInputElement[]=[],outputs: HTMLOutputElement[]=[];
  for(const [label,max] of [['Hue',360],['Saturation',100],['Value',100]] as const) {
    const row=document.createElement('label');row.className='share-hsv-slider';
    const name=document.createElement('span');name.textContent=label;
    const range=document.createElement('input');range.type='range';range.min='0';range.max=String(max);range.step='1';range.setAttribute('aria-label',`${title} ${label.toLowerCase()}`);
    const output=document.createElement('output');
    ranges.push(range);outputs.push(output);row.append(name,range,output);controls.append(row);
    range.addEventListener('input',()=>{h=Number(ranges[0]!.value);s=Number(ranges[1]!.value);v=Number(ranges[2]!.value);commit();});
  }
  const hexRow=document.createElement('label');hexRow.className='share-hsv-hex';
  const hexLabel=document.createElement('span');hexLabel.textContent='Hex';
  const swatch=document.createElement('span');swatch.className='share-hsv-swatch';swatch.setAttribute('aria-hidden','true');
  input.type='text';input.maxLength=7;input.spellcheck=false;input.autocomplete='off';input.setAttribute('aria-label',title);
  const trigger=document.createElement('button');trigger.type='button';trigger.className='share-hsv-trigger';trigger.setAttribute('aria-label',`${title} picker`);trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
  const triggerSwatch=document.createElement('span');triggerSwatch.className='share-hsv-swatch';triggerSwatch.setAttribute('aria-hidden','true');
  const triggerValue=document.createElement('span');trigger.append(triggerSwatch,triggerValue);
  const popup=document.createElement('div');popup.className='share-hsv-popup';popup.popover='auto';popup.setAttribute('role','dialog');popup.setAttribute('aria-label',`${title} picker`);
  const header=document.createElement('div');header.className='share-hsv-popup-header';
  const heading=document.createElement('strong');heading.textContent=title;
  const closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='Close';closeButton.setAttribute('aria-label',`Close ${title} picker`);header.append(heading,closeButton);
  input.replaceWith(root);hexRow.append(hexLabel,swatch,input);popup.append(header,square,controls,hexRow);root.append(legend,trigger,popup);
  function position() {
    if(!popup.matches(':popover-open'))return;
    const anchor=trigger.getBoundingClientRect(),width=Math.min(336,innerWidth-32);
    popup.style.width=width+'px';
    popup.style.left=Math.max(16,Math.min(anchor.left,innerWidth-width-16))+'px';
    const height=popup.getBoundingClientRect().height;
    const below=innerHeight-anchor.bottom-16,above=anchor.top-16;
    popup.style.top=Math.max(16,Math.min(below>=height || below>=above ? anchor.bottom+8 : anchor.top-height-8,innerHeight-height-16))+'px';
  }
  function close() {if(popup.matches(':popover-open'))popup.hidePopover();}
  trigger.addEventListener('click',()=>{
    if(popup.matches(':popover-open'))close();
    else {popup.showPopover();position();ranges[0]!.focus({preventScroll:true});}
  });
  popup.addEventListener('toggle',()=>trigger.setAttribute('aria-expanded',String(popup.matches(':popover-open'))));
  closeButton.addEventListener('click',()=>{close();trigger.focus({preventScroll:true});});
  window.addEventListener('resize',position);
  function hsvColor(hue: number,saturation: number,brightness: number) {
    const sat=saturation/100,value=brightness/100,chroma=value*sat,part=chroma*(1-Math.abs((hue/60)%2-1)),m=value-chroma;
    const rgb=hue<60 ? [chroma,part,0] : hue<120 ? [part,chroma,0] : hue<180 ? [0,chroma,part] : hue<240 ? [0,part,chroma] : hue<300 ? [part,0,chroma] : [chroma,0,part];
    return '#'+rgb.map(channel=>Math.round((channel+m)*255).toString(16).padStart(2,'0')).join('');
  }
  function paint() {
    square.style.backgroundColor=`hsl(${h} 100% 50%)`;
    cursor.style.left=`${s}%`;cursor.style.top=`${100-v}%`;
    [h,s,v].forEach((value,index)=>{ranges[index]!.value=String(Math.round(value));outputs[index]!.value=String(Math.round(value))+(index===0 ? '°' : '%');});
    swatch.style.backgroundColor=current;triggerSwatch.style.backgroundColor=current;triggerValue.textContent=current;
    ranges[0]!.style.setProperty('--hsv-track','linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)');
    ranges[1]!.style.setProperty('--hsv-track',`linear-gradient(to right,${hsvColor(h,0,v)},${hsvColor(h,100,v)})`);
    ranges[2]!.style.setProperty('--hsv-track',`linear-gradient(to right,#000,${hsvColor(h,s,100)})`);
  }
  function sync(hex: string) {
    if(!/^#[0-9a-f]{6}$/i.test(hex) || hex.toLowerCase()===current)return;
    current=hex.toLowerCase();
    const [r,g,b]=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255) as [number,number,number];
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    if(delta)h=((max===r ? (g-b)/delta : max===g ? (b-r)/delta+2 : (r-g)/delta+4)*60+360)%360;
    s=max ? delta/max*100 : s;v=max*100;
    input.removeAttribute('aria-invalid');paint();
  }
  function commit() {
    current=hsvColor(h,s,v);
    input.value=current;input.removeAttribute('aria-invalid');paint();input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function normalize(short=false) {
    const raw=input.value.trim().replace(/^#/,'');
    const hex=/^[0-9a-f]{6}$/i.test(raw) ? '#'+raw : short && /^[0-9a-f]{3}$/i.test(raw) ? '#'+[...raw].map(x=>x+x).join('') : undefined;
    if(hex) {input.value=hex.toLowerCase();input.removeAttribute('aria-invalid');sync(hex);return true;}
    return false;
  }
  input.addEventListener('input',()=>{normalize();});
  input.addEventListener('change',()=>{if(normalize(true))input.dispatchEvent(new Event('input',{bubbles:true}));else input.setAttribute('aria-invalid','true');});
  function point(event: PointerEvent) {
    const bounds=square.getBoundingClientRect();
    s=Math.max(0,Math.min(100,(event.clientX-bounds.left)/bounds.width*100));
    v=100-Math.max(0,Math.min(100,(event.clientY-bounds.top)/bounds.height*100));commit();
  }
  square.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();square.setPointerCapture(event.pointerId);point(event);});
  square.addEventListener('pointermove',event=>{if(square.hasPointerCapture(event.pointerId))point(event);});
  square.addEventListener('pointerup',event=>{if(square.hasPointerCapture(event.pointerId)){point(event);square.releasePointerCapture(event.pointerId);}});
  sync(input.value);
  return {sync,close};
}
