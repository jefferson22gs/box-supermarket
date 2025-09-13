// Simplified extended POS frontend using Supabase
const $ = sel => document.querySelector(sel);
const formatBR = v => 'R$ ' + Number(v).toFixed(2).replace('.',',');

const SUPA = window.__SUPABASE_CONFIG || {};
// CORREÇÃO: Renomeado para 'supabaseClient' para evitar conflito de nomes e erros futuros.
const supabaseClient = supabase.createClient(SUPA.SUPABASE_URL, SUPA.SUPABASE_ANON_KEY);

let cart = [];
let lastReceiptHTML = '';

document.addEventListener('DOMContentLoaded', async ()=>{
  document.querySelectorAll('.tabs button').forEach(btn=>{
    btn.onclick = ()=> {
      document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab || btn.getAttribute('data-tab');
      document.querySelectorAll('.screen').forEach(s=> s.style.display = 'none');
      if(tab === 'reports') {
        document.getElementById('screen-dashboard').style.display = 'block';
      } else if (tab === 'settings') {
        document.getElementById('screen-settings').style.display = 'block';
      } else {
        document.getElementById('screen-pos').style.display = 'block';
      }
    };
  });

  document.getElementById('open-login-btn').onclick = ()=> $('#login-modal').setAttribute('aria-hidden','false');
  document.getElementById('close-login-modal').onclick = ()=> $('#login-modal').setAttribute('aria-hidden','true');
  document.getElementById('login-form').onsubmit = login;
  document.getElementById('open-owner-btn').onclick = ()=> $('#owner-modal').setAttribute('aria-hidden','false');
  document.getElementById('close-owner-modal').onclick = ()=> $('#owner-modal').setAttribute('aria-hidden','true');
  document.getElementById('owner-form').onsubmit = saveStoreInfo;
  document.getElementById('open-operators-btn').onclick = ()=> { listOperators(); $('#operators-modal').setAttribute('aria-hidden','false'); };
  document.getElementById('close-operators-modal').onclick = ()=> $('#operators-modal').setAttribute('aria-hidden','true');
  document.getElementById('operator-form').onsubmit = createOperator;
  document.getElementById('search').addEventListener('input', (e)=> renderProducts(e.target.value));
  document.getElementById('scan-sim').onclick = ()=> { const code = prompt('Código de barras:'); if(code) simulateScan(code); };
  document.getElementById('complete-sale').onclick = completeSale;
  document.getElementById('print-last-receipt').onclick = printLastReceipt;
  document.getElementById('close-day-btn').onclick = closeDay;

  await ensureAuthState();
  await loadStoreInfo();
  await loadProducts();
  await loadCashflow();
  await refreshDashboard();
});

// AUTH helpers
async function ensureAuthState(){
  const { data: { user } } = await supabaseClient.auth.getUser().catch(()=>({data:{user:null}}));
  updateUserInfo(user);
  supabaseClient.auth.onAuthStateChange((event, session) => {
    updateUserInfo(session?.user || null);
  });
}
function updateUserInfo(user){
  $('#user-info').textContent = user ? user.email : 'Não autenticado';
}
async function login(e){
  e.preventDefault();
  const email = $('#login-email').value, pass = $('#login-pass').value;
  const { error, data } = await supabaseClient.auth.signInWithPassword({email, password: pass});
  if(error){ alert('Erro login: '+error.message); return; }
  alert('Logado: ' + (data?.user?.email || ''));
  $('#login-modal').setAttribute('aria-hidden','true');
  await loadProducts(); await loadCashflow(); await loadStoreInfo(); await refreshDashboard();
}

// STORE INFO
async function loadStoreInfo(){
  const res = await supabaseClient.from('store_info').select('*').limit(1).single().catch(()=>({data:null}));
  if(res && res.data){ window._STORE = res.data; const pv = $('#store-preview'); pv.innerHTML = ''; if(res.data.logo_base64){ const img = document.createElement('img'); img.src = res.data.logo_base64; img.style.maxWidth='120px'; pv.appendChild(img); } pv.appendChild(document.createTextNode((res.data.name||'') + (res.data.cnpj? ' • CNPJ: '+res.data.cnpj: ''))); } else { window._STORE = null; $('#store-preview').textContent = 'Nenhum registro do mercado.'; }
}
function toBase64(file){ return new Promise((res, rej)=>{ const reader = new FileReader(); reader.onload = ()=> res(reader.result); reader.onerror = err => rej(err); reader.readAsDataURL(file); }); }
async function saveStoreInfo(e){ e.preventDefault(); const id='store'; const name=$('#store-name').value.
