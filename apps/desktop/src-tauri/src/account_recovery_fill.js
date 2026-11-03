(() => {
  if (location.origin !== 'https://auth.openai.com' || window.top !== window) return;
  if (window.__interludeRecoveryStarted) return;
  window.__interludeRecoveryStarted = true;
  const secret = __INTERLUDE_SECRET__;
  let attempts = 0;
  const seen = new Set();
  const timer = setInterval(() => {
    if (location.origin !== 'https://auth.openai.com') { clearInterval(timer); return; }
    const visible = el => el && el.getClientRects().length && !el.disabled;
    if (++attempts > 120 || [...document.querySelectorAll('iframe')].some(el => visible(el) && /captcha|challenges\.cloudflare/.test(el.src))) {
      clearInterval(timer); location.href = 'interlude-recovery://takeover'; return;
    }
    const password = document.querySelector('input[type="password"]');
    const email = document.querySelector('input[type="email"],input[name="username"]');
    const otp = document.querySelector('input[autocomplete="one-time-code"],input[name="code"],input[name="otp"]');
    const authenticator = /authenticator|验证器|身分驗證器/i.test(document.body.innerText);
    if (visible(otp) && authenticator && Date.now() >= secret.expiresAt) {
      clearInterval(timer); window.__interludeRecoveryStarted = false;
      location.href = 'interlude-recovery://refresh'; return;
    }
    let input, value, stage;
    if (visible(password)) { input=password;value=secret.password;stage='password'; }
    else if (visible(email)) { input=email;value=secret.email;stage='email'; }
    else if (visible(otp) && authenticator && Date.now() < secret.expiresAt) { input=otp;value=secret.code;stage='totp'; }
    else return;
    if (seen.has(stage)) return;
    const form=input.closest('form');
    const submit=form?.querySelector('button[type="submit"],input[type="submit"]');
    if (!visible(submit)) return;
    seen.add(stage);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    location.href = `interlude-recovery://progress/${stage}`;
    submit.click();
  },500);
  setTimeout(()=>clearInterval(timer),61000);
})();
