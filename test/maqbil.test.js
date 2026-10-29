'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {requestPrice,bookingUnavailable,SERVICES}=require('../src/maqbil');
const {activationToken,activationUserId}=require('../src/office-activation');
test('office activation validates signature, expiry and user identity',()=>{
 const secret='test-signing-key-only',user={id:'12',setup_expires_at:new Date(Date.now()+60000)};
 const token=activationToken(user,secret);
 assert.equal(activationUserId(token,secret),'12');
 assert.equal(activationUserId(token,'other-key'),null);
 assert.equal(activationUserId(token,secret,Date.now()+120000),null);
 assert.equal(activationUserId(token+'x',secret),null);
 assert.equal(activationUserId('invalid',secret),null);
});
test('Maqbil fees are computed by server, including reduced labor fee and quoted services',()=>{
 assert.equal(requestPrice('consultation','labor','',{price:200}),150);
 assert.equal(requestPrice('consultation','traffic','',{price:200}),200);
 assert.equal(requestPrice('service','','إفراغ أرض',{}),500);
 assert.equal(requestPrice('service','','الوكالات',{}),null);
 assert.ok(SERVICES.notarization.includes('وكالة من مقر التوقيف بالدوادمي'));
});
test('Maqbil cannot receive requests in flight mode or while administratively unavailable',()=>{
 const office={active:true,plan_status:'active',preview_only:false,bookings_paused:false};
 assert.equal(bookingUnavailable(office),false);
 for(const state of [{bookings_paused:true},{preview_only:true},{active:false},{plan_status:'paused'}])assert.equal(bookingUnavailable({...office,...state}),true);
 assert.equal(bookingUnavailable(null),true);
});
