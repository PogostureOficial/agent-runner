import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { chromium } from 'playwright';
import sharp from 'sharp';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const sessions = new Map(); // id -> { browser, ctx, page, paused, lastShot }

async function newSession(){
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('about:blank');
  return { browser, ctx, page, paused:false, tabs:[{title:'about:blank', active:true}], lastShot:null };
}

// Toma captura reducida
async function grabFrame(page){
  const buf = await page.screenshot({ type:'png' });
  // resize + JPEG
  const out = await sharp(buf).resize(1280).jpeg({ quality: 70 }).toBuffer();
  return out;
}

// Actualiza lista de pestañas (títulos)
async function fetchTabs(ctx, current){
  const pages = ctx.pages();
  return pages.map(p => ({ title: current === p ? (p.url()) : (p.url()), active: current === p }));
}

// ==== API ====
app.post('/api/session/new', async (req,res)=>{
  try{
    const id = uuidv4();
    const sess = await newSession();
    sessions.set(id, sess);
    res.json({ ok:true, sessionId:id });
  }catch(e){
    res.json({ ok:false, error:String(e) });
  }
});

app.get('/api/session/:id/status', async (req,res)=>{
  const s = sessions.get(req.params.id);
  if(!s) return res.json({ ok:false, error:'not found' });
  try{
    const title = await s.page.title().catch(()=> '');
    const url = s.page.url();
    s.tabs = await fetchTabs(s.ctx, s.page);
    res.json({ ok:true, status:{ paused:s.paused, title, url }, tabs: s.tabs });
  }catch(e){
    res.json({ ok:false, error:String(e) });
  }
});

app.get('/api/session/:id/frame', async (req,res)=>{
  const s = sessions.get(req.params.id);
  if(!s) return res.status(404).end();
  try{
    const buf = await grabFrame(s.page);
    res.setHeader('Content-Type','image/jpeg');
    res.end(buf);
  }catch(e){
    res.status(500).end();
  }
});

app.post('/api/session/:id/goto', async (req,res)=>{
  const s = sessions.get(req.params.id);
  if(!s) return res.json({ ok:false, error:'not found' });
  const { url } = req.body || {};
  try{
    await s.page.goto(url, { waitUntil:'domcontentloaded' });
    res.json({ ok:true });
  }catch(e){
    res.json({ ok:false, error:String(e) });
  }
});

app.post('/api/session/:id/click', async (req,res)=>{
  const s = sessions.get(req.params.id);
  if(!s) return res.json({ ok:false, error:'not found' });
  const { x, y, button } = req.body || {};
  try{
    const vw = s.page.viewportSize().width;
    const vh = s.page.viewportSize().height;
    await s.page.mouse.click(x*vw, y*vh, { button: button || 'left' });
    res.json({ ok:true });
  }catch(e){
    res.json({ ok:false, error:String(e) });
  }
});

app.post('/api/session/:id/type', async (req,res)=>{
  const s = sessions.get(req.params.id);
  if(!s) return res.json({ ok:false, error:'not found' });
  const { text } = req.body || {};
  try{
    if(text) await s.page.keyboard.type(text, { delay: 10 });
    res.json({ ok:true });
  }catch(e){
    res.json({ ok:false, error:String(e) });
  }
});

app.post('/api/session/:id/pause', async (req,res)=>{
  const s = sessions.get(req.params.id);
  if(!s) return res.json({ ok:false, error:'not found' });
  s.paused = true; res.json({ ok:true });
});
app.post('/api/session/:id/resume', async (req,res)=>{
  const s = sessions.get(req.params.id);
  if(!s) return res.json({ ok:false, error:'not found' });
  s.paused = false; res.json({ ok:true });
});

// ==== “Agente”: colas simples de tareas ====
app.post('/api/agent/task', async (req,res)=>{
  const { sessionId, instruction } = req.body || {};
  const s = sessions.get(sessionId);
  if(!s) return res.json({ ok:false, error:'session not found' });

  // DEMO: si la instrucción menciona canva y tríptico, guiamos los pasos iniciales
  (async()=>{
    try{
      // 1) Abrir Canva
      await s.page.goto('https://www.canva.com/', { waitUntil:'domcontentloaded' });
      // *** Aquí tomás control manual para login ***
      // 2) Una vez logueado, buscamos plantilla
      // (lo intentaremos igualmente; si no está logueado, verás el login)
      await s.page.waitForTimeout(1000);
      await s.page.keyboard.press('Escape').catch(()=>{});

      // Barra de búsqueda (selector puede variar con UI; este es razonable)
      const searchSel = 'input[placeholder*="Buscar"], input[aria-label*="Buscar"]';
      await s.page.click(searchSel, { timeout: 10000 }).catch(()=>{});
      await s.page.keyboard.type('folleto tríptico fútbol', { delay: 20 });
      await s.page.keyboard.press('Enter');

      // Esperar resultados y abrir primera plantilla
      await s.page.waitForTimeout(2500);
      const firstCard = 'a[href*="/design/"]';
      await s.page.click(firstCard, { timeout: 20000 }).catch(()=>{});
      await s.page.waitForTimeout(2500);

      // En el editor: aquí podrías automatizar textos (selectores complejos).
      // Para el MVP, se deja a la vista para edición manual.
    }catch(e){
      console.log('Agente error:', e);
    }
  })();

  res.json({ ok:true });
});

// Salud
app.get('/healthz', (_req,res)=> res.send('ok'));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log('Agent Runner on :' + PORT));
