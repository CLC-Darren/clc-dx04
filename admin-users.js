// CLC DX04 權限管理：沿用 YA 的權限模型。
// 兩位初始管理員（Superuser）固定在 header.js 的 ADMIN_WHITELIST；其他 Admin／Viewer 存放於 Firestore admin_users/{email}。
// 不把「無權限讀取」誤認為「管理員名單為空」。
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const baseAdmins = (window.ADMIN_WHITELIST || []).map(x => String(x).trim().toLowerCase());
  let busy = false;
  let canEdit = false; // 只有 admin 可編輯；viewer 為唯讀

  function baseRows(records, loaded) {
    const rows = [];
    const used = new Set();
    // 初始管理員永遠顯示：不依賴 Firestore 查詢成功才呈現。
    baseAdmins.forEach(email => {
      rows.push({email, bootstrap:true, active:true, role:'superuser', known:loaded});
      used.add(email);
    });
    if (records) {
      [...records.values()].sort((a,b)=>a.email.localeCompare(b.email)).forEach(data => {
        if (used.has(data.email)) return;
        rows.push({...data,bootstrap:false,known:true});
      });
    }
    return rows;
  }

  function showRows(records, loaded) {
    const rows = baseRows(records, loaded);
    const editable = loaded && canEdit;
    $('usersCount').textContent = `${rows.length} 位管理員`;
    $('usersList').innerHTML = rows.map(u => {
      const active = u.bootstrap || u.active === true;
      return `<div class="rounded-xl border border-slate-700 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold break-all">${esc(u.email)}</div>
          <div class="text-xs text-slate-400 mt-1">${u.bootstrap ? '🔒 Superuser · 永久保留（不可刪除、不可降權）' : ((u.role==='viewer'?'檢視者（唯讀）':'管理員')+(active?' · 已啟用':' · 已停用'))}</div>
        </div>
        ${u.bootstrap?'':`<div class="flex flex-wrap items-center gap-2 sm:justify-end"><button type="button" class="rounded-md px-2.5 py-1.5 border border-slate-600 text-xs text-teal-300" data-role="${esc(u.email)}" ${editable?'':'disabled'}>${u.role==='viewer'?'改為管理員':'改為檢視者'}</button><button type="button" class="rounded-md px-2.5 py-1.5 border border-slate-600 text-xs ${active?'text-rose-400':'text-emerald-400'}" data-toggle="${esc(u.email)}" ${editable?'':'disabled'}>${active?'停用':'啟用'}</button><button type="button" class="rounded-md px-2.5 py-1.5 border border-rose-700/70 text-xs text-rose-400 hover:bg-rose-500/10" data-delete="${esc(u.email)}" ${editable?'':'disabled'} title="永久移除 ${esc(u.email)} 的管理員權限">刪除</button></div>`}
      </div>`;
    }).join('');
    if (!loaded) return;
    // 僅允許刪除新增的管理員；初始兩位不顯示刪除按鈕，Rules 也禁止刪除。
    $('usersList').querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy)return;
      const email=el.dataset.delete;
      const row=rows.find(r=>r.email===email);
      if(!row || row.bootstrap)return;
      if(!confirm(`確定永久刪除管理員「${email}」？\n\n將移除其後台權限；日後如需恢復，必須重新新增。`))return;
      busy=true;el.disabled=true;
      $('usersListStatus').textContent=`正在刪除 ${email}…`;
      try {
        await window.db.collection('admin_users').doc(email).delete();
        await render();
        $('usersListStatus').textContent=`已刪除 ${email} 的管理員設定。`;
      }catch(e){
        alert('刪除失敗：'+e.message);
        await render();
      }finally{busy=false;}
    }));
    // 變更權限等級（管理員 <-> 檢視者）。
    $('usersList').querySelectorAll('[data-role]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy||!canEdit)return;
      const row=rows.find(r=>r.email===el.dataset.role);
      if(!row||row.bootstrap)return;
      const next=row.role==='viewer'?'admin':'viewer';
      if(!confirm(`確定將「${row.email}」改為${next==='viewer'?'檢視者（唯讀）':'管理員（可編輯）'}？`))return;
      busy=true;el.disabled=true;
      try{
        await window.db.collection('admin_users').doc(row.email).update({role:next,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        await render();
        $('usersListStatus').textContent='權限等級已更新，對方需重新整理以同步畫面。';
      }catch(e){alert('權限等級更新失敗：'+e.message);await render();}
      finally{busy=false;}
    }));
    $('usersList').querySelectorAll('[data-toggle]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy)return;
      const row=rows.find(r=>r.email===el.dataset.toggle);
      if(!row || row.bootstrap || !confirm(`確定要${row.active?'停用':'啟用'}「${row.email}」？`)) return;
      busy=true;el.disabled=true;
      try {
        await window.db.collection('admin_users').doc(row.email).update({active:!row.active,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        await render();
        $('usersListStatus').textContent='管理員權限已更新，對方需重新整理以同步畫面。';
      }catch(e){alert('權限更新失敗：'+e.message);await render();}
      finally{busy=false;}
    }));
  }

  async function render() {
    const roleNow = (window.auth && window.auth.currentUser) ? await window.clcGetAdminRole(window.auth.currentUser) : null;
    canEdit = roleNow === 'admin';
    if(!roleNow) {
      $('access').classList.remove('hidden');
      $('access').textContent='請先從右上角使用已授權的 Google 管理員帳號登入。';
      $('mainPanel').classList.add('hidden');
      return;
    }
    $('access').classList.add('hidden');
    $('mainPanel').classList.remove('hidden');
    $('addForm').classList.toggle('hidden', !canEdit);
    $('viewerNote').classList.toggle('hidden', canEdit);
    // 即使 Firestore 權限尚未開放，也要先顯示初始管理員。
    showRows(null,false);
    $('usersListStatus').textContent='正在讀取 Firestore 管理員名單…';
    try {
      const snap=await window.db.collection('admin_users').get();
      const records=new Map(snap.docs.map(d=> {
        const email=d.id.trim().toLowerCase();
        const data = d.data() || {};
        return [email,{...data,email,active:data.active !== false}];
      }));
      showRows(records,true);
      $('usersListStatus').textContent='新管理員使用相同 Google Email 登入。';
    }catch(e){
      showRows(null,false);
      $('usersListStatus').innerHTML='<span class="text-amber-400 font-semibold">Firestore 權限尚未設定：</span>初始管理員仍可登入，但無法讀取其他管理員。請在 Firebase Console 發布 firestore.rules。錯誤：'+esc(e.message);
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('addForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(busy || !canEdit)return;
      const input=$('newEmail');
      const email=input.value.trim().toLowerCase();
      if(!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)){alert('請輸入有效的 Google 帳號 Email。');return;}
      if(baseAdmins.includes(email)){alert('這個帳號已是初始管理員（Superuser）。');return;}
      busy=true;
      try {
        const ref=window.db.collection('admin_users').doc(email);
        const old=await ref.get();
        if(old.exists){alert('管理員已存在，請在下方名單啟用或調整權限。');return;}
        const newRole=$('newRole').value==='viewer'?'viewer':'admin';
        await ref.set({role:newRole,active:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        input.value='';
        await render();
        alert('管理員已新增：'+email+'\n對方可使用此 Google 帳號登入。');
      }catch(e){alert('新增失敗：'+e.message+'\n請先在 Firebase Console 發布 firestore.rules。');await render();}
      finally{busy=false;}
    });
    window.addEventListener('clc-admin-changed',render);
    render();
  });
})();
