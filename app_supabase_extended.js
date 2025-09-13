// Simplified extended POS frontend using Supabase
const $ = sel => document.querySelector(sel);
const formatBR = v => 'R$ ' + Number(v).toFixed(2).replace('.',',');

const SUPA = window.__SUPABASE_CONFIG || {};
const supabase = supabase.createClient(SUPA.SUPABASE_URL, SUPA.SUPABASE_ANON_KEY);

let cart = [];
let lastReceiptHTML = '';

document.addEventListener('DOMContentLoaded', async ()=>{
  document.querySelectorAll('.tabs button').forEach(btn=>{
    btn.onclick = ()=> {
      document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab || btn.getAttribute('data-tab');
      document.querySelectorAll('.screen').forEach(s=> s.style.display = 'none');
      if(tab === 'reports') document.getElementById('screen-dashboard').style.display = 'block';
      else if(tab === 'settings') document.getElementById('screen-settings').style.display = 'block';
      else document.getElementById('screen-pos').style.display = 'block';
    };
  });

  document.getElementById('open-login-btn').onclick = ()=> $('#login-modal').setAttribute('aria-hidden','false');
  document.getElementById('close-login-modal').onclick = ()=> $('#login-modal').setAttribute('aria-hidden','true');
  document.getElementById('login-form').onsubmit = login;
  document.getElementById('open-owner-btn').onclick = ()=> $('#owner-modal').setAttribute('aria-hidden','false');
  document.getElementById('close-owner-modal').onclick = ()=> $('#owner-modal').setAttribute('aria-hidden','true');
  document.getElementById('owner-form').onsubmit = saveStoreInfo;
  document.getElementById('open-operators-btn').onclick = ()=> { listOperators(); $('#operators-modal').setAttribute('aria-hidden','false'); };
  document.getElementById('operator-form').onsubmit = createOperator;
  document.getElementById('search').addEventListener('input', (e)=> renderProducts(e.target.value));
  document.getElementById('scan-sim').onclick = ()=> { const code = prompt('Código de barras:'); if(code) simulateScan(code); };
  document.getElementById('complete-sale').onclick = completeSale;
  document.getElementById('print-last-receipt').onclick = printLastReceipt;
  document.getElementById('close-day-btn').onclick = closeDay;
  
  // Botões do header que estavam faltando no código original
  document.getElementById('open-products-btn').onclick = () => alert('Funcionalidade "Gerenciar Produtos" a ser implementada.');
  document.getElementById('open-dashboard-btn').onclick = () => {
      document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
      document.querySelector('button[data-tab="reports"]').classList.add('active');
      document.querySelectorAll('.screen').forEach(s=> s.style.display = 'none');
      document.getElementById('screen-dashboard').style.display = 'block';
  };


  await ensureAuthState();
  await loadStoreInfo();
  await loadProducts();
  await loadCashflow();
  await refreshDashboard();
});

// AUTH helpers
async function ensureAuthState(){
  const { data: { user } } = await supabase.auth.getUser().catch(()=>({data:{user:null}}));
  updateUserInfo(user);
  supabase.auth.onAuthStateChange((event, session) => {
    updateUserInfo(session?.user || null);
  });
}
function updateUserInfo(user){
  $('#user-info').textContent = user ? user.email : 'Não autenticado';
}
async function login(e){
  e.preventDefault();
  const email = $('#login-email').value, pass = $('#login-pass').value;
  const { error, data } = await supabase.auth.signInWithPassword({email, password: pass});
  if(error){ alert('Erro login: '+error.message); return; }
  alert('Logado: ' + (data?.user?.email || ''));
  $('#login-modal').setAttribute('aria-hidden','true');
  await loadProducts(); await loadCashflow(); await loadStoreInfo(); await refreshDashboard();
}

// STORE INFO
async function loadStoreInfo(){
  const res = await supabase.from('store_info').select('*').limit(1).single().catch(()=>({data:null}));
  if(res && res.data){ window._STORE = res.data; const pv = $('#store-preview'); pv.innerHTML = ''; if(res.data.logo_base64){ const img = document.createElement('img'); img.src = res.data.logo_base64; img.style.maxWidth='120px'; pv.appendChild(img); } pv.appendChild(document.createTextNode((res.data.name||'') + (res.data.cnpj? ' • CNPJ: '+res.data.cnpj: ''))); } else { window._STORE = null; $('#store-preview').textContent = 'Nenhum registro do mercado.'; }
}
function toBase64(file){ return new Promise((res, rej)=>{ const reader = new FileReader(); reader.onload = ()=> res(reader.result); reader.onerror = err => rej(err); reader.readAsDataURL(file); }); }
async function saveStoreInfo(e){ e.preventDefault(); const id='store'; const name=$('#store-name').value.trim(); const cnpj=$('#store-cnpj').value.trim(); const address=$('#store-address').value.trim(); const phone=$('#store-phone').value.trim(); const fileInput=$('#store-logo'); let logo_b64=null; if(fileInput && fileInput.files && fileInput.files[0]) logo_b64 = await toBase64(fileInput.files[0]); else if(window._STORE && window._STORE.logo_base64) logo_b64 = window._STORE.logo_base64; const payload={id,name,cnpj,address,phone,logo_base64:logo_b64}; const up = await supabase.from('store_info').upsert(payload); if(up.error){ alert('Erro: '+up.error.message); return; } alert('Dados salvos'); await loadStoreInfo(); $('#owner-modal').setAttribute('aria-hidden','true'); }

// OPERATOR (signup)
async function createOperator(e){ e.preventDefault(); const email=$('#op-email').value, pass=$('#op-pass').value; const res = await supabase.auth.signUp({email, password: pass}); if(res.error){ alert('Erro criar operador: '+res.error.message); return; } alert('Operador criado: '+email); $('#op-email').value=''; $('#op-pass').value=''; }
function listOperators(){ $('#operators-list').textContent = 'Para listar operadores, use o painel do Supabase (Admin) ou crie um endpoint serverless.'; }

// PRODUCTS & CART (basic)
async function loadProducts(){ const res = await supabase.from('products').select('*').order('name'); if(res.error){ console.error(res.error); window._POS_PRODUCTS=[]; return; } window._POS_PRODUCTS = res.data || []; renderProducts(); }
function renderProducts(filter=''){ const container = $('#products-list'); container.innerHTML=''; const list = (window._POS_PRODUCTS||[]).filter(p=> (p.name + ' ' + (p.barcode||'')).toLowerCase().includes((filter||'').toLowerCase())); if(list.length===0){ container.innerHTML='<div class=\"small\">Nenhum produto</div>'; return; } list.forEach(p=>{ const div=document.createElement('div'); div.className='product-card'; div.innerHTML = `<div><strong>${p.name}</strong><div class=\"small\">Preço: ${formatBR(p.price)} • Estoque: ${p.qty}</div><div class=\"small\">Código: ${p.barcode||'-'}</div></div><div><button data-id=\"${p.id}\" class=\"add-btn\">Adicionar</button></div>`; container.appendChild(div); }); document.querySelectorAll('.add-btn').forEach(b=>b.onclick = e=> addToCart(e.target.dataset.id)); }
function addToCart(id){ const p=(window._POS_PRODUCTS||[]).find(x=>x.id===id); if(!p){ alert('Produto ausente'); return; } if(p.qty<=0){ alert('Estoque insuficiente'); return; } const ex=cart.find(c=>c.id===id); if(ex) ex.qty++; else cart.push({id:p.id,name:p.name,price:p.price,qty:1,discountType:null,discountValue:0}); renderCart(); }
function renderCart(){ const tbody=document.querySelector('#cart-table tbody'); tbody.innerHTML=''; cart.forEach((c,idx)=>{ const subtotal=c.price*c.qty; const disc=computeItemDiscountAmount(c); const row=document.createElement('tr'); row.innerHTML = `<td>${c.name}</td><td><input type=\"number\" min=\"1\" value=\"${c.qty}\" data-idx=\"${idx}\" class=\"cart-qty\" /></td><td>${formatBR(c.price)}</td><td><input placeholder=\"ex:5% ou 2.50\" value=\"${c.discountType? (c.discountType==='percent'? c.discountValue+'%': c.discountValue): ''}\" data-idx=\"${idx}\" class=\"cart-discount\" /></td><td>${formatBR(subtotal-disc)}</td><td><button data-idx=\"${idx}\" class=\"remove\">x</button></td>`; tbody.appendChild(row); }); attachCartEvents(); computeTotals(); }
function attachCartEvents(){ document.querySelectorAll('.cart-qty').forEach(i=>i.onchange = e=>{ const idx=e.target.dataset.idx; const val=parseInt(e.target.value,10); if(isNaN(val)||val<1) return e.target.value=1; const prod=(window._POS_PRODUCTS||[]).find(p=>p.id===cart[idx].id); if(val>prod.qty){ alert('Maior que estoque'); e.target.value=prod.qty; cart[idx].qty=prod.qty; } else cart[idx].qty=val; renderCart(); }); document.querySelectorAll('.cart-discount').forEach(i=>i.onchange = e=>{ const idx=e.target.dataset.idx; const raw=e.target.value.trim(); parseAndSetItemDiscount(idx, raw); renderCart(); }); document.querySelectorAll('.remove').forEach(b=>b.onclick = e=>{ cart.splice(e.target.dataset.idx,1); renderCart(); }); }
function parseAndSetItemDiscount(idx, raw){ if(!raw){ cart[idx].discountType=null; cart[idx].discountValue=0; return; } if(raw.endsWith('%')){ const v=parseFloat(raw.slice(0,-1)); if(isNaN(v)||v<0){ alert('Desconto inválido'); return; } cart[idx].discountType='percent'; cart[idx].discountValue=v; } else { const v=parseFloat(raw); if(isNaN(v)||v<0){ alert('Desconto inválido'); return; } cart[idx].discountType='value'; cart[idx].discountValue=v; } }
function computeItemDiscountAmount(item){ const subtotal=item.price*item.qty; if(!item.discountType) return 0; if(item.discountType==='percent') return subtotal*(item.discountValue/100); return Math.min(item.discountValue, subtotal); }
function computeTotals(){ const subtotal=cart.reduce((s,i)=>s + (i.price*i.qty),0); const itemsDiscount=cart.reduce((s,i)=>s + computeItemDiscountAmount(i),0); const totalDiscInput=document.getElementById('total-discount').value.trim(); let totalDiscountExtra=0; let after=subtotal-itemsDiscount; if(totalDiscInput){ if(totalDiscInput.endsWith('%')){ const v=parseFloat(totalDiscInput.slice(0,-1)); if(!isNaN(v)&&v>=0) totalDiscountExtra = after*(v/100); } else { const v=parseFloat(totalDiscInput); if(!isNaN(v)&&v>=0) totalDiscountExtra = v; } } const discountTotal = itemsDiscount + totalDiscountExtra; const total = Math.max(0, subtotal - discountTotal); document.getElementById('subtotal').textContent = formatBR(subtotal); document.getElementById('discount-amount').textContent = formatBR(discountTotal); document.getElementById('total').textContent = formatBR(total); return {subtotal, discountTotal, total}; }

// Complete sale: update stock and insert sale record with store info
async function completeSale(){ if(cart.length===0){ alert('Carrinho vazio'); return; } const totals = computeTotals(); const paid = parseFloat($('#amount-paid').value || '0'); if(isNaN(paid) || paid < totals.total){ if(!confirm('Valor recebido menor que total. Registrar mesmo assim?')) return; } for(const it of cart){ const p=(window._POS_PRODUCTS||[]).find(x=>x.id===it.id); if(!p){ alert('Produto ausente: '+it.name); return; } if(p.qty < it.qty){ alert('Estoque insuficiente: '+it.name); return; } } // update qtys for(const it of cart){ const p=(window._POS_PRODUCTS||[]).find(x=>x.id===it.id); const newQty = p.qty - it.qty; const res = await supabase.from('products').update({qty:newQty}).eq('id', p.id); if(res.error){ alert('Erro atualizar estoque: '+res.error.message); return; } } const sale = { id: 's_' + Date.now(), datetime: new Date().toISOString(), items: cart, totals, paid, operator: (await supabase.auth.getUser()).data?.user?.email || 'anon' }; const insert = await supabase.from('sales').insert({id: sale.id, datetime: sale.datetime, payload: sale}); if(insert.error){ alert('Erro salvar venda: '+insert.error.message); return; } await loadProducts(); await loadCashflow(); alert('Venda registrada.'); generateReceipt(sale); cart=[]; renderCart(); $('#amount-paid').value=''; await refreshDashboard(); }

// load cashflow
async function loadCashflow(){ const res = await supabase.from('sales').select('id, datetime, payload').order('datetime', {ascending:false}).limit(500); if(res.error){ console.error(res.error); window._POS_CASH=[]; return; } window._POS_CASH = res.data.map(r=> r.payload || r); renderCashflow(); }
function renderCashflow(){ const el = $('#cashflow-list'); if(!el) return; const rows = window._POS_CASH || []; if(rows.length===0){ el.innerHTML = '<div class="small">Sem movimentações</div>'; return; } let html = '<table><thead><tr><th>Data</th><th>Itens</th><th>Total</th></tr></thead><tbody>'; for(const r of rows){ html += `<tr><td>${new Date(r.datetime).toLocaleString()}</td><td>${(r.items||[]).length} itens</td><td>${formatBR(r.totals.total)}</td></tr>`; } html += '</tbody></table>'; el.innerHTML = html; }

// receipt includes store info
function generateReceipt(entry){ const store = window._STORE || {}; const date = new Date(entry.datetime); let html = `<html><head><meta charset="utf-8"><title>Cupom</title><style> body{font-family:Monospace;font-size:12px;padding:6px;width:72mm} .center{text-align:center} .right{text-align:right} .small{font-size:11px} </style></head><body>`; if(store.logo_base64) html += `<div class="center"><img src="${store.logo_base64}" style="max-width:120px"/></div>`; html += `<div class="center"><b>${store.name || 'SUPERMERCADO'}</b></div>`; if(store.cnpj) html += `<div class="center small">CNPJ: ${store.cnpj}</div>`; if(store.address) html += `<div class="center small">${store.address}</div>`; if(store.phone) html += `<div class="center small">Tel: ${store.phone}</div>`; html += `<div class="center small">${date.toLocaleString()}</div><hr/>`; entry.items.forEach(it=>{ const disc = computeItemDiscountAmount(it); const line = (it.price*it.qty - disc).toFixed(2); html += `<div>${it.name}</div><div class="small">${it.qty} x ${formatBR(it.price)} <span class="right">${formatBR(line)}</span></div>`; }); html += `<hr/><div class="right">Total: ${formatBR(entry.totals.total)}</div><div class="center small">Operador: ${entry.operator}</div><div class="center small">*** NÃO FISCAL ***</div></body></html>`; lastReceiptHTML = html; const w = window.open('', '_blank', 'width=300,height=600'); w.document.write(html); w.document.close(); }
function printLastReceipt(){ if(!lastReceiptHTML){ alert('Nenhum cupom'); return; } const w = window.open('', '_blank','width=300,height=600'); w.document.write(lastReceiptHTML); w.document.close(); w.print(); }

// dashboard
async function refreshDashboard(){ const res = await supabase.from('sales').select('payload').order('datetime', {ascending:false}).limit(2000); if(res.error){ console.error(res.error); return; } const rows = (res.data || []).map(r=> r.payload || r); const now = new Date(); const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const startOfWeek = new Date(startOfToday - (startOfToday.getDay()*24*60*60*1000)); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1); const startOfYear = new Date(now.getFullYear(), 0, 1); const sum = l => l.reduce((s,i)=> s + (i.totals?.total || 0), 0); const today = rows.filter(r=> new Date(r.datetime) >= startOfToday); const week = rows.filter(r=> new Date(r.datetime) >= startOfWeek); const month = rows.filter(r=> new Date(r.datetime) >= startOfMonth); const quarter = rows.filter(r=> new Date(r.datetime) >= startOfQuarter); const year = rows.filter(r=> new Date(r.datetime) >= startOfYear); document.getElementById('metric-today').textContent = formatBR(sum(today)); document.getElementById('metric-week').textContent = formatBR(sum(week)); document.getElementById('metric-month').textContent = formatBR(sum(month)); document.getElementById('metric-quarter').textContent = formatBR(sum(quarter)); document.getElementById('metric-year').textContent = formatBR(sum(year)); }

// cash closing
async function closeDay(){ if(!confirm('Confirma fechamento do caixa do dia?')) return; const start = new Date(); start.setHours(0,0,0,0); const res = await supabase.from('sales').select('payload').gte('datetime', start.toISOString()); if(res.error){ alert('Erro obter vendas: '+res.error.message); return; } const rows = (res.data||[]).map(r=> r.payload || r); const totalToday = rows.reduce((s,i)=> s + (i.totals?.total || 0), 0); const closure = { id: 'c_' + Date.now(), date: new Date().toISOString(), total: totalToday, details: rows }; const up = await supabase.from('cash_closures').insert(closure); if(up.error){ alert('Erro salvar fechamento: '+up.error.message); return; } document.getElementById('close-result').textContent = 'Fechamento registrado: ' + formatBR(totalToday); await refreshDashboard(); }

// simulate scan
function simulateScan(code){ const p = (window._POS_PRODUCTS||[]).find(x=>x.barcode===code); if(!p){ alert('Produto não encontrado'); return; } addToCart(p.id); }
