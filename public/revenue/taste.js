'use strict';
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const options = {
    contract: { title:'مراجعة عقد تجاري', scope:'مراجعة عقد واحد، ملاحظات مكتوبة، وجلسة شرح.', deliverable:'مراجعة واحدة + جلسة شرح', delivery:'٥ أيام عمل', amount:2500, image:'offer-preview.png', caption:'نطاق الخدمة ومقابلها في عرض واحد.' },
    consult: { title:'استشارة متخصصة', scope:'جلسة متخصصة يقدّمها المحامي بعد التحضير.', deliverable:'جلسة واحدة لمدة ٤٥ دقيقة', delivery:'الموعد المتفق عليه', amount:500, image:'pricing-preview.png', caption:'تكلفة واضحة، قبل تقديم السعر.' },
    retainer: { title:'باقة استشارات منشآت', scope:'رصيد ساعات محدد وخدمات يعتمدها المكتب.', deliverable:'حتى ١٠ ساعات شهريًا', delivery:'خلال شهر الخدمة', amount:4500, image:'followup-preview.png', caption:'مثال إداري لمتابعة العروض والخطوة التالية.' }
  };
  document.querySelectorAll('[data-preset]').forEach(button => {
    button.addEventListener('click', () => {
      const value = button.dataset.preset;
      const item = options[value];
      document.querySelectorAll('[data-preset]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      const service = document.getElementById('service');
      service.value = value;
      service.dispatchEvent(new Event('change',{bubbles:true}));
      for (const key of ['title','scope','deliverable','delivery']) document.getElementById('hero-'+(key==='title'?'service-title':key)).textContent = item[key];
      const amount = document.getElementById('hero-amount');
      amount.replaceChildren(document.createTextNode(new Intl.NumberFormat('ar-SA').format(item.amount)+' '));
      const unit = document.createElement('small'); unit.textContent = 'ر.س'; amount.append(unit);
      const preview = document.getElementById('service-preview');
      preview.src = 'assets/'+item.image;
      document.getElementById('preview-caption').textContent = item.caption;
      if (!reduced) {
        preview.animate([{opacity:0.5,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'ease-out'});
        document.querySelector('.hero-document').animate([{transform:'translateY(8px)'},{transform:'translateY(0)'}],{duration:300});
      }
    });
  });
  if (reduced) return;
  const entrants = document.querySelectorAll('.hero-copy h1,.hero-copy .lead,.hero-copy .actions,.hero-document,.folio-back,.folio-tab,.section-head h2,.story-section h2,.story-copy p,.service-index h2,.service-choices button,.preview-stage,.outcomes figure,.video-layout h2,.video-frame,.plan-layout h2,.plan-card,.faq h2,.faq details,.footer-wordmark');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.animate([{transform:'translateY(24px)',opacity:0.2},{transform:'translateY(0)',opacity:1}],{duration:650,easing:'cubic-bezier(.2,.7,.3,1)',delay:Number(entry.target.dataset.motionDelay)||0});
      observer.unobserve(entry.target);
    }),{threshold:0.12});
    entrants.forEach((element,index) => { element.dataset.motionDelay = String(index%3*70); observer.observe(element); });
  }
  const stage = document.querySelector('.folio-stage');
  const documentCard = document.querySelector('.hero-document');
  if (stage && matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let frame;
    stage.addEventListener('pointermove',event => {
      if (frame) cancelAnimationFrame(frame);
      const rect = stage.getBoundingClientRect();
      const x = (event.clientX-rect.left)/rect.width-.5;
      const y = (event.clientY-rect.top)/rect.height-.5;
      frame = requestAnimationFrame(() => { documentCard.style.transform = `perspective(1100px) rotateY(${x*5}deg) rotateX(${-y*4}deg)`; });
    });
    stage.addEventListener('pointerleave',() => { if(frame)cancelAnimationFrame(frame);documentCard.style.transform=''; });
  }
})();
