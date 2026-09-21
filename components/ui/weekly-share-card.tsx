import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, ImagePlus, Share2 } from "lucide-react";
import { DragSheet } from "./drag-sheet";

export interface WeeklyMeal { title: string; eatenAt?: string }
type Model = "summary" | "meals" | "streak";
const models: Model[] = ["summary", "meals", "streak"];
const labels = { summary: "Resumo", meals: "Refeições", streak: "Sequência" };

export function foodEmoji(title: string) {
  const value = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rules: Array<[RegExp,string]> = [[/pizza/,"🍕"],[/massa|macarrao|lasanha|espaguete/,"🍝"],[/sopa|caldo/,"🍲"],[/salada|legume/,"🥗"],[/hamburg|sanduiche|lanche/,"🍔"],[/frango|galinha/,"🍗"],[/peixe|salmao|atum/,"🐟"],[/carne|bife/,"🥩"],[/ovo|omelete/,"🍳"],[/arroz|feijao|almoco|jantar/,"🍛"],[/cafe|cappuccino/,"☕"],[/bolo|doce|sobremesa/,"🍰"],[/fruta|maca|banana|morango/,"🍎"],[/pa[oã]|torrada/,"🥖"]];
  return rules.find(([pattern])=>pattern.test(value))?.[1] ?? "🍽️";
}

function weekKey(date: Date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const start = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return `${value.getUTCFullYear()}-${Math.ceil((((+value - +start) / 86400000) + 1) / 7)}`;
}

function metrics(diary: WeeklyMeal[]) {
  const now = new Date(), start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
  const recent = diary.filter(item => !item.eatenAt || new Date(item.eatenAt) >= start);
  const days = new Set(recent.map(item => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(item.eatenAt || Date.now())))).size;
  const weeks = new Set(diary.map(item => weekKey(new Date(item.eatenAt || Date.now()))));
  let streak = 0, cursor = new Date();
  while (weeks.has(weekKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 7); }
  return { recent, days, streak };
}

function drawCover(ctx: CanvasRenderingContext2D, width: number, height: number, model: Model, dark: boolean, data: ReturnType<typeof metrics>, background?: HTMLImageElement) {
  const bg = dark ? "#07110c" : "#fff8e9", ink = dark ? "#f4f7f4" : "#073f32", muted = dark ? "#9bad9f" : "#627169", green = "#30d47a", gold = "#f4bd68";
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  if (background) { const scale = Math.max(width / background.width, height / background.height); const w = background.width * scale, h = background.height * scale; ctx.globalAlpha = .26; ctx.drawImage(background, (width-w)/2, (height-h)/2, w, h); ctx.globalAlpha = 1; ctx.fillStyle = dark ? "rgba(7,17,12,.72)" : "rgba(255,248,233,.78)"; ctx.fillRect(0,0,width,height); }
  const gradient = ctx.createRadialGradient(width*.78,height*.18,10,width*.78,height*.18,width*.55); gradient.addColorStop(0,dark?"rgba(48,212,122,.28)":"rgba(48,212,122,.20)"); gradient.addColorStop(1,"rgba(48,212,122,0)"); ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  ctx.strokeStyle=dark?"#264334":"#bdd0c3";ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(54,54,width-108,height-108,44);ctx.stroke();
  ctx.fillStyle=green;ctx.font="700 34px system-ui";ctx.fillText("REFEIÇÃO FÁCIL",86,120);
  ctx.fillStyle=muted;ctx.font="600 26px system-ui";ctx.fillText("MINHA SEMANA",86,166);
  ctx.textAlign="center";
  if(model==="summary") {
    ctx.fillStyle=ink;ctx.font="800 70px system-ui";ctx.fillText("Uma semana à mesa",width/2,350);
    ctx.font="900 190px system-ui";ctx.fillText(String(data.recent.length),width/2,650);ctx.font="700 40px system-ui";ctx.fillText(data.recent.length===1?"refeição registrada":"refeições registradas",width/2,710);
    ctx.fillStyle=gold;ctx.beginPath();ctx.arc(width/2,1010,190,0,Math.PI*2);ctx.fill();ctx.fillStyle=bg;ctx.beginPath();ctx.arc(width/2,1010,145,0,Math.PI*2);ctx.fill();ctx.font="82px 'Segoe UI Emoji', sans-serif";const icons=data.recent.slice(0,4).map(meal=>foodEmoji(meal.title));ctx.fillText(icons.slice(0,2).join(" "),width/2,1005);if(icons.length>2)ctx.fillText(icons.slice(2).join(" "),width/2,1090);
    ctx.fillStyle=ink;ctx.font="800 58px system-ui";ctx.fillText(`${data.days} ${data.days===1?"dia":"dias"}`,width/2,1320);ctx.font="500 31px system-ui";ctx.fillStyle=muted;ctx.fillText("registrados nos últimos 7 dias",width/2,1370);
  } else if(model==="meals") {
    ctx.textAlign="left";ctx.fillStyle=ink;ctx.font="800 72px system-ui";ctx.fillText("O que marcou",86,330);ctx.fillText("minha semana",86,410);ctx.font="600 34px system-ui";
    data.recent.slice(0,6).forEach((meal,index)=>{const y=550+index*145;ctx.font="50px 'Segoe UI Emoji', sans-serif";ctx.fillText(foodEmoji(meal.title),86,y+5);ctx.fillStyle=ink;ctx.font="600 34px system-ui";ctx.fillText(meal.title.slice(0,34),155,y);ctx.fillStyle=muted;ctx.font="500 25px system-ui";ctx.fillText(new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"short"}).format(new Date(meal.eatenAt||Date.now())),155,y+40);});
  } else {
    ctx.fillStyle=ink;ctx.font="900 220px system-ui";ctx.fillText(String(data.streak),width/2,680);ctx.fillStyle=green;ctx.font="800 66px system-ui";ctx.fillText(data.streak===1?"semana presente":"semanas presentes",width/2,790);ctx.fillStyle=muted;ctx.font="500 31px system-ui";ctx.fillText("Uma rotina construída refeição por refeição.",width/2,860);for(let i=0;i<7;i++){ctx.fillStyle=i<data.days?green:(dark?"#1b2c23":"#dbe5dc");ctx.beginPath();ctx.arc(285+i*85,1080,24,0,Math.PI*2);ctx.fill();}ctx.fillStyle=gold;ctx.font="700 38px system-ui";ctx.fillText("CONTINUE NO SEU RITMO",width/2,1260);
  }
  ctx.textAlign="center";ctx.fillStyle=ink;ctx.font="800 42px system-ui";ctx.fillText("Sua próxima refeição, resolvida.",width/2,height-145);
}

export function WeeklyShareCard({ diary }: { diary: WeeklyMeal[] }) {
  const data = useMemo(()=>metrics(diary),[diary]);
  const [open,setOpen]=useState(false),[model,setModel]=useState<Model>("summary"),[dark,setDark]=useState(true),[image,setImage]=useState<HTMLImageElement>();
  const [blob,setBlob]=useState<Blob>();
  const index=models.indexOf(model);
  async function generate() { const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1920;drawCover(canvas.getContext("2d")!,1080,1920,model,dark,data,image);setBlob(await new Promise<Blob|undefined>(resolve=>canvas.toBlob(value=>resolve(value||undefined),"image/png"))); }
  useEffect(()=>{if(open) generate();},[open,model,dark,image,diary]);
  async function share(){if(!blob)return;const file=new File([blob],"minha-semana-refeicao-facil.png",{type:"image/png"});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:"Minha semana — Refeição Fácil",files:[file]});else download();}
  function download(){if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="minha-semana-refeicao-facil.png";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const mealIcons=data.recent.slice(0,5).map(meal=>foodEmoji(meal.title));
  return <><section className="weekly-card" aria-labelledby="weekly-title"><div className="weekly-card-head"><span className="weekly-icon"><CalendarDays /></span><div><p className="eyebrow">Últimos 7 dias</p><h2 id="weekly-title">Sua semana</h2></div></div><div className="weekly-foods" aria-label="Tipos aproximados das refeições">{mealIcons.map((emoji,i)=><span key={i} aria-hidden="true">{emoji}</span>)}</div><div className="weekly-stats"><strong>{data.recent.length}<span>refeições</span></strong><strong>{data.days}<span>dias registrados</span></strong></div><p>{data.recent.length?"Transforme seus registros em uma imagem para compartilhar.":"Registre uma refeição para começar seu resumo semanal."}</p><button className="button secondary pressable" disabled={!data.recent.length} onClick={()=>setOpen(true)}><Share2 />Criar cartão</button></section>{open&&<DragSheet title="Criar cartão semanal" onClose={()=>setOpen(false)}><div className="share-studio"><div className={`share-art share-art-${model} ${dark?"is-dark":"is-light"}`} role="img" aria-label={`Prévia do modelo ${labels[model]}`}><span className="share-brand">REFEIÇÃO FÁCIL</span>{model==="summary"&&<><h3>Uma semana à mesa</h3><strong>{data.recent.length}</strong><p>refeições registradas</p><span className="plate-art food-cluster">{mealIcons.slice(0,4).map((emoji,i)=><i key={i}>{emoji}</i>)}</span><b>{data.days} {data.days===1?"dia":"dias"}</b></>}{model==="meals"&&<><h3>O que marcou<br/>minha semana</h3><ul>{data.recent.slice(0,5).map((meal,i)=><li key={i}><span>{foodEmoji(meal.title)}</span>{meal.title}</li>)}</ul></>}{model==="streak"&&<><strong>{data.streak}</strong><h3>{data.streak===1?"semana presente":"semanas presentes"}</h3><div className="streak-foods">{mealIcons.slice(0,3).map((emoji,i)=><span key={i}>{emoji}</span>)}</div><p>Uma rotina construída refeição por refeição.</p><div className="streak-dots">{Array.from({length:7},(_,i)=><i className={i<data.days?"done":""} key={i}/>)}</div></>}<small>Sua próxima refeição, resolvida.</small></div><div className="share-model-nav"><button aria-label="Modelo anterior" onClick={()=>setModel(models[(index+2)%3])}><ChevronLeft/></button><div>{models.map(value=><button key={value} className={model===value?"current":""} aria-label={`Usar modelo ${labels[value]}`} onClick={()=>setModel(value)}/>)}</div><button aria-label="Próximo modelo" onClick={()=>setModel(models[(index+1)%3])}><ChevronRight/></button></div><p className="share-model-name">{labels[model]} · {index+1} de 3</p><div className="share-options"><button className={!dark?"selected":""} onClick={()=>setDark(false)}>Claro</button><button className={dark?"selected":""} onClick={()=>setDark(true)}>Escuro</button><label><ImagePlus/>Foto de fundo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];if(!file)return;const url=URL.createObjectURL(file),next=new Image();next.onload=()=>{setImage(next);URL.revokeObjectURL(url)};next.src=url;}}/></label></div><p className="session-note">Os símbolos representam categorias aproximadas. A imagem é gerada neste navegador e nada é enviado.</p><div className="preview-actions"><button className="button secondary" onClick={download} disabled={!blob}><Download/>Baixar PNG</button><button className="button primary glow-action" onClick={()=>share().catch(()=>{})} disabled={!blob}><Share2/>Compartilhar</button></div></div></DragSheet>}</>;
}
