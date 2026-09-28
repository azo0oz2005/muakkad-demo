'use strict';
let csrf='';
fetch('/api/csrf').then(r=>r.json()).then(x=>{csrf=x.token;if(x.user)location.href=x.user.role==='owner_admin'?'/admin':'/dashboard';});
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();const error=document.getElementById('error');error.textContent='';const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});const x=await r.json();if(!r.ok){error.textContent=x.error;return}location.href=x.role==='owner_admin'?'/admin':'/dashboard';});
